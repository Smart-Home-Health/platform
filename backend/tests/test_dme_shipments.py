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


# =============================================================================
# Shipments rework — standing orders, reconcile, documents, inventory
# =============================================================================

def _equipment_row(db_session, equipment_id):
    from models import Equipment
    db_session.expire_all()
    return db_session.query(Equipment).filter(Equipment.id == equipment_id).first()


def _make_equipment(admin_client, patient, **over):
    payload = {
        "name": "Trach Tube 6.0MM",
        "quantity": 0,
        "scheduled_replacement": False,
        "patient_id": patient.id,
    }
    payload.update(over)
    resp = admin_client.post("/api/equipment", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _make_template(admin_client, patient, items=None):
    sid = _make_shipment(admin_client, patient, is_template=True,
                         order_number="USUAL").json()["id"]
    for item in (items or [{"item_number": "450020", "item_description": "Trach tube",
                            "qty_ordered": 2}]):
        assert _add_item(admin_client, sid, qty_shipped=0, **item).status_code == 200
    return sid


# --- Standing orders (templates) ----------------------------------------------
def test_template_excluded_from_delivery_list(admin_client, patient):
    _make_template(admin_client, patient)
    _make_shipment(admin_client, patient)  # a regular delivery

    deliveries = admin_client.get(
        f"/api/shipments?patient_id={patient.id}&is_template=false").json()["shipments"]
    templates = admin_client.get(
        f"/api/shipments?patient_id={patient.id}&is_template=true").json()["shipments"]

    assert all(not s["is_template"] for s in deliveries)
    assert templates and all(s["is_template"] for s in templates)


def test_create_delivery_from_template(admin_client, patient):
    tid = _make_template(admin_client, patient,
                         items=[{"item_number": "450020", "qty_ordered": 2},
                                {"item_number": "HC325S", "qty_ordered": 3}])

    resp = admin_client.post(f"/api/shipments/{tid}/create-delivery", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True

    delivery = admin_client.get(f"/api/shipments/{body['id']}").json()
    assert delivery["is_template"] is False
    assert delivery["template_source_id"] == tid
    # add_shipment_item auto-bumps ordered->shipped when qty_shipped > 0,
    # which fits: the delivery exists because a box shipped/arrived.
    assert delivery["status"] == "shipped"
    assert len(delivery["items"]) == 2
    # Expectation seeded: everything "shipped" until reconcile says otherwise
    assert all(i["qty_shipped"] == i["qty_ordered"] for i in delivery["items"])


def test_create_delivery_rejects_non_template(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    body = admin_client.post(f"/api/shipments/{sid}/create-delivery", json={}).json()
    assert body["success"] is False


# --- Reconcile ------------------------------------------------------------------
def test_reconcile_same_as_usual_completes_and_updates_inventory(admin_client, patient, db_session):
    eq_id = _make_equipment(admin_client, patient)
    sid = _make_shipment(admin_client, patient).json()["id"]
    _add_item(admin_client, sid, equipment_id=eq_id, qty_ordered=4, qty_shipped=4,
              unit_of_measure="EA")

    resp = admin_client.post(f"/api/shipments/{sid}/reconcile",
                             json={"mode": "same_as_usual"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["status"] == "complete"
    assert body["alerts_created"] == 0

    assert _equipment_row(db_session, eq_id).quantity == 4


def test_reconcile_unit_size_conversion(admin_client, patient, db_session):
    """BX with unit_size=100 converts to base units; EA does not multiply."""
    eq_id = _make_equipment(admin_client, patient)
    eq = _equipment_row(db_session, eq_id)
    eq.unit_size = 100
    db_session.commit()

    sid = _make_shipment(admin_client, patient).json()["id"]
    _add_item(admin_client, sid, equipment_id=eq_id, qty_ordered=2, qty_shipped=2,
              unit_of_measure="BX")

    body = admin_client.post(f"/api/shipments/{sid}/reconcile",
                             json={"mode": "same_as_usual"}).json()
    assert body["success"] is True
    assert _equipment_row(db_session, eq_id).quantity == 200


def test_reconcile_itemized_short_creates_alert_and_backorder(admin_client, patient):
    sid = _make_shipment(admin_client, patient, order_number="78711852").json()["id"]
    item_id = _add_item(admin_client, sid, qty_ordered=3, qty_shipped=3).json()["id"]

    # Slip says 3 shipped; only 1 arrived, 2 "to follow" (backordered)
    resp = admin_client.post(f"/api/shipments/{sid}/reconcile", json={
        "mode": "itemized",
        "items": [{"shipment_item_id": item_id, "qty_received": 1,
                   "qty_shipped": 1, "qty_backordered": 2}],
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["status"] == "complete"  # received == adjusted qty_shipped; rest is B/O
    assert body["backorder_shipment_id"] is not None

    backorder = admin_client.get(f"/api/shipments/{body['backorder_shipment_id']}").json()
    assert backorder["is_backorder"] is True
    assert backorder["parent_shipment_id"] == sid
    assert backorder["order_number"] == "78711852-BO"
    assert backorder["items"][0]["qty_ordered"] == 2


def test_reconcile_itemized_short_without_backorder_flags_partial(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    item_id = _add_item(admin_client, sid, qty_ordered=5, qty_shipped=5).json()["id"]

    body = admin_client.post(f"/api/shipments/{sid}/reconcile", json={
        "mode": "itemized",
        "items": [{"shipment_item_id": item_id, "qty_received": 3}],
    }).json()
    assert body["success"] is True
    assert body["status"] == "partial"
    assert body["alerts_created"] == 1
    assert any(a["alert_type"] == "short" for a in body["alerts"])


def test_reconcile_blocked_for_templates_and_double_confirm(admin_client, patient):
    tid = _make_template(admin_client, patient)
    assert admin_client.post(f"/api/shipments/{tid}/reconcile",
                             json={"mode": "same_as_usual"}).json()["success"] is False

    sid = _make_shipment(admin_client, patient).json()["id"]
    _add_item(admin_client, sid, qty_ordered=1, qty_shipped=1)
    assert admin_client.post(f"/api/shipments/{sid}/reconcile",
                             json={"mode": "same_as_usual"}).json()["success"] is True
    # Second confirm is rejected, not double-counted
    assert admin_client.post(f"/api/shipments/{sid}/reconcile",
                             json={"mode": "same_as_usual"}).json()["success"] is False


def test_reconcile_requires_receive_permission(limited_client):
    # Permission dependency runs before existence checks, so a dummy id suffices.
    assert limited_client.post("/api/shipments/1/reconcile",
                               json={"mode": "same_as_usual"}).status_code == 403


# --- Packing-slip documents ------------------------------------------------------
# 1x1 transparent PNG
_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d4944415478da63640000000600023081d02f0000000049454e44ae426082"
)


def test_document_upload_list_raw_delete(admin_client, patient, monkeypatch, tmp_path):
    import document_store
    monkeypatch.setattr(document_store, "EPIC_DOCS_DIR", str(tmp_path))

    sid = _make_shipment(admin_client, patient).json()["id"]

    resp = admin_client.post(
        f"/api/shipments/{sid}/documents",
        files={"file": ("slip-page-1.png", _PNG, "image/png")},
        data={"page_number": "1"},
    )
    assert resp.status_code == 200, resp.text
    doc = resp.json()["document"]
    assert doc["page_number"] == 1
    assert doc["document_type"] == "packing-slip"
    assert doc["size_bytes"] == len(_PNG)

    docs = admin_client.get(f"/api/shipments/{sid}/documents").json()["documents"]
    assert len(docs) == 1

    raw = admin_client.get(f"/api/shipments/{sid}/documents/{doc['id']}/raw")
    assert raw.status_code == 200
    assert raw.content == _PNG

    assert admin_client.delete(
        f"/api/shipments/{sid}/documents/{doc['id']}").json()["success"] is True
    assert admin_client.get(
        f"/api/shipments/{sid}/documents/{doc['id']}/raw").status_code == 404


def test_document_upload_rejects_unsupported_type(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    resp = admin_client.post(
        f"/api/shipments/{sid}/documents",
        files={"file": ("evil.sh", b"#!/bin/sh", "application/x-sh")},
    )
    assert resp.status_code == 415


def test_document_upload_unknown_shipment_404(admin_client, monkeypatch, tmp_path):
    import document_store
    monkeypatch.setattr(document_store, "EPIC_DOCS_DIR", str(tmp_path))
    resp = admin_client.post(
        "/api/shipments/999999/documents",
        files={"file": ("slip.png", _PNG, "image/png")},
    )
    assert resp.status_code == 404


# --- Inventory summary -------------------------------------------------------------
def test_inventory_summary_statuses(admin_client, patient, db_session):
    ok_id = _make_equipment(admin_client, patient, name="Plenty", quantity=50)
    low_id = _make_equipment(admin_client, patient, name="Getting Low", quantity=3)
    reorder_id = _make_equipment(admin_client, patient, name="Reorder Me", quantity=1)

    from models import Equipment
    for eq_id, (reorder_point, par_level) in {
        ok_id: (5, 20), low_id: (2, 20), reorder_id: (2, 20),
    }.items():
        # No expire_all() here — it would discard the previous iteration's
        # pending attribute changes before commit.
        eq = db_session.query(Equipment).filter(Equipment.id == eq_id).first()
        eq.reorder_point, eq.par_level = reorder_point, par_level
    db_session.commit()

    body = admin_client.get(f"/api/shipments/inventory?patient_id={patient.id}").json()
    by_name = {i["name"]: i["status"] for i in body["inventory"]}
    assert by_name["Plenty"] == "ok"
    assert by_name["Getting Low"] == "low"
    assert by_name["Reorder Me"] == "reorder"
    assert body["counts"]["reorder"] == 1


def test_inventory_requires_permission(limited_client):
    assert limited_client.get("/api/shipments/inventory").status_code == 403


# --- Bulk item add (invoice scanner) ----------------------------------------
def test_bulk_add_items(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    resp = admin_client.post(f"/api/shipments/{sid}/items/bulk", json=[
        {"item_number": "450020", "item_description": "TUBE, TRACH TTS CUFF 6.0MM",
         "qty_ordered": 2, "unit_of_measure": "EA"},
        {"item_number": "1227006", "item_description": "UNDERPAD, PREVAIL",
         "qty_ordered": 1, "unit_of_measure": "CS"},
        {"item_number": "573717", "item_description": "CPAP HUMID CHAMB DISP",
         "qty_ordered": 3, "unit_of_measure": "EA"},
    ])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["count"] == 3

    shipment = admin_client.get(f"/api/shipments/{sid}").json()
    assert len(shipment["items"]) == 3
    assert {i["item_number"] for i in shipment["items"]} == {"450020", "1227006", "573717"}


def test_bulk_add_items_unknown_shipment_404(admin_client):
    resp = admin_client.post("/api/shipments/999999/items/bulk",
                             json=[{"item_number": "450020", "qty_ordered": 1}])
    assert resp.status_code == 404


def test_bulk_add_items_requires_permission(limited_client):
    assert limited_client.post("/api/shipments/1/items/bulk",
                               json=[{"item_number": "x", "qty_ordered": 1}]).status_code == 403


# --- Delete guards -----------------------------------------------------------
def test_delete_draft_shipment_ok(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    _add_item(admin_client, sid)  # items alone don't block deletion
    resp = admin_client.delete(f"/api/shipments/{sid}")
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert admin_client.get(f"/api/shipments/{sid}").status_code == 404


def test_delete_blocked_after_receiving(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    item_id = _add_item(admin_client, sid, qty_ordered=2, qty_shipped=2).json()["id"]
    admin_client.post(f"/api/shipments/{sid}/receive",
                      json=[{"shipment_item_id": item_id, "qty_received": 1}])
    resp = admin_client.delete(f"/api/shipments/{sid}")
    assert resp.status_code == 409
    assert "inventory" in resp.json()["detail"]


def test_delete_blocked_after_finalize(admin_client, patient):
    sid = _make_shipment(admin_client, patient).json()["id"]
    _add_item(admin_client, sid, qty_ordered=1, qty_shipped=1)
    assert admin_client.post(f"/api/shipments/{sid}/reconcile",
                             json={"mode": "same_as_usual"}).json()["success"] is True
    resp = admin_client.delete(f"/api/shipments/{sid}")
    assert resp.status_code == 409


def test_delete_unknown_shipment_404(admin_client):
    assert admin_client.delete("/api/shipments/999999").status_code == 404


def test_delete_shipment_cleans_document_blobs(admin_client, patient, monkeypatch, tmp_path):
    import os
    import document_store
    monkeypatch.setattr(document_store, "EPIC_DOCS_DIR", str(tmp_path))

    sid = _make_shipment(admin_client, patient).json()["id"]
    doc = admin_client.post(
        f"/api/shipments/{sid}/documents",
        files={"file": ("slip.png", _PNG, "image/png")},
    ).json()["document"]

    # Exactly one blob on disk, then gone with the shipment.
    blobs = [p for p in tmp_path.rglob("*") if p.is_file()]
    assert len(blobs) == 1
    assert admin_client.delete(f"/api/shipments/{sid}").json()["success"] is True
    assert not any(p.is_file() for p in tmp_path.rglob("*")), "blob leaked after shipment delete"
    assert doc["id"] > 0
