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
"""Wave 2 — vitals: types contract + manual entry round-trip."""


def test_vital_types_contract(admin_client):
    resp = admin_client.get("/api/vitals/types")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_manual_temperature_entry(admin_client, patient):
    resp = admin_client.post("/api/vitals/manual", json={
        "vital_type": "temperature",
        "value": 98.6,
        "patient_id": patient.id,
    })
    assert resp.status_code == 200


def test_patient_vitals_listing_after_entry(admin_client, patient):
    admin_client.post("/api/vitals/manual", json={
        "vital_type": "temperature", "value": 99.1, "patient_id": patient.id,
    })
    resp = admin_client.get(f"/api/vitals/patient/{patient.id}?vital_type=temperature")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_manual_entry_requires_auth(client, patient):
    resp = client.post("/api/vitals/manual", json={
        "vital_type": "temperature", "value": 98.6, "patient_id": patient.id,
    })
    assert resp.status_code == 401
