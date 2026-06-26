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
