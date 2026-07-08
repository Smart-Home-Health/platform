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
"""Initial Inventory Setup: /api/equipment/catalog-import (bulk catalog
creation with provider aliases + idempotent dedupe), the stocktake
/count endpoint + audit history, alias CRUD, and the storage_location /
aliases additions to the equipment and inventory payloads."""


def _import(admin_client, patient, items, **over):
    payload = {"patient_id": patient.id, "items": items}
    payload.update(over)
    return admin_client.post("/api/equipment/catalog-import", json=payload)


def _make_equipment(admin_client, patient, **over):
    payload = {
        "name": "Trach ties",
        "quantity": 5,
        "scheduled_replacement": False,
        "patient_id": patient.id,
    }
    payload.update(over)
    return admin_client.post("/api/equipment", json=payload)


def _get_equipment(admin_client, equipment_id):
    rows = admin_client.get("/api/equipment").json()
    return next(r for r in rows if r["id"] == equipment_id)


# --- catalog-import: create --------------------------------------------------
def test_import_creates_supply_with_alias(admin_client, patient):
    resp = _import(admin_client, patient, [{
        "name": "Airway swivel connector",
        "item_number": "1117621",
        "raw_description": "CONNECTOR, AIRWAY SWVL DBL W/BRONCHOSCOPY PORT 15-22MM",
        "unit_of_measure": "EA",
        "storage_location": "Vent shelf",
    }])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["created"]) == 1
    assert body["matched"] == [] and body["errors"] == []
    eid = body["created"][0]["equipment_id"]

    eq = _get_equipment(admin_client, eid)
    assert eq["name"] == "Airway swivel connector"
    assert eq["item_number"] == "1117621"
    assert eq["category"] == "supply"
    assert eq["scheduled_replacement"] is False
    assert eq["quantity"] == 0  # counts come from the count step
    assert eq["storage_location"] == "Vent shelf"
    assert [a["item_number"] for a in eq["aliases"]] == ["1117621"]
    assert eq["aliases"][0]["raw_description"].startswith("CONNECTOR")


def test_import_create_requires_name(admin_client, patient):
    resp = _import(admin_client, patient, [{"item_number": "999111"}])
    body = resp.json()
    assert body["created"] == []
    assert body["errors"][0]["reason"] == "create requires a name"


# --- catalog-import: dedupe / idempotency ------------------------------------
def test_import_dedupes_on_primary_item_number(admin_client, patient):
    """Replaying a create for a number already in the catalog matches instead
    of duplicating (iOS reload replay safety)."""
    first = _import(admin_client, patient, [{"name": "Suction catheter", "item_number": "573717"}])
    eid = first.json()["created"][0]["equipment_id"]

    replay = _import(admin_client, patient, [{"name": "Suction catheter", "item_number": "573717"}])
    body = replay.json()
    assert body["created"] == []
    assert body["matched"][0]["equipment_id"] == eid
    assert body["matched"][0]["dedup"] is True

    rows = admin_client.get("/api/equipment").json()
    assert sum(1 for r in rows if r.get("item_number") == "573717") == 1


def test_import_dedupes_on_alias_number(admin_client, patient):
    """A number known only as an alias also blocks duplicate creation."""
    eid = _make_equipment(admin_client, patient, name="HME filter").json()["id"]
    admin_client.post(f"/api/equipment/{eid}/aliases", json={"item_number": "1898000"})

    resp = _import(admin_client, patient, [{"name": "Filter thing", "item_number": "1898000"}])
    body = resp.json()
    assert body["created"] == []
    assert body["matched"][0]["equipment_id"] == eid


# --- catalog-import: match ----------------------------------------------------
def test_import_match_adds_alias_and_backfills(admin_client, patient):
    """Matching to an existing supply creates the alias and backfills an
    empty item_number + storage_location so future scans link by number."""
    eid = _make_equipment(admin_client, patient, name="Breathing circuit").json()["id"]

    resp = _import(admin_client, patient, [{
        "action": "match",
        "equipment_id": eid,
        "item_number": "4412007",
        "raw_description": "CIRCUIT BRTHNG VENT ADULT",
        "storage_location": "Vent shelf",
    }])
    body = resp.json()
    assert body["matched"][0]["equipment_id"] == eid

    eq = _get_equipment(admin_client, eid)
    assert eq["item_number"] == "4412007"  # backfilled
    assert eq["storage_location"] == "Vent shelf"  # backfilled
    assert [a["item_number"] for a in eq["aliases"]] == ["4412007"]


def test_import_match_does_not_overwrite_existing_number(admin_client, patient):
    eid = _make_equipment(admin_client, patient, name="Y-connector", item_number="111000").json()["id"]
    _import(admin_client, patient, [{"action": "match", "equipment_id": eid, "item_number": "222000"}])
    eq = _get_equipment(admin_client, eid)
    assert eq["item_number"] == "111000"  # primary untouched
    assert [a["item_number"] for a in eq["aliases"]] == ["222000"]


def test_import_match_duplicate_alias_is_noop(admin_client, patient):
    eid = _make_equipment(admin_client, patient, name="Gauze").json()["id"]
    item = {"action": "match", "equipment_id": eid, "item_number": "333444"}
    _import(admin_client, patient, [item])
    _import(admin_client, patient, [item])
    eq = _get_equipment(admin_client, eid)
    assert len(eq["aliases"]) == 1


