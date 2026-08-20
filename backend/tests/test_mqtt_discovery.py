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
"""
MQTT → HA discovery hardening: device_class enrichment, suggested_area,
section un-discovery (empty retained configs), per-reader connectivity
sensors, the reader availability publisher, and the alarm1/alarm2 wiring.
All broker traffic goes through a fake client — no sockets.
"""
import asyncio
import json
from types import SimpleNamespace

import pytest

from mqtt import discovery as disc
from mqtt.publisher import MQTTPublisher


class FakeMqttClient:
    def __init__(self):
        self.published = []  # (topic, payload, retain)

    def is_connected(self):
        return True

    def publish(self, topic, payload=None, retain=False):
        self.published.append((topic, payload, retain))
        return SimpleNamespace(rc=0)


PATIENT_ENTRY = {
    "patient_id": 5,
    "patient_name": "Pat Ient",
    "care_area": "Bedroom",
    "settings": {"enabled": True, "sections": {
        "spo2": "get", "temperature": "get", "weight": "get",
        "blood_pressure": "get", "nutrition": "get", "alarm1": "get",
        "bathroom": "off", "bpm": "off",
    }},
    "readers": [{"id": 7, "name": "Pulse Ox"}],
}


@pytest.fixture
def fake_client(monkeypatch):
    client = FakeMqttClient()
    monkeypatch.setattr(disc, "get_mqtt_settings",
                        lambda: {"enabled": True, "base_topic": "shh"})
    monkeypatch.setattr(disc, "get_patients_with_mqtt_enabled",
                        lambda: [dict(PATIENT_ENTRY)])
    return client


def _configs(client):
    """topic -> decoded config dict (or None for removal payloads)."""
    out = {}
    for topic, payload, retain in client.published:
        assert retain is True
        out[topic] = json.loads(payload) if payload else None
    return out


def test_discovery_device_classes_and_suggested_area(fake_client):
    assert disc.send_mqtt_discovery(fake_client)
    configs = _configs(fake_client)

    weight = configs["homeassistant/sensor/shh_pat_ient_weight/config"]
    assert weight["dev_cla"] == "weight"
    assert weight["unit_of_meas"] == "lb"
    assert weight["dev"]["sa"] == "Bedroom"

    temp = configs["homeassistant/sensor/shh_pat_ient_temperature/config"]
    assert temp["dev_cla"] == "temperature"

    systolic = configs["homeassistant/sensor/shh_pat_ient_blood_pressure_systolic/config"]
    assert systolic["dev_cla"] == "pressure"

    water = configs["homeassistant/sensor/shh_pat_ient_nutrition_water_intake/config"]
    assert water["dev_cla"] == "volume"
    calories = configs["homeassistant/sensor/shh_pat_ient_nutrition_calories_intake/config"]
    assert "dev_cla" not in calories

    # SpO2 has no fitting HA class — must stay classless.
    spo2 = configs["homeassistant/sensor/shh_pat_ient_spo2/config"]
    assert "dev_cla" not in spo2


def test_entity_plan_matches_what_discovery_publishes(fake_client):
    """The planner is what the UI counts entities with, so it has to agree with
    the publisher — section for section, name for name."""
    sections = PATIENT_ENTRY["settings"]["sections"]
    plan = disc.entity_plan(sections)

    assert disc.send_mqtt_discovery(fake_client)
    published = {
        topic.split("/")[2] for topic, payload, _ in fake_client.published if payload
        # reader availability sensors are not section entities
        if "_reader_" not in topic
    }
    planned = {f"shh_pat_ient_{suffix}" for _s, _t, suffix, _n in plan}
    assert planned == published

    # The expansions the count depends on.
    by_section = {}
    for section, _type, _suffix, _name in plan:
        by_section[section] = by_section.get(section, 0) + 1
    assert by_section["blood_pressure"] == 3
    assert by_section["nutrition"] == 6
    assert by_section["spo2"] == 1
    assert "bathroom" not in by_section  # off
    assert "bpm" not in by_section


def test_entity_plan_expands_badge_counts_and_skips_unshared():
    plan = disc.entity_plan({"meds_counts": "get", "care_task_counts": "off",
                             "spo2": "set", "alarm1": "both"})
    assert [(s, suffix) for s, _t, suffix, _n in plan] == [
        ("meds_counts", "meds_due_now"),
        ("meds_counts", "meds_late"),
        ("alarm1", "alarm1"),
    ]
    # 'set' is HA writing to us; it publishes no sensor.
    assert all(section != "spo2" for section, _t, _s, _n in plan)


