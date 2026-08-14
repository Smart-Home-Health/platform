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
"""
HA ingress identity: trust gating, auto-login, and the admin mapping API.

TestClient's socket peer is the literal string "testclient", so trusting the
ingress peer in a test means SHH_INGRESS_TRUSTED_PEERS=testclient; with the
default (172.30.32.2) the same request models a LAN client forging the
X-Remote-User-* headers — which must be rejected.
"""
import pytest

HA_ID = "a" * 32
HA_ID_2 = "b" * 32

HEADERS = {
    "X-Remote-User-Id": HA_ID,
    "X-Remote-User-Name": "eli_dad",
    "X-Remote-User-Display-Name": "Eli's Dad",
}


@pytest.fixture
def ingress_env(monkeypatch):
    """Model running as the HA add-on with the TestClient as the ingress peer."""
    monkeypatch.setenv("SHH_INGRESS", "1")
    monkeypatch.setenv("SHH_INGRESS_TRUSTED_PEERS", "testclient")


# ---------------------------------------------------------------- trust gating

def test_login_403_outside_addon(client, account, monkeypatch):
    """No SHH_INGRESS (Compose deployments): forged headers are inert."""
    monkeypatch.delenv("SHH_INGRESS", raising=False)
    r = client.post("/api/auth/ha/login", headers=HEADERS)
    assert r.status_code == 403


def test_login_403_from_untrusted_peer(client, account, monkeypatch):
    """The LAN-port forgery case: add-on mode, but the peer isn't the ingress
    proxy — client-supplied identity headers must be rejected."""
    monkeypatch.setenv("SHH_INGRESS", "1")
    monkeypatch.delenv("SHH_INGRESS_TRUSTED_PEERS", raising=False)  # default 172.30.32.2
    r = client.post("/api/auth/ha/login", headers=HEADERS)
    assert r.status_code == 403


def test_login_403_when_option_disabled(client, account, ingress_env, monkeypatch):
    monkeypatch.setenv("SHH_HA_IDENTITY_LOGIN", "0")
    r = client.post("/api/auth/ha/login", headers=HEADERS)
    assert r.status_code == 403


