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
"""Wave 2 — patients CRUD + the trailing-slash 307 pitfall."""


def test_create_patient(admin_client):
    resp = admin_client.post("/api/patients", json={"first_name": "Ada", "last_name": "Lovelace"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] > 0
    assert body["first_name"] == "Ada"


def test_create_patient_requires_first_name(admin_client):
    resp = admin_client.post("/api/patients", json={"last_name": "NoFirst"})
    assert resp.status_code == 422


def test_get_patient_and_404(admin_client):
    created = admin_client.post("/api/patients", json={"first_name": "Grace", "last_name": "Hopper"}).json()
    assert admin_client.get(f"/api/patients/{created['id']}").status_code == 200
    assert admin_client.get("/api/patients/999999").status_code == 404


def test_list_includes_created_patient(admin_client):
    created = admin_client.post("/api/patients", json={"first_name": "Alan", "last_name": "Turing"}).json()
    ids = [p["id"] for p in admin_client.get("/api/patients").json()]
    assert created["id"] in ids


def test_update_patient(admin_client):
    created = admin_client.post("/api/patients", json={"first_name": "Edsger", "last_name": "Dijkstra"}).json()
    resp = admin_client.put(f"/api/patients/{created['id']}", json={"notes": "updated note"})
    assert resp.status_code == 200
    assert resp.json()["notes"] == "updated note"


def test_deactivate_excludes_from_active_list(admin_client):
    created = admin_client.post("/api/patients", json={"first_name": "Temp", "last_name": "Patient"}).json()
    assert admin_client.delete(f"/api/patients/{created['id']}").status_code == 200
    active_ids = [p["id"] for p in admin_client.get("/api/patients?active_only=true").json()]
    assert created["id"] not in active_ids


def test_duplicate_mrn_rejected(admin_client):
    admin_client.post("/api/patients", json={"first_name": "A", "last_name": "B", "medical_record_number": "MRN-1"})
    dup = admin_client.post("/api/patients", json={"first_name": "C", "last_name": "D", "medical_record_number": "MRN-1"})
    assert dup.status_code == 400


def test_trailing_slash_redirects(admin_client):
    """POST to the collection WITH a trailing slash 307-redirects (the documented
    pitfall: the frontend must POST to /api/patients, not /api/patients/)."""
    resp = admin_client.post(
        "/api/patients/", json={"first_name": "Slash", "last_name": "Test"},
        follow_redirects=False,
    )
    assert resp.status_code == 307
