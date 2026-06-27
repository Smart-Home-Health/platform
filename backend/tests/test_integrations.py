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
"""Wave 4 — integrations registry + per-patient integration listing."""


def test_list_integrations(admin_client):
    resp = admin_client.get("/api/integrations")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list) and len(body) >= 1
    assert "slug" in body[0]


def test_get_integration_info_roundtrip(admin_client):
    slug = admin_client.get("/api/integrations").json()[0]["slug"]
    resp = admin_client.get(f"/api/integrations/{slug}")
    assert resp.status_code == 200
    assert resp.json()["slug"] == slug


def test_get_unknown_integration_404(admin_client):
    assert admin_client.get("/api/integrations/not_a_real_integration").status_code == 404


def test_list_patient_integrations_empty(admin_client, patient):
    resp = admin_client.get(f"/api/integrations/patient/{patient.id}")
    assert resp.status_code == 200
    assert resp.json() == []


def test_requires_full_auth(account_client):
    assert account_client.get("/api/integrations").status_code == 403


def test_requires_auth(client):
    assert client.get("/api/integrations").status_code == 401