def test_spoofed_forwarded_for_does_not_trust(client, account, monkeypatch):
    """X-Forwarded-For never substitutes for the socket peer."""
    monkeypatch.setenv("SHH_INGRESS", "1")
    monkeypatch.delenv("SHH_INGRESS_TRUSTED_PEERS", raising=False)
    r = client.post(
        "/api/auth/ha/login",
        headers={**HEADERS, "X-Forwarded-For": "172.30.32.2"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------- login flows

def test_unmapped_identity_gets_account_session(client, account, ingress_env, db_session):
    r = client.post("/api/auth/ha/login", headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["mapped"] is False
    assert body["auth_level"] == "account"
    assert body["user"] is None
    assert body["read_restricted"] is False
    assert body["identity"]["ha_user_id"] == HA_ID
    assert body["access_token"]
    assert "session_token" in client.cookies
    assert "account_token" in client.cookies

    # The public session endpoint agrees with what we minted.
    s = client.get("/api/auth/session").json()
    assert s["auth_level"] == "account"
    assert not s.get("user_id")

    from models.ha_identity import HASeenIdentity
    row = db_session.query(HASeenIdentity).filter_by(ha_user_id=HA_ID).one()
    assert row.username == "eli_dad"
    assert row.display_name == "Eli's Dad"


def test_seen_identity_refreshed_on_next_login(client, account, ingress_env, db_session):
    client.post("/api/auth/ha/login", headers=HEADERS)
    client.post("/api/auth/ha/login", headers={
        "X-Remote-User-Id": HA_ID,
        "X-Remote-User-Display-Name": "Renamed",
    })
    from models.ha_identity import HASeenIdentity
    rows = db_session.query(HASeenIdentity).filter_by(ha_user_id=HA_ID).all()
    assert len(rows) == 1
    assert rows[0].display_name == "Renamed"
    assert rows[0].username is None  # header absent on the second call


def test_headers_absent_still_grants_account_level(client, account, ingress_env):
    """Core < 2023.9 sends no identity headers: degrade to account-level."""
    r = client.post("/api/auth/ha/login")
    assert r.status_code == 200
    body = r.json()
    assert body["mapped"] is False
    assert body["identity"] is None
    assert body["auth_level"] == "account"


@pytest.mark.parametrize("bad_id", ["../etc/passwd", "A" * 32, "abc", "a" * 33, "g" * 32])
def test_malformed_id_treated_as_absent(client, account, ingress_env, bad_id, db_session):
    r = client.post("/api/auth/ha/login", headers={"X-Remote-User-Id": bad_id})
    assert r.status_code == 200
    assert r.json()["identity"] is None
    from models.ha_identity import HASeenIdentity
    assert db_session.query(HASeenIdentity).count() == 0


def test_mapped_user_gets_full_session(client, account, admin_user, ingress_env, db_session):
    admin_user.ha_user_id = HA_ID
    db_session.commit()

    r = client.post("/api/auth/ha/login", headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["mapped"] is True
    assert body["auth_level"] == "full"
    assert body["user"]["id"] == admin_user.id
    assert body["read_restricted"] is False

    s = client.get("/api/auth/session").json()
    assert s["user_id"] == admin_user.id
    # Counts as a full-password login: no daily re-prompt.
    assert s.get("requires_full_password") in (False, None)

    db_session.refresh(admin_user)
    assert admin_user.last_full_password_login is not None
    assert admin_user.last_login is not None

    from models.users import AuditLog
    log = db_session.query(AuditLog).filter_by(action="ha.auto_login.success").first()
    assert log is not None and log.user_id == admin_user.id


def test_inactive_mapped_user_falls_back_to_picker(client, account, admin_user, ingress_env, db_session):
    admin_user.ha_user_id = HA_ID
    admin_user.is_active = False
    db_session.commit()
    r = client.post("/api/auth/ha/login", headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["mapped"] is False
    assert r.json()["auth_level"] == "account"


# ---------------------------------------------------------------- /status

def test_status_requires_auth(client, account):
    """The allowlist entry for /ha/login must not leak onto sibling routes."""
    r = client.get("/api/auth/ha/status")
    assert r.status_code == 401


def test_status_reports_identity_and_mapping(admin_client, admin_user, account, ingress_env, db_session):
    admin_user.ha_user_id = HA_ID
    db_session.commit()
    r = admin_client.get("/api/auth/ha/status", headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["ingress_trusted"] is True
    assert body["identity"]["ha_user_id"] == HA_ID
    assert body["mapped_user_id"] == admin_user.id


def test_status_untrusted_peer_shows_nothing(admin_client, account):
    r = admin_client.get("/api/auth/ha/status", headers=HEADERS)
    assert r.status_code == 200
    assert r.json() == {"ingress_trusted": False, "identity": None, "mapped_user_id": None}


def test_tokens_valid_in_non_utc_container(client, admin_user, account, monkeypatch):
    """Regression: the HA add-on container runs in the HA timezone (not UTC).
    A naive utcnow().timestamp() exp re-check in the middleware read naive UTC
    as local time and 401'd every authenticated request there."""
    import time
    monkeypatch.setenv("TZ", "America/New_York")
    time.tzset()
    try:
        from routes.auth import create_access_token
        token = create_access_token(user=admin_user, account=account, auth_level="full")
        r = client.get("/api/auth/ha/identities", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
    finally:
        monkeypatch.delenv("TZ", raising=False)
        time.tzset()


# ---------------------------------------------------------------- admin mapping API

def test_identities_require_auth(client, account):
    """The allowlist entry for /ha/login must not make siblings public."""
    assert client.get("/api/auth/ha/identities").status_code == 401


def test_identities_require_admin(limited_client, account):
    assert limited_client.get("/api/auth/ha/identities").status_code == 403
    assert limited_client.put(
        f"/api/auth/ha/identities/{HA_ID}/link", json={"user_id": 1}
    ).status_code == 403


def test_link_unlink_forget_round_trip(admin_client, admin_user, limited_user, account, ingress_env, db_session):
    # Seed a seen identity via a login, then drop its cookies so the admin
    # Bearer header (not the account-level session cookie) authenticates the
    # rest of the calls.
    admin_client.post("/api/auth/ha/login", headers=HEADERS)
    admin_client.cookies.clear()

    r = admin_client.get("/api/auth/ha/identities")
    assert r.status_code == 200
    items = r.json()
    assert [i["ha_user_id"] for i in items] == [HA_ID]
    assert items[0]["mapped_user"] is None

    # Link → visible in the list.
    r = admin_client.put(f"/api/auth/ha/identities/{HA_ID}/link", json={"user_id": limited_user.id})
    assert r.status_code == 200
    items = admin_client.get("/api/auth/ha/identities").json()
    assert items[0]["mapped_user"]["id"] == limited_user.id

    # Double-link to a different user → 409.
    r = admin_client.put(f"/api/auth/ha/identities/{HA_ID}/link", json={"user_id": admin_user.id})
    assert r.status_code == 409
    # Re-link to the same user is idempotent.
    assert admin_client.put(
        f"/api/auth/ha/identities/{HA_ID}/link", json={"user_id": limited_user.id}
    ).status_code == 200

    # Forget while mapped → 409; unlink → forget succeeds.
    assert admin_client.delete(f"/api/auth/ha/identities/{HA_ID}").status_code == 409
    assert admin_client.delete(f"/api/auth/ha/identities/{HA_ID}/link").status_code == 200
    db_session.refresh(limited_user)
    assert limited_user.ha_user_id is None
    assert admin_client.delete(f"/api/auth/ha/identities/{HA_ID}").status_code == 200
    assert admin_client.get("/api/auth/ha/identities").json() == []

    from models.users import AuditLog
    actions = {l.action for l in db_session.query(AuditLog).all()}
    assert {"ha.identity.link", "ha.identity.unlink"} <= actions


def test_link_validations(admin_client, limited_user, account):
    assert admin_client.put(
        "/api/auth/ha/identities/not-a-hex-id/link", json={"user_id": limited_user.id}
    ).status_code == 400
    assert admin_client.put(
        f"/api/auth/ha/identities/{HA_ID}/link", json={"user_id": 999999}
    ).status_code == 404


def test_link_unseen_identity_creates_seen_row(admin_client, limited_user, account, db_session):
    """Pre-staging a mapping before the HA user ever opens the panel."""
    r = admin_client.put(f"/api/auth/ha/identities/{HA_ID_2}/link", json={"user_id": limited_user.id})
    assert r.status_code == 200
    from models.ha_identity import HASeenIdentity
    assert db_session.query(HASeenIdentity).filter_by(ha_user_id=HA_ID_2).count() == 1
