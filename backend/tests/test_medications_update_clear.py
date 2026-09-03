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
"""A medication's optional fields can be cleared, not only set.

PUT /api/medications/{id} dropped every None before applying the update, so a
field the caller deliberately blanked was indistinguishable from one they had
not mentioned. The low-stock alert could be switched on but never off, and a
prescriber or pharmacy could be attached but never detached: the request
answered success, the value stayed, and reloading the form showed it back.
"""


def _make(admin_client, patient, **over):
    payload = {
        "name": "Baclofen", "concentration": "10 mg", "quantity": 42,
        "quantity_unit": "tablets", "instructions": "Give 1 tablet",
        "start_date": "2026-04-01", "low_stock_threshold": 14,
        "is_patient_specific": True, "admin_patient_id": patient.id,
    }
    payload.update(over)
    resp = admin_client.post("/api/add/medication", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _fetch(db_session, med_id):
    from schemas.medication import Medication
    db_session.expire_all()
    return db_session.query(Medication).filter(Medication.id == med_id).first()


def _id_of(created, admin_client, patient):
    if isinstance(created, dict) and created.get("id"):
        return created["id"]
    meds = admin_client.get(f"/api/admin/medications/active?patient_id={patient.id}").json()
    rows = meds if isinstance(meds, list) else meds.get("medications", [])
    return rows[-1]["id"]


def test_low_stock_alert_can_be_turned_off(admin_client, patient, db_session):
    med_id = _id_of(_make(admin_client, patient), admin_client, patient)
    assert _fetch(db_session, med_id).low_stock_threshold == 14

    resp = admin_client.put(f"/api/medications/{med_id}", json={"low_stock_threshold": None})
    assert resp.status_code == 200
    assert _fetch(db_session, med_id).low_stock_threshold is None


def test_a_field_left_out_is_not_disturbed(admin_client, patient, db_session):
    """exclude_unset, not "ignore null" — an absent key still means no change."""
    med_id = _id_of(_make(admin_client, patient), admin_client, patient)

    admin_client.put(f"/api/medications/{med_id}", json={"name": "Baclofen ER"})

    row = _fetch(db_session, med_id)
    assert row.name == "Baclofen ER"
    assert row.low_stock_threshold == 14      # untouched
    assert row.concentration == "10 mg"       # untouched


def test_notes_can_be_cleared(admin_client, patient, db_session):
    med_id = _id_of(_make(admin_client, patient, notes="Watch for drowsiness"),
                    admin_client, patient)
    assert _fetch(db_session, med_id).notes == "Watch for drowsiness"

    admin_client.put(f"/api/medications/{med_id}", json={"notes": None})
    assert _fetch(db_session, med_id).notes is None


def test_deactivating_still_works(admin_client, patient, db_session):
    """active=False is falsy but not None; it must survive either way."""
    med_id = _id_of(_make(admin_client, patient), admin_client, patient)
    admin_client.put(f"/api/medications/{med_id}", json={"active": False})
    assert _fetch(db_session, med_id).active is False


def test_end_date_can_be_set_and_cleared(admin_client, patient, db_session):
    """The API has always accepted end_date; the form never offered it."""
    med_id = _id_of(_make(admin_client, patient), admin_client, patient)

    admin_client.put(f"/api/medications/{med_id}", json={"end_date": "2026-12-31"})
    assert _fetch(db_session, med_id).end_date is not None

    admin_client.put(f"/api/medications/{med_id}", json={"end_date": None})
    assert _fetch(db_session, med_id).end_date is None
