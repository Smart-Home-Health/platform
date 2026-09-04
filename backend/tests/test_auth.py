# Smart Home Health
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""Wave 1 — authentication & access control.

Exercises the middleware allowlist, JWT verification, and the auth-level /
read-restriction dependencies. Also proves the harness end-to-end (DB,
migrations, seeding, transactional isolation, token minting).
"""


# --- Public routes -----------------------------------------------------------
def test_first_run_is_public(client):
    """/api/auth/first-run is in the middleware allowlist -> reachable w/o auth."""
    resp = client.get("/api/auth/first-run")
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


def test_first_run_skip_account_password_defaults_false(client, monkeypatch):
    monkeypatch.delenv("SHH_SKIP_ACCOUNT_PASSWORD", raising=False)
    resp = client.get("/api/auth/first-run")
    assert resp.json()["skip_account_password"] is False


def test_first_run_skip_account_password_reflects_env(client, monkeypatch):
    """The flag is read per-request, so the HA add-on option can toggle it."""
    monkeypatch.setenv("SHH_SKIP_ACCOUNT_PASSWORD", "1")
    resp = client.get("/api/auth/first-run")
    assert resp.json()["skip_account_password"] is True


# --- Unauthenticated access to protected routes ------------------------------
def test_protected_route_requires_auth(client):
    resp = client.get("/api/patients")
    assert resp.status_code == 401
    body = resp.json()
    assert body.get("requires_auth") is True


def test_invalid_bearer_token_rejected(client):
    client.headers.update({"Authorization": "Bearer not.a.real.token"})
    resp = client.get("/api/patients")
    assert resp.status_code == 401


# --- Authenticated happy path ------------------------------------------------
def test_admin_can_list_patients(admin_client):
    resp = admin_client.get("/api/patients")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# --- Auth-level gating -------------------------------------------------------
def test_account_level_token_cannot_use_user_routes(account_client):
    """An account-level token (no user selected) lacks user_id -> 401 from
    get_current_user on user-scoped routes."""
    resp = account_client.get("/api/patients")
    assert resp.status_code == 401


# --- Read-restriction gating -------------------------------------------------
def test_read_restricted_blocked_from_reading(client, admin_user, account):
    """A read-restricted session may add/chart but not read sensitive data;
    require_read_access -> 403 (independent of the target id)."""
    from routes.auth import create_access_token
    token = create_access_token(
        user=admin_user, account=account, auth_level="full", read_restricted=True
    )
    resp = client.get("/api/patients/999999", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


# --- Isolation sanity: data created in one test isn't visible in another -----
def test_isolation_no_leaked_patients(admin_client):
    """If transactional rollback works, the patient list starts empty here even
    though other tests create accounts/users."""
    resp = admin_client.get("/api/patients")
    assert resp.status_code == 200
    assert resp.json() == []


# --- Cookie Secure flag derives from request scheme (HTTPS work) -------------
def _login_cookie_header(base_url, db_session, admin_user):
    from fastapi.testclient import TestClient
    from main import app
    c = TestClient(app, base_url=base_url)
    resp = c.post("/api/auth/login", json={
        "username": "admin_test", "password": "adminpass",
    })
    assert resp.status_code == 200, resp.text
    return resp.headers.get("set-cookie", "")


def test_cookie_not_secure_over_http(client, db_session, admin_user):
    header = _login_cookie_header("http://testserver", db_session, admin_user)
    assert "session_token=" in header
    assert "secure" not in header.lower()


def test_cookie_secure_over_https(client, db_session, admin_user):
    header = _login_cookie_header("https://testserver", db_session, admin_user)
    assert "session_token=" in header
    assert "secure" in header.lower()


# --- X-Forwarded-For only trusted behind a declared proxy --------------------
class _FakeRequest:
    def __init__(self, headers=None, peer="10.0.0.9"):
        self.headers = headers or {}

        class _Client:
            host = peer

        self.client = _Client()


def test_xff_ignored_without_proxy_flag(monkeypatch):
    from utils.client_ip import get_client_ip
    monkeypatch.delenv("SHH_BEHIND_PROXY", raising=False)
    req = _FakeRequest(headers={"X-Forwarded-For": "1.2.3.4"})
    assert get_client_ip(req) == "10.0.0.9"


def test_xff_honored_with_proxy_flag(monkeypatch):
    from utils.client_ip import get_client_ip
    monkeypatch.setenv("SHH_BEHIND_PROXY", "1")
    req = _FakeRequest(headers={"X-Forwarded-For": "1.2.3.4, 5.6.7.8"})
    assert get_client_ip(req) == "1.2.3.4"


def test_no_xff_falls_back_to_peer(monkeypatch):
    from utils.client_ip import get_client_ip
    monkeypatch.setenv("SHH_BEHIND_PROXY", "1")
    assert get_client_ip(_FakeRequest()) == "10.0.0.9"


# --- Per-user UI preferences ---------------------------------------------------
def test_preferences_patch_theme(admin_client):
    resp = admin_client.patch("/api/auth/preferences", json={"preferences": {"theme": "light"}})
    assert resp.status_code == 200, resp.text
    assert resp.json()["preferences"]["theme"] == "light"


def test_preferences_shallow_merge_keeps_other_keys(admin_client):
    admin_client.patch("/api/auth/preferences", json={"preferences": {"theme": "system"}})
    resp = admin_client.patch("/api/auth/preferences", json={"preferences": {"contrast": "high"}})
    assert resp.status_code == 200, resp.text
    assert resp.json()["preferences"] == {"theme": "system", "contrast": "high"}


def test_preferences_rejects_unknown_value(admin_client):
    resp = admin_client.patch("/api/auth/preferences", json={"preferences": {"theme": "neon"}})
    assert resp.status_code == 422


def test_preferences_rejects_unknown_key(admin_client):
    resp = admin_client.patch("/api/auth/preferences", json={"preferences": {"font": "huge"}})
    assert resp.status_code == 422


def test_session_echoes_preferences(admin_client):
    admin_client.patch("/api/auth/preferences", json={"preferences": {"contrast": "high"}})
    resp = admin_client.get("/api/auth/session")
    assert resp.status_code == 200
    assert resp.json()["preferences"]["contrast"] == "high"
