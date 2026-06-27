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
"""Wave 6 — event-bus MQTT loop-prevention invariant + alarm-flag mapping.

CLAUDE.md documents the project's nastiest footgun: an update that *originated*
from MQTT must never be re-published to MQTT, or the broker echoes it straight
back and you get an infinite republish loop. The guard is a single line in
StateModule._handle_sensor_update — `if event.source != EventSource.MQTT`.
These tests pin that line down so a refactor can't silently remove it.

No DB or broker is touched: a bare EventBus is constructed and the DB/alert and
publish side-effects are monkeypatched out. Coroutines are driven with
asyncio.run() so no pytest-asyncio dependency is required.
"""
import asyncio
from datetime import datetime

import pytest

from bus import EventBus
from events import SensorUpdate, EventSource
from modules.state_module import StateModule
from modules.mqtt_module import MQTTModule


@pytest.fixture
def state_module():
    return StateModule(EventBus())


def _drive_sensor_update(sm, monkeypatch, source):
    """Run StateModule._handle_sensor_update once; return the list of payloads
    it tried to publish to MQTT."""
    published = []

    async def fake_publish(values):
        published.append(values)

    async def noop_pulse(*args, **kwargs):
        # Skip the DB write + alert state machine; not under test here.
        pass

    monkeypatch.setattr(sm, "_publish_sensor_data_to_mqtt", fake_publish)
    monkeypatch.setattr(sm, "_handle_pulse_ox_update", noop_pulse)

    event = SensorUpdate(ts=datetime.now(), values={"spo2": 97}, raw="raw", source=source)
    asyncio.run(sm._handle_sensor_update(event))
    return published


def test_mqtt_sourced_update_is_not_republished(state_module, monkeypatch):
    # The whole point: republishing an MQTT-origin update is the infinite loop.
    published = _drive_sensor_update(state_module, monkeypatch, EventSource.MQTT)
    assert published == []


def test_serial_sourced_update_is_republished(state_module, monkeypatch):
    # Non-MQTT origins (serial/manual) DO fan out to MQTT.
    published = _drive_sensor_update(state_module, monkeypatch, EventSource.SERIAL)
    assert published == [{"spo2": 97}]


def test_mqtt_sourced_update_still_updates_local_state(state_module, monkeypatch):
    # Loop prevention must not skip the in-memory state update itself.
    _drive_sensor_update(state_module, monkeypatch, EventSource.MQTT)
    assert state_module.sensor_state["spo2"] == 97


# --- Alarm-flag mapping (MQTTModule._compute_alarm_flags) --------------------
# Pure function: SpO2/BPM reading -> HA binary-sensor "ON"/"OFF". The safe
# default is "OFF" so HA never shows "Unknown" for an alarm that isn't firing.

THRESHOLDS = (90, 100, 55, 155)  # min_spo2, max_spo2, min_bpm, max_bpm


def test_alarm_flags_in_range_are_off():
    flags = MQTTModule._compute_alarm_flags({"spo2": 97, "bpm": 70}, THRESHOLDS)
    assert flags == {"spo2_alarm": "OFF", "bpm_alarm": "OFF"}


def test_alarm_flags_out_of_range_are_on():
    flags = MQTTModule._compute_alarm_flags({"spo2": 80, "bpm": 200}, THRESHOLDS)
    assert flags == {"spo2_alarm": "ON", "bpm_alarm": "ON"}


def test_alarm_flags_disconnected_sensor_is_off():
    # -1 is the "sensor disconnected" sentinel — never an alarm.
    flags = MQTTModule._compute_alarm_flags({"spo2": -1, "bpm": -1}, THRESHOLDS)
    assert flags == {"spo2_alarm": "OFF", "bpm_alarm": "OFF"}


def test_alarm_flags_missing_reading_is_off():
    flags = MQTTModule._compute_alarm_flags({}, THRESHOLDS)
    assert flags == {"spo2_alarm": "OFF", "bpm_alarm": "OFF"}
