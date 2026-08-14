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
HA user directory (config/auth/list via Supervisor) + import-as-app-user.

The Core WS client is monkeypatched at the module attribute the route calls
(routes.ha_auth -> utils.ha_core.list_ha_users), so no socket is involved.
"""
import pytest

from utils import ha_core
from utils.ha_core import HACoreError, HADirectoryUser, _users_from_result

HA_OWNER = "a" * 32
HA_NEW = "b" * 32
HA_GONE = "c" * 32  # seen on ingress once, since deleted from HA


def _dir_user(ha_user_id, name, username=None, **kw):
    return HADirectoryUser(
        ha_user_id=ha_user_id, name=name, username=username,
        is_owner=kw.get("is_owner", False), is_active=kw.get("is_active", True),
        local_only=kw.get("local_only", False), is_admin=kw.get("is_admin", False),
    )


@pytest.fixture
def fake_directory(monkeypatch):
    """Patch the directory fetch; returns a dict you can mutate per-test."""
    state = {"users": [], "error": None}

    async def fake_list(timeout: float = 5.0):
        if state["error"]:
            raise state["error"]
        return state["users"]

    monkeypatch.setattr(ha_core, "list_ha_users", fake_list)
    return state


# ---------------------------------------------------------------- parsing unit

def test_users_from_result_filters_and_maps():
    result = [
        {"id": HA_OWNER, "name": "John", "username": "john", "is_owner": True,
         "is_active": True, "group_ids": ["system-admin"]},
        {"id": "d" * 32, "name": "Supervisor", "system_generated": True},
        {"id": HA_NEW, "name": "Nurse Nancy", "group_ids": ["system-users"]},
        {"no_id": True},
    ]
    users = _users_from_result(result)
    assert [u.ha_user_id for u in users] == [HA_OWNER, HA_NEW]
    assert users[0].is_admin is True and users[0].is_owner is True
    assert users[1].is_admin is False


def test_list_ha_users_requires_token(monkeypatch):
    import asyncio
    monkeypatch.delenv("SUPERVISOR_TOKEN", raising=False)
    with pytest.raises(HACoreError):
        asyncio.run(ha_core.list_ha_users())


# ---------------------------------------------------------------- directory route

def test_directory_requires_auth(client, account):
    assert client.get("/api/auth/ha/directory").status_code == 401


def test_directory_forbidden_for_non_admin(limited_client, account):
    assert limited_client.get("/api/auth/ha/directory").status_code == 403


def test_directory_merges_statuses(admin_client, admin_user, account, db_session, fake_directory):
    from models.ha_identity import HASeenIdentity
    fake_directory["users"] = [
        _dir_user(HA_OWNER, "John", "john", is_owner=True, is_admin=True),
        _dir_user(HA_NEW, "Nurse Nancy"),
    ]
    # Owner is linked + seen; Nancy never opened the panel.
    admin_user.ha_user_id = HA_OWNER
    db_session.add(HASeenIdentity(ha_user_id=HA_OWNER, username="john", display_name="John"))
    db_session.commit()

    body = admin_client.get("/api/auth/ha/directory").json()
    assert body["available"] is True
    by_id = {u["ha_user_id"]: u for u in body["users"]}
    assert by_id[HA_OWNER]["status"] == "linked"
    assert by_id[HA_OWNER]["mapped_user"]["id"] == admin_user.id
    assert by_id[HA_OWNER]["ha_is_owner"] is True
    assert by_id[HA_NEW]["status"] == "never_opened"
    assert by_id[HA_NEW]["name"] == "Nurse Nancy"
    assert by_id[HA_NEW]["in_directory"] is True
    # Linked sorts first.
    assert body["users"][0]["ha_user_id"] == HA_OWNER


def test_directory_flags_stale_seen_rows(admin_client, account, db_session, fake_directory):
    from models.ha_identity import HASeenIdentity
    fake_directory["users"] = [_dir_user(HA_OWNER, "John")]
    db_session.add(HASeenIdentity(ha_user_id=HA_GONE, display_name="Old Phone User"))
    db_session.commit()
    body = admin_client.get("/api/auth/ha/directory").json()
    by_id = {u["ha_user_id"]: u for u in body["users"]}
    assert by_id[HA_GONE]["in_directory"] is False
    assert by_id[HA_GONE]["status"] == "seen"


def test_directory_unavailable_falls_back_to_seen(admin_client, account, db_session, fake_directory):
    from models.ha_identity import HASeenIdentity
    fake_directory["error"] = HACoreError("no supervisor")
    db_session.add(HASeenIdentity(ha_user_id=HA_OWNER, display_name="John"))
    db_session.commit()
    r = admin_client.get("/api/auth/ha/directory")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert [u["ha_user_id"] for u in body["users"]] == [HA_OWNER]
    # Fallback mode never flags rows as stale.
    assert body["users"][0]["in_directory"] is True


def test_directory_includes_mapped_but_never_seen(admin_client, admin_user, account, db_session, fake_directory):
    fake_directory["error"] = HACoreError("no supervisor")
    admin_user.ha_user_id = HA_OWNER
    db_session.commit()
    body = admin_client.get("/api/auth/ha/directory").json()
    by_id = {u["ha_user_id"]: u for u in body["users"]}
    assert by_id[HA_OWNER]["status"] == "linked"


# ---------------------------------------------------------------- import route

def _import(client, **overrides):
    payload = {"ha_user_id": HA_NEW, "username": "nancy", "full_name": "Nurse Nancy", "role_ids": []}
    payload.update(overrides)
    return client.post("/api/auth/ha/import", json=payload)


def test_import_creates_passwordless_linked_user(admin_client, admin_user, account, db_session):
    from crud.users import get_role_by_name
    role = get_role_by_name(db_session, "caregiver")
    r = _import(admin_client, role_ids=[role.id])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ha_user_id"] == HA_NEW
    assert [x["name"] for x in body["roles"]] == ["caregiver"]

    from models.users import User, AuditLog
    user = db_session.query(User).filter_by(username="nancy").one()
    assert user.ha_user_id == HA_NEW
    assert user.force_password_reset is False
    assert user.account_id == admin_user.account_id
    from models.ha_identity import HASeenIdentity
    assert db_session.query(HASeenIdentity).filter_by(ha_user_id=HA_NEW).count() == 1
    assert db_session.query(AuditLog).filter_by(action="ha.identity.import").count() == 1


def test_import_then_ingress_login_is_full_session(admin_client, client, account, db_session, monkeypatch):
    monkeypatch.setenv("SHH_INGRESS", "1")
    monkeypatch.setenv("SHH_INGRESS_TRUSTED_PEERS", "testclient")
    assert _import(admin_client).status_code == 201
    client.cookies.clear()
    client.headers.pop("Authorization", None)
    r = client.post("/api/auth/ha/login", headers={"X-Remote-User-Id": HA_NEW})
    assert r.status_code == 200
    body = r.json()
    assert body["mapped"] is True
    assert body["auth_level"] == "full"
    assert body["user"]["username"] == "nancy"


def test_import_validations(admin_client, admin_user, limited_user, account, db_session):
    assert _import(admin_client, ha_user_id="nope").status_code == 400
    limited_user.ha_user_id = HA_NEW
    db_session.commit()
    assert _import(admin_client).status_code == 409
    limited_user.ha_user_id = None
    db_session.commit()
    assert _import(admin_client, username="limited_test").status_code == 400  # taken
    assert _import(admin_client, role_ids=[999999]).status_code == 400


def test_import_requires_admin(limited_client, account):
    assert _import(limited_client).status_code == 403


# ---------------------------------------------------------------- patients account_id fix

def test_created_patient_gets_account_id(admin_client, account, db_session):
    r = admin_client.post("/api/patients", json={"first_name": "Nancy", "last_name": "Ward"})
    assert r.status_code in (200, 201), r.text
    from schemas.patient import Patient
    row = db_session.query(Patient).filter_by(first_name="Nancy", last_name="Ward").one()
    assert row.account_id == account.id


# ---------------------------------------------------------------- patient <- HA login provenance

def test_add_patient_from_ha_login_is_once_only(admin_client, account, db_session, fake_directory):
    fake_directory["error"] = HACoreError("fallback is fine here")
    r = admin_client.post("/api/patients", json={
        "first_name": "Eli", "last_name": "Carty", "ha_user_id": HA_NEW,
    })
    assert r.status_code in (200, 201), r.text
    from schemas.patient import Patient
    row = db_session.query(Patient).filter_by(ha_user_id=HA_NEW).one()
    assert row.first_name == "Eli"

    # Same HA login again -> 409, whether creating or retargeting another patient.
    r = admin_client.post("/api/patients", json={
        "first_name": "Eli", "last_name": "Again", "ha_user_id": HA_NEW,
    })
    assert r.status_code == 409

    # The directory surfaces the patient so the UI can hide the button.
    body = admin_client.get("/api/auth/ha/directory").json()
    by_id = {u["ha_user_id"]: u for u in body["users"]}
    assert by_id[HA_NEW]["patient"] == {"id": row.id, "first_name": "Eli", "last_name": "Carty"}


def test_patient_ha_user_id_must_be_valid(admin_client, account):
    r = admin_client.post("/api/patients", json={
        "first_name": "Bad", "last_name": "Id", "ha_user_id": "Z" * 32,
    })
    assert r.status_code == 400


def test_existing_patient_can_be_retro_linked(admin_client, account, db_session):
    r = admin_client.post("/api/patients", json={"first_name": "Old", "last_name": "Record"})
    pid = r.json()["id"]
    r = admin_client.put(f"/api/patients/{pid}", json={"ha_user_id": HA_NEW})
    assert r.status_code == 200, r.text
    from schemas.patient import Patient
    assert db_session.query(Patient).get(pid).ha_user_id == HA_NEW
