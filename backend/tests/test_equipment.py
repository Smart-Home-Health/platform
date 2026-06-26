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
"""Wave 3 — equipment: create/list/update/delete, the scheduled-replacement
guard, and the out-of-stock restock 409 on /change (mirrors the medication
insufficient_quantity flow)."""


def _make_equipment(admin_client, patient, **over):
    payload = {
        "name": "Nasal Cannula",
        "quantity": 5,
        "scheduled_replacement": False,
        "patient_id": patient.id,
    }
    payload.update(over)
    return admin_client.post("/api/equipment", json=payload)


def _scheduled(admin_client, patient, **over):
    """A scheduled-replacement item (requires last_changed + useful_days)."""
    return _make_equipment(
        admin_client, patient,
        scheduled_replacement=True, last_changed="2026-06-01", useful_days=30,
        **over,
    )


def _quantity(db_session, equipment_id):
    from models import Equipment
    db_session.expire_all()
    return db_session.query(Equipment).filter(Equipment.id == equipment_id).first().quantity


# --- Create / validation -----------------------------------------------------
def test_create_equipment(admin_client, patient):
    resp = _make_equipment(admin_client, patient)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "success"
    assert body["id"] > 0


def test_create_scheduled_requires_last_changed_and_useful_days(admin_client, patient):
    """scheduled_replacement=True without last_changed/useful_days -> 400."""
    resp = _make_equipment(admin_client, patient, scheduled_replacement=True)
    assert resp.status_code == 400


def test_create_rejects_negative_quantity(admin_client, patient):
    resp = _make_equipment(admin_client, patient, quantity=-1)
    assert resp.status_code == 422


def test_requires_auth(client):
    assert client.get("/api/equipment").status_code == 401


# --- List --------------------------------------------------------------------
def test_list_equipment(admin_client, patient):
    _make_equipment(admin_client, patient)
    resp = admin_client.get("/api/equipment")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# --- Receive / open (inventory movements) ------------------------------------
def test_receive_increases_quantity(admin_client, db_session, patient):
    eid = _make_equipment(admin_client, patient, quantity=2).json()["id"]
    resp = admin_client.post(f"/api/equipment/{eid}/receive", json={"amount": 3})
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert _quantity(db_session, eid) == 5


def test_open_decreases_quantity(admin_client, db_session, patient):
    eid = _make_equipment(admin_client, patient, quantity=5).json()["id"]
    resp = admin_client.post(f"/api/equipment/{eid}/open", json={"amount": 2})
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert _quantity(db_session, eid) == 3


# --- /change: scheduled-replacement requirement + restock 409 ----------------
def test_change_requires_scheduled_replacement(admin_client, patient):
    eid = _make_equipment(admin_client, patient, scheduled_replacement=False).json()["id"]
    resp = admin_client.post(f"/api/equipment/{eid}/change",
                             json={"changed_at": "2026-06-15T10:00:00"})
    assert resp.status_code == 400


def test_change_logs_when_in_stock(admin_client, patient):
    eid = _scheduled(admin_client, patient, quantity=3).json()["id"]
    resp = admin_client.post(f"/api/equipment/{eid}/change",
                             json={"changed_at": "2026-06-15T10:00:00"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_change_blocked_when_out_of_stock_then_restock(admin_client, patient):
    """Tracked item at 0 on hand -> 409 insufficient_quantity; receiving stock
    clears the block and the change records."""
    eid = _scheduled(admin_client, patient, quantity=0).json()["id"]

    blocked = admin_client.post(f"/api/equipment/{eid}/change",
                                json={"changed_at": "2026-06-15T10:00:00"})
    assert blocked.status_code == 409
    assert blocked.json()["error"] == "insufficient_quantity"

    admin_client.post(f"/api/equipment/{eid}/receive", json={"amount": 1})
    retry = admin_client.post(f"/api/equipment/{eid}/change",
                              json={"changed_at": "2026-06-15T10:00:00"})
    assert retry.status_code == 200
    assert retry.json()["success"] is True


def test_change_unknown_equipment_404(admin_client):
    resp = admin_client.post("/api/equipment/999999/change",
                             json={"changed_at": "2026-06-15T10:00:00"})
    assert resp.status_code == 404


# --- Update / delete ---------------------------------------------------------
def test_update_equipment(admin_client, db_session, patient):
    eid = _make_equipment(admin_client, patient, quantity=5).json()["id"]
    resp = admin_client.put(f"/api/equipment/{eid}", json={"name": "Renamed", "quantity": 8})
    assert resp.status_code == 200
    assert _quantity(db_session, eid) == 8


def test_update_unknown_equipment_404(admin_client):
    resp = admin_client.put("/api/equipment/999999", json={"name": "Nope"})
    assert resp.status_code == 404


def test_delete_equipment(admin_client, patient):
    eid = _make_equipment(admin_client, patient).json()["id"]
    assert admin_client.delete(f"/api/equipment/{eid}").status_code == 200


def test_delete_unknown_equipment_404(admin_client):
    assert admin_client.delete("/api/equipment/999999").status_code == 404
