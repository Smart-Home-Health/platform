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
"""Wave 3 — implants: CRUD, required-field validation, soft-delete, notes."""


def _make_implant(admin_client, patient, **over):
    payload = {"name": "Hip Prosthesis", "body_location": "left hip", "patient_id": patient.id}
    payload.update(over)
    return admin_client.post("/api/implants", json=payload)


def test_create_implant(admin_client, patient):
    resp = _make_implant(admin_client, patient)
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] > 0


def test_create_implant_requires_body_location(admin_client, patient):
    resp = admin_client.post("/api/implants", json={"name": "X", "patient_id": patient.id})
    assert resp.status_code == 422


def test_get_implant(admin_client, patient):
    iid = _make_implant(admin_client, patient).json()["id"]
    resp = admin_client.get(f"/api/implants/{iid}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Hip Prosthesis"


def test_get_unknown_implant_404(admin_client):
    assert admin_client.get("/api/implants/999999").status_code == 404


def test_update_implant(admin_client, patient):
    iid = _make_implant(admin_client, patient).json()["id"]
    resp = admin_client.put(f"/api/implants/{iid}", json={"manufacturer": "Stryker"})
    assert resp.status_code == 200
    assert resp.json()["manufacturer"] == "Stryker"


def test_update_unknown_implant_404(admin_client):
    assert admin_client.put("/api/implants/999999", json={"manufacturer": "x"}).status_code == 404


def test_delete_implant(admin_client, patient):
    iid = _make_implant(admin_client, patient).json()["id"]
    assert admin_client.delete(f"/api/implants/{iid}").status_code == 200


def test_delete_unknown_implant_404(admin_client):
    assert admin_client.delete("/api/implants/999999").status_code == 404


def test_add_implant_note(admin_client, patient):
    iid = _make_implant(admin_client, patient).json()["id"]
    resp = admin_client.post(f"/api/implants/{iid}/notes",
                             json={"content": "Reviewed at 6-month follow-up."})
    assert resp.status_code == 200, resp.text
    assert resp.json()["content"] == "Reviewed at 6-month follow-up."


def test_add_note_unknown_implant_404(admin_client):
    resp = admin_client.post("/api/implants/999999/notes", json={"content": "x"})
    assert resp.status_code == 404


def test_requires_auth(client):
    assert client.get("/api/implants/999999").status_code == 401
