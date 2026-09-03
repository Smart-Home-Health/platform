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
"""The two feeds the equipment history timeline reads.

GET /api/equipment/counts is new: the count log had only a per-supply
history, so nothing could ask what stock was adjusted lately without walking
every supply in turn.

Both feeds now resolve the person's name. The change feed previously returned
changed_by as a bare user id, which the timeline cannot render, and re-queried
the equipment row once per change to get its name.
"""


def _make(cl, patient, **over):
    payload = {
        "name": "Trach tube", "quantity": 5, "scheduled_replacement": False,
        "patient_id": patient.id,
    }
    payload.update(over)
    resp = cl.post("/api/equipment", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# --- The new global stocktake feed ---------------------------------------

def test_counts_feed_spans_every_supply(admin_client, patient):
    a = _make(admin_client, patient, name="Catheter")
    b = _make(admin_client, patient, name="Gauze")
    admin_client.post(f"/api/equipment/{a}/count", json={"quantity": 2, "note": "Used"})
    admin_client.post(f"/api/equipment/{b}/count", json={"quantity": 9})

    rows = admin_client.get("/api/equipment/counts").json()["counts"]
    assert {r["equipment_name"] for r in rows} >= {"Catheter", "Gauze"}


def test_counts_feed_carries_the_before_and_after(admin_client, patient):
    eid = _make(admin_client, patient, name="Catheter", quantity=4)
    admin_client.post(f"/api/equipment/{eid}/count", json={"quantity": 0, "note": "Used"})

    row = next(r for r in admin_client.get("/api/equipment/counts").json()["counts"]
               if r["equipment_id"] == eid)
    assert row["quantity_before"] == 4
    assert row["quantity_after"] == 0
    assert row["note"] == "Used"


def test_counts_feed_names_who_counted(admin_client, patient, admin_user):
    eid = _make(admin_client, patient)
    admin_client.post(f"/api/equipment/{eid}/count", json={"quantity": 3})

    row = admin_client.get("/api/equipment/counts").json()["counts"][0]
    assert row["counted_by_name"] == admin_user.full_name


def test_counts_feed_is_newest_first(admin_client, patient):
    eid = _make(admin_client, patient)
    admin_client.post(f"/api/equipment/{eid}/count", json={"quantity": 1})
    admin_client.post(f"/api/equipment/{eid}/count", json={"quantity": 7})

    rows = admin_client.get("/api/equipment/counts").json()["counts"]
    assert rows[0]["quantity_after"] == 7


def test_counts_feed_respects_limit(admin_client, patient):
    eid = _make(admin_client, patient)
    for q in range(1, 5):
        admin_client.post(f"/api/equipment/{eid}/count", json={"quantity": q})
    assert len(admin_client.get("/api/equipment/counts?limit=2").json()["counts"]) == 2


def test_counts_feed_is_gated(limited_client):
    # admin_client and limited_client share one TestClient whose header the
    # later fixture overwrites, so a gating test must not ask for both.
    assert limited_client.get("/api/equipment/counts").status_code == 403


def test_counts_path_is_not_read_as_an_equipment_id(admin_client, patient):
    """Declared before /{equipment_id}, so "counts" stays a literal path."""
    _make(admin_client, patient)
    assert admin_client.get("/api/equipment/counts").status_code == 200


# --- The change feed now names the person --------------------------------

def test_change_feed_names_who_changed_it(admin_client, patient, admin_user):
    eid = _make(admin_client, patient, scheduled_replacement=True,
                last_changed="2026-08-01T00:00:00Z", useful_days=30)
    admin_client.post(f"/api/equipment/{eid}/change",
                      json={"changed_at": "2026-08-19T00:00:00Z"})

    row = admin_client.get("/api/equipment/history").json()["history"][0]
    assert row["changed_by_name"] == admin_user.full_name
    assert row["equipment_name"] == "Trach tube"


def test_change_feed_survives_a_change_with_no_user(admin_client, patient, db_session):
    """changed_by is nullable; the name comes back as null, not an error."""
    eid = _make(admin_client, patient, scheduled_replacement=True,
                last_changed="2026-08-01T00:00:00Z", useful_days=30)
    from schemas.equipment_change_log import EquipmentChangeLog
    from datetime import datetime, timezone
    db_session.add(EquipmentChangeLog(
        equipment_id=eid, patient_id=patient.id,
        changed_at=datetime.now(timezone.utc), changed_by=None,
        created_at=datetime.now(timezone.utc),
    ))
    db_session.commit()

    rows = admin_client.get("/api/equipment/history").json()["history"]
    assert any(r["changed_by_name"] is None for r in rows)
