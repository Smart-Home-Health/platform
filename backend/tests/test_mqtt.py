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
"""Wave 4 — MQTT settings get/save round-trip. We keep mqtt_enabled False so
the save handler's reconnect path stays a no-op (no broker in tests)."""
import json


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


def test_status_reports_the_broker_without_the_credential(admin_client):
    """The per-profile sharing page shows the hub's link read-only; the password
    is configured (and returned) only by the settings endpoint."""
    admin_client.post("/api/mqtt/settings", json={
        "mqtt_enabled": True, "mqtt_broker": "broker.test", "mqtt_port": 1883,
        "mqtt_password": "hunter2",
    })
    body = admin_client.get("/api/mqtt/status").json()
    assert body["enabled"] is True
    assert body["broker"] == "broker.test"
    assert body["port"] == 1883
    assert body["base_topic"]
    assert body["connected"] is False  # no broker in tests
    assert "password" not in json.dumps(body)


def test_patient_entities_track_the_sections_that_are_shared(admin_client, patient):
    admin_client.put(f"/api/mqtt/patients/{patient.id}", json={
        "enabled": True,
        "sections": {"spo2": "get", "blood_pressure": "both", "weight": "off"},
    })
    body = admin_client.get(f"/api/mqtt/patients/{patient.id}/entities").json()
    assert body["count"] == 4  # spo2 + the three blood-pressure sensors
    sections = {e["section"] for e in body["entities"]}
    assert sections == {"spo2", "blood_pressure"}
    assert all(e["name"] for e in body["entities"])

    # Sharing off publishes nothing, whatever the sections still say.
    admin_client.put(f"/api/mqtt/patients/{patient.id}", json={
        "enabled": False,
        "sections": {"spo2": "get", "blood_pressure": "both"},
    })
    assert admin_client.get(f"/api/mqtt/patients/{patient.id}/entities").json()["count"] == 0


def test_patient_entities_404_for_an_unknown_patient(admin_client):
    assert admin_client.get("/api/mqtt/patients/999999/entities").status_code == 404
