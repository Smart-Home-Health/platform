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
"""Equipment is permission-gated and scoped to an account.

Neither held before: not one of the module's fifteen endpoints called
require_permission, so the seeded read-only roles ("view-only", "Monitor
Only") could write through every one of them, and every by-id operation
looked equipment up on its primary key alone, so another account's supply
could be read, changed, received, counted, renamed or deleted by naming its
id. GET /api/equipment did not pass the account_id its CRUD already accepted,
so it returned every account's supplies.
"""
import pytest


@pytest.fixture
def other_account(db_session):
    from models.users import Account
    import bcrypt
    acc = Account(
        name="Other Family", slug="other-equipment",
        password_hash=bcrypt.hashpw(b"otherpass", bcrypt.gensalt()).decode(),
        timezone="America/New_York", is_default=False,
    )
    db_session.add(acc)
    db_session.commit()
    db_session.refresh(acc)
    return acc


@pytest.fixture
def other_client(client, db_session, other_account):
    """A fully-privileged client belonging to a different account."""
    from crud.users import create_user, get_role_by_name
    from routes.auth import create_access_token
    from starlette.testclient import TestClient
    role = get_role_by_name(db_session, "system_admin")
    user = create_user(
        db_session, username="other_eq_admin", password="otherpass",
        full_name="Other Admin", is_system_admin=True,
        role_ids=[role.id] if role else None, force_password_reset=False,
    )
    user.account_id = other_account.id
    db_session.commit()
    token = create_access_token(user=user, account=other_account, auth_level="full")
    fresh = TestClient(client.app)
    fresh.headers.update({"Authorization": f"Bearer {token}"})
    return fresh


@pytest.fixture
def readonly_client(client, db_session, account):
    """A user holding equipment.read and nothing else — the seeded view-only shape."""
    from crud.users import create_user, get_role_by_name
    from routes.auth import create_access_token
    from starlette.testclient import TestClient
    role = get_role_by_name(db_session, "viewer") or get_role_by_name(db_session, "monitor")
    user = create_user(
        db_session, username="eq_readonly", password="ropass",
        full_name="Read Only", is_system_admin=False,
        role_ids=[role.id] if role else None, force_password_reset=False,
    )
    user.account_id = account.id
    db_session.commit()
    token = create_access_token(user=user, account=account, auth_level="full")
    fresh = TestClient(client.app)
    fresh.headers.update({"Authorization": f"Bearer {token}"})
    return fresh


