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
"""Wave 3 — providers: CRUD, required-field validation, business_id FK guard
(400), set-primary, soft-delete."""


def _make_provider(admin_client, patient, **over):
    payload = {
        "patient_id": patient.id,
        "first_name": "Ada",
        "last_name": "Lovelace",
        "provider_type": "primary_care",
    }
    payload.update(over)
    return admin_client.post("/api/providers", json=payload)


def test_create_provider(admin_client, patient):
    resp = _make_provider(admin_client, patient)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] > 0
    assert body["provider_type"] == "primary_care"


def test_create_provider_requires_provider_type(admin_client, patient):
    resp = admin_client.post("/api/providers", json={
        "patient_id": patient.id, "first_name": "A", "last_name": "B",
    })
    assert resp.status_code == 422


def test_create_provider_rejects_unknown_business(admin_client, patient):
    """business_id is validated against existing businesses -> 400."""
    resp = _make_provider(admin_client, patient, business_id=999999)
    assert resp.status_code == 400


def test_get_provider(admin_client, patient):
    pid = _make_provider(admin_client, patient).json()["id"]
    resp = admin_client.get(f"/api/providers/{pid}")
    assert resp.status_code == 200
    assert resp.json()["last_name"] == "Lovelace"


def test_get_unknown_provider_404(admin_client):
    assert admin_client.get("/api/providers/999999").status_code == 404


def test_update_provider(admin_client, patient):
    pid = _make_provider(admin_client, patient).json()["id"]
    resp = admin_client.put(f"/api/providers/{pid}", json={"specialty": "Cardiology"})
    assert resp.status_code == 200
    assert resp.json()["specialty"] == "Cardiology"


def test_update_unknown_provider_404(admin_client):
    assert admin_client.put("/api/providers/999999", json={"specialty": "x"}).status_code == 404


def test_set_primary_provider(admin_client, patient):
    pid = _make_provider(admin_client, patient).json()["id"]
    assert admin_client.post(f"/api/providers/{pid}/set-primary").status_code == 200


def test_delete_provider(admin_client, patient):
    pid = _make_provider(admin_client, patient).json()["id"]
    assert admin_client.delete(f"/api/providers/{pid}").status_code == 200


def test_delete_unknown_provider_404(admin_client):
    assert admin_client.delete("/api/providers/999999").status_code == 404


def test_requires_auth(client):
    assert client.get("/api/providers/999999").status_code == 401
