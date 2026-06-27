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
"""Wave 3 — settings: key/value round-trip, data_type validation, default
fallback, delete, and the require_read_access (403) gate on reads."""


def test_set_and_get_setting(admin_client):
    resp = admin_client.post("/api/settings/theme_color", json={"value": "blue"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "success"

    got = admin_client.get("/api/settings/theme_color")
    assert got.status_code == 200
    assert got.json()["value"] == "blue"


def test_set_setting_rejects_bad_data_type(admin_client):
    resp = admin_client.post("/api/settings/foo", json={"value": "x", "data_type": "complex"})
    assert resp.status_code == 422


def test_get_unknown_setting_404(admin_client):
    assert admin_client.get("/api/settings/does_not_exist").status_code == 404


def test_get_unknown_setting_with_default(admin_client):
    resp = admin_client.get("/api/settings/does_not_exist", params={"default": "fallback"})
    assert resp.status_code == 200
    assert resp.json()["value"] == "fallback"


def test_get_all_settings(admin_client):
    assert admin_client.get("/api/settings").status_code == 200


def test_update_multiple_settings(admin_client):
    resp = admin_client.post("/api/settings", json={"settings": {"a": "1", "b": "2"}})
    assert resp.status_code == 200
    body = resp.json()
    assert body["a"] == "success" and body["b"] == "success"


def test_delete_setting(admin_client):
    admin_client.post("/api/settings/temp_key", json={"value": "v"})
    assert admin_client.delete("/api/settings/temp_key").status_code == 200
    assert admin_client.get("/api/settings/temp_key").status_code == 404


def test_delete_unknown_setting_404(admin_client):
    assert admin_client.delete("/api/settings/never_existed").status_code == 404


def test_read_restricted_cannot_read_setting(client, admin_user, account):
    """GET /{key} is guarded by require_read_access -> 403 for a restricted session."""
    from routes.auth import create_access_token
    token = create_access_token(user=admin_user, account=account,
                                auth_level="full", read_restricted=True)
    resp = client.get("/api/settings/anything",
                      headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_requires_auth(client):
    assert client.get("/api/settings").status_code == 401