def _make(cl, patient, **over):
    payload = {
        "name": "Trach tube", "quantity": 5, "scheduled_replacement": False,
        "patient_id": patient.id,
    }
    payload.update(over)
    resp = cl.post("/api/equipment", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# --- Permission gating ----------------------------------------------------

def test_readonly_can_read(readonly_client, admin_client, patient):
    _make(admin_client, patient)
    assert readonly_client.get("/api/equipment").status_code == 200


def test_readonly_cannot_create(readonly_client, patient):
    resp = readonly_client.post("/api/equipment", json={
        "name": "Snuck in", "quantity": 1, "scheduled_replacement": False,
        "patient_id": patient.id,
    })
    assert resp.status_code == 403


def test_readonly_cannot_update_or_delete(readonly_client, admin_client, patient):
    eid = _make(admin_client, patient)
    assert readonly_client.put(f"/api/equipment/{eid}", json={"name": "Renamed"}).status_code == 403
    assert readonly_client.delete(f"/api/equipment/{eid}").status_code == 403


def test_readonly_cannot_move_stock(readonly_client, admin_client, patient):
    """receive/open/count all write Equipment.quantity."""
    eid = _make(admin_client, patient)
    assert readonly_client.post(f"/api/equipment/{eid}/receive", json={"amount": 5}).status_code == 403
    assert readonly_client.post(f"/api/equipment/{eid}/open", json={"amount": 1}).status_code == 403
    assert readonly_client.post(f"/api/equipment/{eid}/count", json={"quantity": 99}).status_code == 403


def test_readonly_cannot_log_a_change(readonly_client, admin_client, patient):
    eid = _make(admin_client, patient, scheduled_replacement=True,
                last_changed="2026-08-01T00:00:00Z", useful_days=30)
    resp = readonly_client.post(f"/api/equipment/{eid}/change",
                                json={"changed_at": "2026-08-19T00:00:00Z"})
    assert resp.status_code == 403


# --- Account scoping ------------------------------------------------------

def test_list_excludes_other_accounts(admin_client, other_client, patient):
    mine = _make(admin_client, patient)
    theirs = _make(other_client, patient, name="Theirs")

    ids = [e["id"] for e in admin_client.get("/api/equipment").json()]
    assert mine in ids
    assert theirs not in ids


def test_update_across_accounts_does_not_apply(admin_client, other_client, patient, db_session):
    theirs = _make(other_client, patient, name="Theirs")
    admin_client.put(f"/api/equipment/{theirs}", json={"name": "Stolen"})

    from schemas.equipment import Equipment
    db_session.expire_all()
    assert db_session.query(Equipment).filter(Equipment.id == theirs).first().name == "Theirs"


def test_delete_across_accounts_does_not_apply(admin_client, other_client, patient, db_session):
    theirs = _make(other_client, patient, name="Theirs")
    admin_client.delete(f"/api/equipment/{theirs}")

    from schemas.equipment import Equipment
    db_session.expire_all()
    assert db_session.query(Equipment).filter(Equipment.id == theirs).first() is not None


def test_stock_cannot_be_moved_across_accounts(admin_client, other_client, patient, db_session):
    theirs = _make(other_client, patient, name="Theirs")
    admin_client.post(f"/api/equipment/{theirs}/receive", json={"amount": 100})
    admin_client.post(f"/api/equipment/{theirs}/open", json={"amount": 3})
    admin_client.post(f"/api/equipment/{theirs}/count", json={"quantity": 999})

    from schemas.equipment import Equipment
    db_session.expire_all()
    assert db_session.query(Equipment).filter(Equipment.id == theirs).first().quantity == 5


def test_change_log_cannot_be_written_across_accounts(admin_client, other_client, patient):
    theirs = _make(other_client, patient, name="Theirs", scheduled_replacement=True,
                   last_changed="2026-08-01T00:00:00Z", useful_days=30)
    resp = admin_client.post(f"/api/equipment/{theirs}/change",
                             json={"changed_at": "2026-08-19T00:00:00Z"})
    # 404 rather than a silent success: from this account it does not exist.
    assert resp.status_code == 404
    assert other_client.get(f"/api/equipment/{theirs}/history").json() == []


def test_history_across_accounts_is_empty(admin_client, other_client, patient):
    theirs = _make(other_client, patient, name="Theirs", scheduled_replacement=True,
                   last_changed="2026-08-01T00:00:00Z", useful_days=30)
    other_client.post(f"/api/equipment/{theirs}/change",
                      json={"changed_at": "2026-08-19T00:00:00Z"})
    assert other_client.get(f"/api/equipment/{theirs}/history").json(), "their own history is visible"

    assert admin_client.get(f"/api/equipment/{theirs}/history").json() == []


def test_global_history_excludes_other_accounts(admin_client, other_client, patient):
    theirs = _make(other_client, patient, name="Theirs", scheduled_replacement=True,
                   last_changed="2026-08-01T00:00:00Z", useful_days=30)
    other_client.post(f"/api/equipment/{theirs}/change",
                      json={"changed_at": "2026-08-19T00:00:00Z"})

    rows = admin_client.get("/api/equipment/history").json()["history"]
    assert all(r["equipment_id"] != theirs for r in rows)


def test_count_history_across_accounts_is_empty(admin_client, other_client, patient):
    theirs = _make(other_client, patient, name="Theirs")
    other_client.post(f"/api/equipment/{theirs}/count", json={"quantity": 12})
    assert other_client.get(f"/api/equipment/{theirs}/counts").json()["counts"]

    assert admin_client.get(f"/api/equipment/{theirs}/counts").json()["counts"] == []


# --- Same-account behaviour is unchanged ----------------------------------

def test_own_equipment_still_works_end_to_end(admin_client, patient, db_session):
    eid = _make(admin_client, patient)
    assert admin_client.put(f"/api/equipment/{eid}", json={"name": "Renamed"}).status_code == 200
    assert admin_client.post(f"/api/equipment/{eid}/receive", json={"amount": 5}).status_code == 200
    assert admin_client.post(f"/api/equipment/{eid}/count", json={"quantity": 7}).status_code == 200
    assert admin_client.get(f"/api/equipment/{eid}/counts").json()["counts"]

    from schemas.equipment import Equipment
    db_session.expire_all()
    row = db_session.query(Equipment).filter(Equipment.id == eid).first()
    assert row.name == "Renamed"
    assert row.quantity == 7
