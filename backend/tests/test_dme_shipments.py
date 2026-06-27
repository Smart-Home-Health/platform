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
"""Wave 3 — DME shipments: create/list/get/update, item management, the
partial-receive workflow, and the shipments.* permission gating (403)."""


def _make_shipment(admin_client, patient, **over):
    payload = {"patient_id": patient.id, "po_number": "PO-1001"}
    payload.update(over)
    return admin_client.post("/api/shipments", json=payload)


def _add_item(admin_client, shipment_id, **over):
    payload = {"item_description": "Oxygen tubing", "qty_ordered": 5, "qty_shipped": 5}
    payload.update(over)
    return admin_client.post(f"/api/shipments/{shipment_id}/items", json=payload)


# --- Create / validation -----------------------------------------------------
def test_create_shipment(admin_client, patient):
    resp = _make_shipment(admin_client, patient)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["id"] > 0


def test_create_shipment_requires_patient_id(admin_client):
    assert admin_client.post("/api/shipments", json={"po_number": "x"}).status_code == 422


# --- List / get --------------------------------------------------------------
def test_list_shipments(admin_client, patient):
    _make_shipment(admin_client, patient)
    resp = admin_client.get("/api/shipments")
    assert resp.status_code == 200
    assert "shipments" in resp.json()


def test_get_shipment(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    assert admin_client.get(f"/api/shipments/{sid}").status_code == 200


def test_get_unknown_shipment_404(admin_client):
    assert admin_client.get("/api/shipments/999999").status_code == 404


def test_update_shipment(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    resp = admin_client.put(f"/api/shipments/{sid}", json={"tracking_number": "1Z999"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# --- Items + receive workflow ------------------------------------------------
def test_add_item_to_shipment(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    resp = _add_item(admin_client, sid)
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert resp.json()["id"] > 0


def test_receive_items_records_receipt(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    item_id = _add_item(admin_client, sid, qty_ordered=5, qty_shipped=5).json()["id"]

    resp = admin_client.post(f"/api/shipments/{sid}/receive",
                             json=[{"shipment_item_id": item_id, "qty_received": 3}])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["results"][0]["receipt_id"] > 0

    # The receipt is queryable for that item.
    receipts = admin_client.get(f"/api/shipments/{sid}/items/{item_id}/receipts")
    assert receipts.status_code == 200


def test_delete_item(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    item_id = _add_item(admin_client, sid).json()["id"]
    resp = admin_client.delete(f"/api/shipments/{sid}/items/{item_id}")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_delete_shipment(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    assert admin_client.delete(f"/api/shipments/{sid}").status_code == 200


# --- Permission gating -------------------------------------------------------
def test_list_requires_permission(limited_client):
    """limited_user has no roles -> lacks shipments.read -> 403."""
    assert limited_client.get("/api/shipments").status_code == 403


def test_create_requires_permission(limited_client, patient):
    resp = limited_client.post("/api/shipments", json={"patient_id": patient.id})
    assert resp.status_code == 403


def test_requires_auth(client):
    assert client.get("/api/shipments").status_code == 401