def test_import_match_requires_equipment_id(admin_client, patient):
    body = _import(admin_client, patient, [{"action": "match", "item_number": "555"}]).json()
    assert body["errors"][0]["reason"] == "match requires equipment_id"


def test_import_match_unknown_equipment_errors(admin_client, patient):
    body = _import(admin_client, patient, [{"action": "match", "equipment_id": 999999, "item_number": "555"}]).json()
    assert "not found" in body["errors"][0]["reason"]


# --- catalog-import: product barcodes ------------------------------------------
def test_import_product_barcode_becomes_supplierless_alias(admin_client, patient):
    """A UPC scanned off the box is stored as a provider-independent alias
    even when the batch has a supplier."""
    resp = _import(admin_client, patient, [{
        "name": "Suction canister",
        "item_number": "620202",
        "product_barcode": "0123456789012",
    }], supplier_id=None)
    eid = resp.json()["created"][0]["equipment_id"]
    eq = _get_equipment(admin_client, eid)
    numbers = {a["item_number"]: a for a in eq["aliases"]}
    assert set(numbers) == {"620202", "0123456789012"}
    assert numbers["0123456789012"]["supplier_id"] is None
    assert numbers["0123456789012"]["raw_description"] == "Product barcode"


def test_import_dedupes_on_product_barcode(admin_client, patient):
    """Re-importing an item known only by its box barcode matches, not duplicates."""
    _import(admin_client, patient, [{"name": "Feed bag", "product_barcode": "0999888777666"}])
    replay = _import(admin_client, patient, [{"name": "Feeding bag thing", "product_barcode": "0999888777666"}])
    body = replay.json()
    assert body["created"] == []
    assert body["matched"][0]["dedup"] is True


# --- stocktake: /count --------------------------------------------------------
def test_count_sets_absolute_quantity_with_audit(admin_client, patient):
    eid = _make_equipment(admin_client, patient, quantity=5).json()["id"]

    resp = admin_client.post(f"/api/equipment/{eid}/count",
                             json={"quantity": 64, "note": "Initial inventory setup"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["quantity_before"] == 5
    assert body["quantity_after"] == 64

    counts = admin_client.get(f"/api/equipment/{eid}/counts").json()["counts"]
    assert counts[0]["quantity_before"] == 5
    assert counts[0]["quantity_after"] == 64
    assert counts[0]["note"] == "Initial inventory setup"


def test_count_does_not_touch_last_changed(admin_client, db_session, patient):
    """A stocktake is not a replacement — last_changed must stay put."""
    eid = _make_equipment(
        admin_client, patient,
        scheduled_replacement=True, last_changed="2026-06-01", useful_days=30,
    ).json()["id"]

    admin_client.post(f"/api/equipment/{eid}/count", json={"quantity": 9})

    from models import Equipment
    db_session.expire_all()
    eq = db_session.query(Equipment).filter(Equipment.id == eid).first()
    assert eq.quantity == 9
    assert eq.last_changed.date().isoformat() == "2026-06-01"


def test_count_rejects_negative(admin_client, patient):
    eid = _make_equipment(admin_client, patient).json()["id"]
    assert admin_client.post(f"/api/equipment/{eid}/count", json={"quantity": -1}).status_code == 422


def test_count_unknown_equipment_404(admin_client):
    assert admin_client.post("/api/equipment/999999/count", json={"quantity": 1}).status_code == 404


# --- alias endpoints ----------------------------------------------------------
def test_add_and_delete_alias(admin_client, patient):
    eid = _make_equipment(admin_client, patient).json()["id"]

    resp = admin_client.post(f"/api/equipment/{eid}/aliases",
                             json={"item_number": "777888", "raw_description": "TIE TRACH 1IN"})
    assert resp.status_code == 200
    alias_id = resp.json()["id"]

    # Duplicate triple -> 409
    dup = admin_client.post(f"/api/equipment/{eid}/aliases", json={"item_number": "777888"})
    assert dup.status_code == 409

    assert admin_client.delete(f"/api/equipment/{eid}/aliases/{alias_id}").status_code == 200
    assert _get_equipment(admin_client, eid)["aliases"] == []


def test_delete_unknown_alias_404(admin_client, patient):
    eid = _make_equipment(admin_client, patient).json()["id"]
    assert admin_client.delete(f"/api/equipment/{eid}/aliases/999999").status_code == 404


# --- payload additions ---------------------------------------------------------
def test_equipment_create_and_update_storage_location(admin_client, patient):
    eid = _make_equipment(admin_client, patient, storage_location="Trach cart").json()["id"]
    assert _get_equipment(admin_client, eid)["storage_location"] == "Trach cart"

    admin_client.put(f"/api/equipment/{eid}", json={"storage_location": "Bathroom closet"})
    assert _get_equipment(admin_client, eid)["storage_location"] == "Bathroom closet"


def test_inventory_summary_includes_storage_location(admin_client, patient):
    _make_equipment(admin_client, patient, name="Vent filter",
                    storage_location="Vent shelf", reorder_point=2, par_level=10)
    resp = admin_client.get(f"/api/shipments/inventory?patient_id={patient.id}")
    assert resp.status_code == 200
    row = next(r for r in resp.json()["inventory"] if r["name"] == "Vent filter")
    assert row["storage_location"] == "Vent shelf"


def test_catalog_import_requires_auth(client, patient):
    assert client.post("/api/equipment/catalog-import",
                       json={"patient_id": patient.id, "items": []}).status_code == 401
