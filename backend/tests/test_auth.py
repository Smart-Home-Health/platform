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
