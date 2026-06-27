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
"""Wave 3 — businesses: CRUD, validation, soft-delete, and type tagging."""


def _make_business(admin_client, **over):
    payload = {"name": "Acme Pharmacy", "business_types": ["pharmacy"]}
    payload.update(over)
    return admin_client.post("/api/businesses", json=payload)


def test_create_business(admin_client):
    resp = _make_business(admin_client)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] > 0
    assert "pharmacy" in body["business_types"]


def test_create_business_requires_name(admin_client):
    resp = admin_client.post("/api/businesses", json={"business_types": ["lab"]})
    assert resp.status_code == 422


def test_get_business(admin_client):
    bid = _make_business(admin_client).json()["id"]
    resp = admin_client.get(f"/api/businesses/{bid}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Acme Pharmacy"


def test_get_unknown_business_404(admin_client):
    assert admin_client.get("/api/businesses/999999").status_code == 404


def test_update_business(admin_client):
    bid = _make_business(admin_client).json()["id"]
    resp = admin_client.put(f"/api/businesses/{bid}", json={"city": "Springfield"})
    assert resp.status_code == 200
    assert resp.json()["city"] == "Springfield"


def test_update_business_empty_payload_400(admin_client):
    bid = _make_business(admin_client).json()["id"]
    assert admin_client.put(f"/api/businesses/{bid}", json={}).status_code == 400


def test_update_unknown_business_404(admin_client):
    assert admin_client.put("/api/businesses/999999", json={"city": "x"}).status_code == 404


def test_add_type_to_business(admin_client):
    bid = _make_business(admin_client).json()["id"]
    resp = admin_client.post(f"/api/businesses/{bid}/types/lab")
    assert resp.status_code == 200
    assert "lab" in admin_client.get(f"/api/businesses/{bid}").json()["business_types"]


def test_add_type_unknown_business_404(admin_client):
    assert admin_client.post("/api/businesses/999999/types/lab").status_code == 404


def test_delete_business(admin_client):
    bid = _make_business(admin_client).json()["id"]
    assert admin_client.delete(f"/api/businesses/{bid}").status_code == 200


def test_delete_unknown_business_404(admin_client):
    assert admin_client.delete("/api/businesses/999999").status_code == 404


def test_requires_auth(client):
    assert client.get("/api/businesses").status_code == 401
