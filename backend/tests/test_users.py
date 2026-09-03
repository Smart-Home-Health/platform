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
"""User-management routes — admin password reset and the PUT update handler.

Covers POST /api/users/{id}/reset-password (new, system-admin only) and the
PUT /api/users/{id} fix that lets full_name/email/is_active/pin actually save.
"""
import bcrypt
import pytest


@pytest.fixture
def target_user(db_session, account):
    """A plain non-admin user to act upon (reset password / edit)."""
    from crud.users import create_user
    user = create_user(
        db_session, username="target_test", password="origpass123",
        full_name="Target Test", email="target@example.com",
        is_system_admin=False, role_ids=None, force_password_reset=False,
    )
    user.account_id = account.id
    db_session.commit()
    db_session.refresh(user)
    return user


def _reload(db_session, user_id):
    from crud.users import get_user_by_id
    db_session.expire_all()
    return get_user_by_id(db_session, user_id)


# --- POST /api/users/{id}/reset-password ------------------------------------
def test_admin_reset_password_changes_password(admin_client, db_session, target_user):
    resp = admin_client.post(
        f"/api/users/{target_user.id}/reset-password",
        json={"new_password": "brandnewpass1"},
    )
    assert resp.status_code == 200, resp.text

    user = _reload(db_session, target_user.id)
    assert bcrypt.checkpw(b"brandnewpass1", user.password_hash.encode())
    assert not bcrypt.checkpw(b"origpass123", user.password_hash.encode())
    # Default require_change=False must NOT flag a forced reset.
    assert user.force_password_reset is False


def test_admin_reset_password_with_require_change(admin_client, db_session, target_user):
    resp = admin_client.post(
        f"/api/users/{target_user.id}/reset-password",
        json={"new_password": "brandnewpass1", "require_change": True},
    )
    assert resp.status_code == 200, resp.text
    assert _reload(db_session, target_user.id).force_password_reset is True


def test_reset_password_rejects_short_password(admin_client, target_user):
    resp = admin_client.post(
        f"/api/users/{target_user.id}/reset-password",
        json={"new_password": "short"},
    )
    assert resp.status_code == 422


def test_reset_password_unknown_user_404(admin_client):
    resp = admin_client.post(
        "/api/users/999999/reset-password",
        json={"new_password": "brandnewpass1"},
    )
    assert resp.status_code == 404


def test_reset_password_requires_system_admin(limited_client, target_user):
    resp = limited_client.post(
        f"/api/users/{target_user.id}/reset-password",
        json={"new_password": "brandnewpass1"},
    )
    assert resp.status_code == 403


def test_reset_password_requires_auth(client, target_user):
    resp = client.post(
        f"/api/users/{target_user.id}/reset-password",
        json={"new_password": "brandnewpass1"},
    )
    assert resp.status_code == 401


# --- PUT /api/users/{id} (regression for the broken update handler) ---------
def test_update_user_saves_details(admin_client, db_session, target_user):
    resp = admin_client.put(
        f"/api/users/{target_user.id}",
        json={"full_name": "Renamed Person", "email": "renamed@example.com", "is_active": False},
    )
    assert resp.status_code == 200, resp.text

    user = _reload(db_session, target_user.id)
    assert user.full_name == "Renamed Person"  # was clobbered with the schema object before the fix
    assert user.email == "renamed@example.com"
    assert user.is_active is False


def test_update_user_sets_pin(admin_client, db_session, target_user):
    assert target_user.pin_hash is None
    resp = admin_client.put(
        f"/api/users/{target_user.id}",
        json={"full_name": "Target Test", "pin": "4321"},
    )
    assert resp.status_code == 200, resp.text

    user = _reload(db_session, target_user.id)
    assert user.pin_hash is not None
    assert bcrypt.checkpw(b"4321", user.pin_hash.encode())


def test_update_user_rejects_non_digit_pin(admin_client, target_user):
    resp = admin_client.put(
        f"/api/users/{target_user.id}",
        json={"full_name": "Target Test", "pin": "abcd"},
    )
    assert resp.status_code == 422


# --- GET /api/users/{id}/activity -------------------------------------------
def _audit(db_session, user_id, action, details=None, minutes_ago=0):
    import json as _json
    from datetime import datetime, timedelta
    from models.users import AuditLog
    entry = AuditLog(
        user_id=user_id,
        action=action,
        details=_json.dumps(details) if details is not None else None,
        timestamp=datetime.utcnow() - timedelta(minutes=minutes_ago),
    )
    db_session.add(entry)
    db_session.commit()
    return entry


def test_activity_returns_the_users_own_events(admin_client, db_session, target_user):
    _audit(db_session, target_user.id, "login.success", {"method": "password"}, minutes_ago=5)
    _audit(db_session, target_user.id, "pin_auth.success", {"method": "pin"}, minutes_ago=1)

    resp = admin_client.get(f"/api/users/{target_user.id}/activity")
    assert resp.status_code == 200, resp.text
    actions = [e["action"] for e in resp.json()]
    # Newest first.
    assert actions == ["pin_auth.success", "login.success"]
    assert all(e["actor_name"] is None for e in resp.json())


def test_activity_includes_admin_actions_naming_this_user(
    admin_client, admin_user, db_session, target_user
):
    _audit(
        db_session, admin_user.id, "user.password_reset.admin_set",
        {"target_user_id": target_user.id, "username": target_user.username},
    )

    entries = admin_client.get(f"/api/users/{target_user.id}/activity").json()
    assert [e["action"] for e in entries] == ["user.password_reset.admin_set"]
    assert entries[0]["actor_name"] == "Admin Test"


def test_activity_excludes_admin_actions_aimed_at_someone_else(
    admin_client, admin_user, db_session, target_user
):
    # The admin resetting a third party's password is logged against the admin;
    # it must not surface on the admin's own page as something done to them.
    _audit(
        db_session, admin_user.id, "user.password_reset.admin_set",
        {"target_user_id": target_user.id},
    )
    _audit(db_session, admin_user.id, "login.success", {"method": "password"})

    entries = admin_client.get(f"/api/users/{admin_user.id}/activity").json()
    assert [e["action"] for e in entries] == ["login.success"]


def test_activity_honours_limit(admin_client, db_session, target_user):
    for i in range(6):
        _audit(db_session, target_user.id, "login.success", minutes_ago=i)

    assert len(admin_client.get(f"/api/users/{target_user.id}/activity?limit=3").json()) == 3


def test_activity_readable_by_the_user_themselves(client, db_session, account, target_user):
    from tests.conftest import _auth
    _audit(db_session, target_user.id, "login.success")

    own_client = _auth(client, target_user, account)
    resp = own_client.get(f"/api/users/{target_user.id}/activity")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_activity_denied_without_users_read(limited_client, target_user):
    assert limited_client.get(f"/api/users/{target_user.id}/activity").status_code == 403


def test_activity_unknown_user_404(admin_client):
    assert admin_client.get("/api/users/999999/activity").status_code == 404
