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
"""Wave 3 — diagnoses: CRUD, enum/pattern validation (422), set-primary,
soft-delete, and follow-up notes."""


def _make_diagnosis(admin_client, patient, **over):
    payload = {"name": "Hypertension", "patient_id": patient.id}
    payload.update(over)
    return admin_client.post("/api/diagnoses", json=payload)


def test_create_diagnosis_defaults(admin_client, patient):
    resp = _make_diagnosis(admin_client, patient)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] > 0
    assert body["diagnosis_type"] == "primary"
    assert body["status"] == "active"


def test_create_diagnosis_rejects_bad_enum(admin_client, patient):
    """severity is constrained by a regex pattern -> 422."""
    resp = _make_diagnosis(admin_client, patient, severity="extremely-bad")
    assert resp.status_code == 422


def test_create_diagnosis_requires_name(admin_client, patient):
    resp = admin_client.post("/api/diagnoses", json={"patient_id": patient.id})
    assert resp.status_code == 422


def test_get_diagnosis(admin_client, patient):
    did = _make_diagnosis(admin_client, patient).json()["id"]
    resp = admin_client.get(f"/api/diagnoses/{did}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Hypertension"


def test_get_unknown_diagnosis_404(admin_client):
    assert admin_client.get("/api/diagnoses/999999").status_code == 404


def test_update_diagnosis(admin_client, patient):
    did = _make_diagnosis(admin_client, patient).json()["id"]
    resp = admin_client.put(f"/api/diagnoses/{did}", json={"name": "Type 2 Diabetes"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Type 2 Diabetes"


def test_update_unknown_diagnosis_404(admin_client):
    assert admin_client.put("/api/diagnoses/999999", json={"name": "x"}).status_code == 404


def test_set_primary_diagnosis(admin_client, patient):
    did = _make_diagnosis(admin_client, patient).json()["id"]
    resp = admin_client.post(f"/api/diagnoses/{did}/set-primary")
    assert resp.status_code == 200
    assert resp.json()["is_primary_diagnosis"] is True


def test_delete_diagnosis_deactivates(admin_client, patient):
    did = _make_diagnosis(admin_client, patient).json()["id"]
    assert admin_client.delete(f"/api/diagnoses/{did}").status_code == 200
    # Soft delete: active-only patient listing no longer includes it.
    listing = admin_client.get(f"/api/diagnoses/patient/{patient.id}").json()
    ids = [d["id"] for d in listing] if isinstance(listing, list) else [d["id"] for d in listing.get("diagnoses", [])]
    assert did not in ids


def test_delete_unknown_diagnosis_404(admin_client):
    assert admin_client.delete("/api/diagnoses/999999").status_code == 404


def test_add_follow_up_note(admin_client, patient):
    did = _make_diagnosis(admin_client, patient).json()["id"]
    resp = admin_client.post(
        f"/api/diagnoses/{did}/notes",
        json={"diagnosis_id": did, "content": "BP trending down on new dose."},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["content"] == "BP trending down on new dose."


def test_requires_auth(client):
    assert client.get("/api/diagnoses/patient/1").status_code == 401
