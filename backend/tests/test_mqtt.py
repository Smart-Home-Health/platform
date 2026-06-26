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
"""Wave 4 — MQTT settings get/save round-trip. We keep mqtt_enabled False so
the save handler's reconnect path stays a no-op (no broker in tests)."""


def test_get_mqtt_settings(admin_client):
    resp = admin_client.get("/api/mqtt/settings")
    assert resp.status_code == 200
    assert "topics" in resp.json()


def test_save_and_reflect_settings(admin_client):
    resp = admin_client.post("/api/mqtt/settings", json={
        "mqtt_enabled": False,
        "mqtt_broker": "broker.test",
        "mqtt_port": 1883,
    })
    assert resp.status_code == 200, resp.text

    got = admin_client.get("/api/mqtt/settings").json()
    assert got["mqtt_broker"] == "broker.test"


def test_requires_auth(client):
    assert client.get("/api/mqtt/settings").status_code == 401
