# Smart Home Health Hub
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
