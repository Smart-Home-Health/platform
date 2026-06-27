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
"""Wave 3 — symptoms: create/get/list/resolve/delete + 404s."""


def _make_symptom(admin_client, patient, **over):
    payload = {"symptom_type": "headache", "patient_id": patient.id, "severity": 3}
    payload.update(over)
    return admin_client.post("/api/symptoms", json=payload)


def test_create_symptom(admin_client, patient):
    resp = _make_symptom(admin_client, patient)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["id"] > 0
    assert body["symptom"]["is_resolved"] is False


def test_create_symptom_validation(admin_client, patient):
    # symptom_type is required
    resp = admin_client.post("/api/symptoms", json={"patient_id": patient.id})
    assert resp.status_code == 422


def test_get_symptom(admin_client, patient):
    sid = _make_symptom(admin_client, patient).json()["id"]
    resp = admin_client.get(f"/api/symptoms/{sid}")
    assert resp.status_code == 200
    assert resp.json()["symptom_type"] == "headache"


def test_get_unknown_symptom_404(admin_client):
    assert admin_client.get("/api/symptoms/999999").status_code == 404


def test_list_symptoms(admin_client, patient):
    _make_symptom(admin_client, patient)
    resp = admin_client.get("/api/symptoms")
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


def test_resolve_symptom(admin_client, patient):
    sid = _make_symptom(admin_client, patient).json()["id"]
    resp = admin_client.post(f"/api/symptoms/{sid}/resolve")
    assert resp.status_code == 200
    assert admin_client.get(f"/api/symptoms/{sid}").json()["is_resolved"] is True


def test_resolve_unknown_symptom_404(admin_client):
    assert admin_client.post("/api/symptoms/999999/resolve").status_code == 404


def test_delete_symptom(admin_client, patient):
    sid = _make_symptom(admin_client, patient).json()["id"]
    assert admin_client.delete(f"/api/symptoms/{sid}").status_code == 200
    assert admin_client.get(f"/api/symptoms/{sid}").status_code == 404


def test_requires_auth(client):
    assert client.get("/api/symptoms").status_code == 401