def test_discovery_prunes_disabled_sections(fake_client):
    disc.send_mqtt_discovery(fake_client)
    configs = _configs(fake_client)

    # Off/unset sections get empty retained payloads (HA deletes the entity).
    assert configs["homeassistant/sensor/shh_pat_ient_bathroom/config"] is None
    assert configs["homeassistant/sensor/shh_pat_ient_bpm/config"] is None
    assert configs["homeassistant/sensor/shh_pat_ient_meds_due_now/config"] is None
    assert configs["homeassistant/binary_sensor/shh_pat_ient_alarm2/config"] is None
    # Enabled ones are real configs.
    assert configs["homeassistant/binary_sensor/shh_pat_ient_alarm1/config"] is not None


def test_discovery_reader_connectivity_sensor(fake_client):
    disc.send_mqtt_discovery(fake_client)
    configs = _configs(fake_client)

    reader = configs["homeassistant/binary_sensor/shh_pat_ient_reader_7/config"]
    assert reader["stat_t"] == "shh/reader/7/availability"
    assert reader["pl_on"] == "online"
    assert reader["pl_off"] == "offline"
    assert reader["dev_cla"] == "connectivity"
    assert reader["avty_t"] == "shh/availability"
    assert "json_attr_t" not in reader  # bare-string payload, not patient JSON


def test_remove_discovery_for_patient(monkeypatch):
    client = FakeMqttClient()
    disc.remove_mqtt_discovery_for_patient(client, 5, "Pat Ient", reader_ids=[7])
    topics = {t for t, payload, _ in client.published}
    payloads = {p for _, p, _ in client.published}
    assert payloads == {""}  # removals only
    assert "homeassistant/sensor/shh_pat_ient_weight/config" in topics
    assert "homeassistant/sensor/shh_pat_ient_nutrition_water_target/config" in topics
    assert "homeassistant/binary_sensor/shh_pat_ient_alarm1/config" in topics
    assert "homeassistant/binary_sensor/shh_pat_ient_reader_7/config" in topics


def test_publish_reader_availability(monkeypatch):
    import mqtt.publisher as publisher_mod
    monkeypatch.setattr(publisher_mod, "get_mqtt_settings",
                        lambda: {"enabled": True, "base_topic": "shh"})
    client = FakeMqttClient()
    pub = MQTTPublisher(client)
    assert pub.publish_reader_availability(7, online=True)
    assert pub.publish_reader_availability(7, online=False)
    assert client.published == [
        ("shh/reader/7/availability", "online", True),
        ("shh/reader/7/availability", "offline", True),
    ]


def test_alarm_panel_state_reaches_patient_state(monkeypatch):
    """AlarmPanelState events land in the combined state as alarm1/alarm2."""
    from datetime import datetime
    from bus import EventBus
    from events import AlarmPanelState, EventSource
    from modules.mqtt_module import MQTTModule

    bus = EventBus()
    module = MQTTModule(bus)
    published = []

    async def fake_publish(patient_id):
        published.append((patient_id, dict(module._patient_state_cache[patient_id])))
        return True

    async def fake_seed(patient_id):
        return {}

    monkeypatch.setattr(module, "_publish_patient_state_with_alarms", fake_publish)
    monkeypatch.setattr(module, "_seed_patient_state", fake_seed)

    async def run():
        task = asyncio.create_task(module._subscribe_to_alarm_panel_state())
        await asyncio.sleep(0)  # let the subscriber attach
        await bus.publish(AlarmPanelState(ts=datetime.utcnow(), alarm1=True,
                                          alarm2=False, source=EventSource.READER,
                                          patient_id=5))
        # patient-less events are ignored
        await bus.publish(AlarmPanelState(ts=datetime.utcnow(), alarm1=True,
                                          alarm2=True, source=EventSource.READER,
                                          patient_id=None))
        await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(run())
    assert published == [(5, {"alarm1": "ON", "alarm2": "OFF"})]


def test_patient_care_area_roundtrip(admin_client, patient):
    resp = admin_client.put(f"/api/patients/{patient.id}",
                            json={"care_area": "Bedroom"})
    assert resp.status_code == 200
    assert resp.json()["care_area"] == "Bedroom"
    resp = admin_client.get(f"/api/patients/{patient.id}")
    assert resp.json()["care_area"] == "Bedroom"
