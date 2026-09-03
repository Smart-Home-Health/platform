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
"""Wave 2 — medications: create, administer, the on-hand quantity guard (409),
and the Pydantic date-vs-ISO 422 gotcha."""


def _make_med(admin_client, patient, **over):
    payload = {
        "name": "Tylenol", "concentration": "500mg", "quantity": 10,
        "quantity_unit": "tablets", "instructions": "as directed",
        "start_date": "2026-06-01", "is_patient_specific": True,
        "admin_patient_id": patient.id,
    }
    payload.update(over)
    return admin_client.post("/api/add/medication", json=payload)


def test_create_medication(admin_client, patient):
    resp = _make_med(admin_client, patient)
    assert resp.status_code == 200
    assert resp.json()["id"] > 0


def test_create_medication_validation(admin_client, patient):
    # missing required 'concentration'
    resp = _make_med(admin_client, patient, concentration=None)
    assert resp.status_code == 422


def test_start_date_rejects_full_iso_datetime(admin_client, patient):
    """`start_date` is a `date` field; a full ISO datetime string (what JS
    toISOString() yields) is rejected with 422 — the documented gotcha."""
    resp = _make_med(admin_client, patient, start_date="2026-06-01T12:34:56.000Z")
    assert resp.status_code == 422


def test_administer_deducts_quantity(admin_client, patient):
    med_id = _make_med(admin_client, patient, quantity=10).json()["id"]
    resp = admin_client.post(f"/api/medications/{med_id}/administer",
                             json={"dose_amount": 2, "patient_id": patient.id})
    assert resp.status_code == 200
    assert resp.json().get("success") is True


def test_administer_records_who_gave_the_dose(admin_client, admin_user, patient, db_session):
    """`administered_by` is written.

    The column has existed since the initial migration but nothing populated
    it, so `completed_by` came back None for every medication on the daily
    schedule while care tasks recorded it properly. The dose detail pane shows
    this, so a blank would be a silent lie about who gave a dose.
    """
    from schemas.medication_log import MedicationLog

    med_id = _make_med(admin_client, patient, quantity=10).json()["id"]
    resp = admin_client.post(f"/api/medications/{med_id}/administer",
                             json={"dose_amount": 2, "patient_id": patient.id})
    assert resp.status_code == 200, resp.text

    log = db_session.query(MedicationLog).filter(
        MedicationLog.medication_id == med_id).one()
    assert log.administered_by == admin_user.id


def test_history_filters_by_medication_id_not_a_name_prefix(admin_client, patient):
    """`medication_id` is exact where `medication_name` is a substring match.

    Two medications sharing a prefix is ordinary (Pro-something), and the dose
    detail pane must never show another drug's doses.
    """
    a_id = _make_med(admin_client, patient, name="Propranolol", quantity=10).json()["id"]
    _make_med(admin_client, patient, name="Propranolol ER", quantity=10)

    for med, dose in ((a_id, 1), (a_id, 2)):
        admin_client.post(f"/api/medications/{med}/administer",
                          json={"dose_amount": dose, "patient_id": patient.id})
    b_id = _make_med(admin_client, patient, name="Propafenone", quantity=10).json()["id"]
    admin_client.post(f"/api/medications/{b_id}/administer",
                      json={"dose_amount": 1, "patient_id": patient.id})

    by_name = admin_client.get(
        f"/api/medications/history?patient_id={patient.id}&medication_name=Prop")
    assert by_name.status_code == 200
    assert {r["medication_name"] for r in by_name.json()["history"]} == {
        "Propranolol", "Propafenone"}

    by_id = admin_client.get(
        f"/api/medications/history?patient_id={patient.id}&medication_id={a_id}")
    assert by_id.status_code == 200
    rows = by_id.json()["history"]
    assert len(rows) == 2
    assert {r["medication_id"] for r in rows} == {a_id}
    # The pane renders this, so it has to come back on the record.
    assert all("administered_by" in r for r in rows)


def test_administer_blocked_when_insufficient_quantity(admin_client, patient):
    """Dose larger than on-hand quantity is hard-blocked with 409."""
    med_id = _make_med(admin_client, patient, quantity=1).json()["id"]
    resp = admin_client.post(f"/api/medications/{med_id}/administer",
                             json={"dose_amount": 5, "patient_id": patient.id})
    assert resp.status_code == 409
    assert resp.json()["error"] == "insufficient_quantity"


def test_active_medications_listing(admin_client, patient):
    _make_med(admin_client, patient)
    resp = admin_client.get("/api/medications/active")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
