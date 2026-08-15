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
Inbound Home Assistant integration: client config resolution, unit
conversion, state-event -> vital/observation routing, and the
/api/integrations/home_assistant routes. No sockets — the HA client is
monkeypatched at the route module (same approach as test_ha_directory.py).
"""
from datetime import datetime, timedelta, timezone

import pytest

from homeassistant import service as ha_service
from homeassistant.client import (
    HAClient, HAClientError, HAEntity, _is_shh_device, parse_ha_timestamp,
    SUPERVISOR_REST_URL, SUPERVISOR_WS_URL,
)
from schemas.ha_entity_mapping import HAEntityMapping
from schemas.environmental_observation import EnvironmentalObservation
from schemas.vital import Vital


# ---------------------------------------------------------------------------
# Client config resolution
# ---------------------------------------------------------------------------

def test_from_config_prefers_supervisor(monkeypatch):
    monkeypatch.setenv("SUPERVISOR_TOKEN", "sup-token")
    client = HAClient.from_config({})
    assert client.ws_url == SUPERVISOR_WS_URL
    assert client.rest_url == SUPERVISOR_REST_URL
    assert client.token == "sup-token"


def test_from_config_external_mode_ignores_supervisor(monkeypatch):
    monkeypatch.setenv("SUPERVISOR_TOKEN", "sup-token")
    client = HAClient.from_config({
        "mode": "external", "base_url": "http://ha.local:8123", "token": "llat",
    })
    assert client.ws_url == "ws://ha.local:8123/api/websocket"
    assert client.rest_url == "http://ha.local:8123/api"
    assert client.token == "llat"


def test_from_config_https_derives_wss(monkeypatch):
    monkeypatch.delenv("SUPERVISOR_TOKEN", raising=False)
    client = HAClient.from_config({"base_url": "https://ha.example.org/", "token": "t"})
    assert client.ws_url == "wss://ha.example.org/api/websocket"
    assert client.rest_url == "https://ha.example.org/api"


def test_from_config_unconfigured_raises(monkeypatch):
    monkeypatch.delenv("SUPERVISOR_TOKEN", raising=False)
    with pytest.raises(HAClientError):
        HAClient.from_config({})


def test_connection_available(monkeypatch):
    monkeypatch.delenv("SUPERVISOR_TOKEN", raising=False)
    assert not ha_service.connection_available({})
    assert ha_service.connection_available({"base_url": "http://x", "token": "t"})
    monkeypatch.setenv("SUPERVISOR_TOKEN", "sup")
    assert ha_service.connection_available({})
    assert not ha_service.connection_available({"mode": "external"})


def test_is_shh_device_detection():
    assert _is_shh_device({"manufacturer": "Smart Home Health"})
    assert _is_shh_device({"identifiers": [["mqtt", "shh_pat_ient"]]})
    assert not _is_shh_device({"manufacturer": "Aranet", "identifiers": [["ble", "aranet4"]]})
    assert not _is_shh_device({})


def test_parse_ha_timestamp():
    ts = parse_ha_timestamp("2026-08-15T12:00:00.123456+00:00")
    assert ts is not None and ts.tzinfo is not None
    assert parse_ha_timestamp("2026-08-15T12:00:00Z") is not None
    assert parse_ha_timestamp("garbage") is None
    assert parse_ha_timestamp(None) is None


# ---------------------------------------------------------------------------
# Unit conversion
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("value,unit,metric,expected", [
    (68.0, "°F", "temperature", 20.0),
    (20.0, "°C", "temperature", 20.0),
    (29.92, "inHg", "barometric_pressure", pytest.approx(1013.2, abs=0.5)),
    (101.3, "kPa", "barometric_pressure", pytest.approx(1013.0)),
    (0.012, "mg/m³", "pm25", pytest.approx(12.0)),
    (45.0, "%", "relative_humidity", 45.0),
    (700.0, "ppm", "co2", 700.0),
    (0.5, "ppm", "voc", 500.0),
    (42.0, None, "aqi", 42.0),  # unitless sensors trusted as canonical
])
def test_convert_to_canonical(value, unit, metric, expected):
    assert ha_service.convert_to_canonical(value, unit, metric) == expected


def test_convert_unknown_unit_raises():
    with pytest.raises(ValueError, match="Cannot convert"):
        ha_service.convert_to_canonical(1.0, "furlongs", "temperature")
    assert not ha_service.convertible_unit("furlongs", "temperature")
    assert ha_service.convertible_unit("°F", "temperature")


# ---------------------------------------------------------------------------
# State-event routing
# ---------------------------------------------------------------------------

def _mapping(db, patient=None, **kw):
    now = datetime.utcnow()
    defaults = dict(
        entity_id="sensor.test_entity", target_kind="vital",
        enabled=True, min_interval_seconds=0, created_at=now, updated_at=now,
    )
    if patient is not None:
        defaults.update(patient_id=patient.id, account_id=patient.account_id)
    defaults.update(kw)
    mapping = HAEntityMapping(**defaults)
    db.add(mapping)
    db.commit()
    return mapping


def _state(value, ts="2026-08-15T12:00:00+00:00", unit="bpm", entity="sensor.test_entity"):
    return {
        "entity_id": entity,
        "state": value,
        "attributes": {"unit_of_measurement": unit, "friendly_name": "Test"},
        "last_updated": ts,
    }


def test_vital_recording_and_dedup(db_session, patient):
    mapping = _mapping(db_session, patient, vital_type="heart_rate")
    assert ha_service.handle_state_event(db_session, mapping, _state("72"))
    db_session.commit()

    vital = db_session.query(Vital).filter(Vital.patient_id == patient.id).one()
    assert vital.vital_type == "heart_rate"
    assert vital.value == 72.0
    assert vital.unit == "bpm"
    assert vital.source == "home_assistant"
    assert vital.device_id == "sensor.test_entity"
    assert vital.external_id.startswith("ha:")
    assert vital.code is not None  # LOINC enrichment
    assert mapping.last_value == 72.0
    assert mapping.last_error is None

    # Same timestamp again (reconnect seed replay) -> nothing recorded.
    assert not ha_service.handle_state_event(db_session, mapping, _state("72"))
    assert db_session.query(Vital).filter(Vital.patient_id == patient.id).count() == 1

    # Dedup hit with no last_seen (e.g. mapping re-created): the existing row
    # is found via external_id -> no-op result, but staleness still refreshes.
    mapping.last_seen_at = None
    mapping.last_value = None
    assert not ha_service.handle_state_event(db_session, mapping, _state("72"))
    assert db_session.query(Vital).filter(Vital.patient_id == patient.id).count() == 1
    assert mapping.last_value == 72.0


def test_bp_component_gets_component_loinc(db_session, patient):
    from terminology import loinc_for
    mapping = _mapping(db_session, patient, vital_type="blood_pressure",
                       vital_group="systolic", entity_id="sensor.bp_sys")
    assert ha_service.handle_state_event(
        db_session, mapping, _state("118", unit="mmHg", entity="sensor.bp_sys"))
    db_session.commit()  # SessionLocal has autoflush=False
    vital = db_session.query(Vital).filter(Vital.vital_group == "systolic").one()
    assert vital.vital_type == "blood_pressure"
    assert vital.code == loinc_for("blood_pressure_systolic")


@pytest.mark.parametrize("bad_state", ["unavailable", "unknown", "", None])
def test_lifecycle_states_skipped(db_session, patient, bad_state):
    mapping = _mapping(db_session, patient, vital_type="heart_rate")
    assert not ha_service.handle_state_event(db_session, mapping, _state(bad_state))
    assert db_session.query(Vital).filter(Vital.patient_id == patient.id).count() == 0
    assert mapping.last_error is None  # lifecycle states are not errors


def test_non_numeric_state_sets_last_error(db_session, patient):
    mapping = _mapping(db_session, patient, vital_type="heart_rate")
    assert not ha_service.handle_state_event(db_session, mapping, _state("detected"))
    assert "Non-numeric" in mapping.last_error


def test_min_interval_throttle(db_session, patient):
    mapping = _mapping(db_session, patient, vital_type="heart_rate",
                       min_interval_seconds=3600)
    base = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)
    assert ha_service.handle_state_event(
        db_session, mapping, _state("70", ts=base.isoformat()))
    # 60s later: inside the interval -> skipped, last_seen unchanged.
    assert not ha_service.handle_state_event(
        db_session, mapping, _state("71", ts=(base + timedelta(seconds=60)).isoformat()))
    assert mapping.last_value == 70.0
    # 2h later: recorded.
    assert ha_service.handle_state_event(
        db_session, mapping, _state("75", ts=(base + timedelta(hours=2)).isoformat()))
    assert mapping.last_value == 75.0


def test_environment_recording_with_conversion(db_session):
    mapping = _mapping(
        db_session, target_kind="environment", entity_id="sensor.bedroom_temp",
        metric="temperature", scope="room", location="bedroom",
    )
    assert ha_service.handle_state_event(
        db_session, mapping,
        _state("68.0", unit="°F", entity="sensor.bedroom_temp"))
    db_session.commit()

    obs = db_session.query(EnvironmentalObservation).filter(
        EnvironmentalObservation.source_type == "home_assistant").one()
    assert obs.metric == "temperature"
    assert obs.value == 20.0            # converted to °C
    assert obs.unit == "°C"
    assert obs.scope == "room"
    assert obs.location == "bedroom"
    assert obs.source_id == "sensor.bedroom_temp"
    assert obs.quality == "measured"


def test_environment_unconvertible_unit_sets_error(db_session):
    mapping = _mapping(
        db_session, target_kind="environment", entity_id="sensor.weird",
        metric="co2", scope="room", location="",
    )
    assert not ha_service.handle_state_event(
        db_session, mapping, _state("500", unit="banana", entity="sensor.weird"))
    assert "Cannot convert" in mapping.last_error


# ---------------------------------------------------------------------------
# Routes: config
# ---------------------------------------------------------------------------

def test_config_roundtrip_and_token_masking(admin_client, monkeypatch):
    monkeypatch.delenv("SUPERVISOR_TOKEN", raising=False)
    resp = admin_client.get("/api/integrations/home_assistant/config")
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False

    resp = admin_client.put("/api/integrations/home_assistant/config", json={
        "enabled": True, "base_url": "http://ha.local:8123", "token": "secret-llat",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    assert body["token_set"] is True
    assert "secret-llat" not in resp.text  # token never leaves the backend

    # Token omitted on re-save -> saved token kept.
    resp = admin_client.put("/api/integrations/home_assistant/config", json={
        "enabled": True, "base_url": "http://ha.local:8123",
    })
    assert resp.status_code == 200
    assert resp.json()["token_set"] is True


def test_enable_without_connection_rejected(admin_client, monkeypatch):
    monkeypatch.delenv("SUPERVISOR_TOKEN", raising=False)
    resp = admin_client.put("/api/integrations/home_assistant/config", json={
        "enabled": True,
    })
    assert resp.status_code == 400


def test_test_endpoint_reports_failure_as_ok_false(admin_client, monkeypatch):
    monkeypatch.delenv("SUPERVISOR_TOKEN", raising=False)
    resp = admin_client.post("/api/integrations/home_assistant/test", json={
        "enabled": False, "base_url": "", "token": "",
    })
    assert resp.status_code == 200
    assert resp.json()["ok"] is False


# ---------------------------------------------------------------------------
# Routes: mappings
# ---------------------------------------------------------------------------

def _vital_mapping_body(patient, **kw):
    body = {
        "entity_id": "sensor.spo2_ring", "target_kind": "vital",
        "patient_id": patient.id, "vital_type": "spo2", "source_unit": "%",
    }
    body.update(kw)
    return body


def test_mapping_crud(admin_client, patient):
    resp = admin_client.post("/api/integrations/home_assistant/mappings",
                             json=_vital_mapping_body(patient))
    assert resp.status_code == 201
    mapping_id = resp.json()["id"]

    # Duplicate entity -> 409.
    resp = admin_client.post("/api/integrations/home_assistant/mappings",
                             json=_vital_mapping_body(patient))
    assert resp.status_code == 409

    resp = admin_client.get("/api/integrations/home_assistant/mappings")
    assert [m["entity_id"] for m in resp.json()] == ["sensor.spo2_ring"]

    resp = admin_client.put(
        f"/api/integrations/home_assistant/mappings/{mapping_id}",
        json={"enabled": False, "min_interval_seconds": 300})
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False
    assert resp.json()["min_interval_seconds"] == 300

    resp = admin_client.delete(f"/api/integrations/home_assistant/mappings/{mapping_id}")
    assert resp.status_code == 200
    assert admin_client.get("/api/integrations/home_assistant/mappings").json() == []


def test_vital_mapping_requires_patient_and_type(admin_client, patient):
    body = _vital_mapping_body(patient)
    del body["patient_id"]
    assert admin_client.post("/api/integrations/home_assistant/mappings",
                             json=body).status_code == 400

    body = _vital_mapping_body(patient, vital_type="parsecs")
    assert admin_client.post("/api/integrations/home_assistant/mappings",
                             json=body).status_code == 400


def test_vital_mapping_foreign_patient_rejected(admin_client, db_session):
    from models.users import Account
    other = Account(name="Other House", slug="other-house", password_hash="x")
    db_session.add(other)
    db_session.flush()
    from crud.patients import create_patient
    foreign = create_patient(db_session, {
        "first_name": "Not", "last_name": "Mine",
        "account_id": other.id, "is_active": True,
    })
    db_session.commit()
    resp = admin_client.post("/api/integrations/home_assistant/mappings",
                             json=_vital_mapping_body(foreign))
    assert resp.status_code == 404


def test_mappings_scoped_to_account(admin_client, db_session):
    """Another account's mappings are invisible to list/update/delete."""
    from models.users import Account
    other = Account(name="Other House 2", slug="other-house-2", password_hash="x")
    db_session.add(other)
    db_session.flush()
    foreign = _mapping(db_session, entity_id="sensor.foreign_co2",
                       account_id=other.id, target_kind="environment",
                       metric="co2", scope="room", location="")

    assert admin_client.get("/api/integrations/home_assistant/mappings").json() == []
    assert admin_client.get("/api/integrations/home_assistant/status").json()["mapping_count"] == 0
    assert admin_client.put(
        f"/api/integrations/home_assistant/mappings/{foreign.id}",
        json={"enabled": False}).status_code == 404
    assert admin_client.delete(
        f"/api/integrations/home_assistant/mappings/{foreign.id}").status_code == 404


def test_environment_mapping_validation(admin_client):
    base = {"entity_id": "sensor.bedroom_co2", "target_kind": "environment",
            "metric": "co2", "scope": "room", "location": "bedroom",
            "source_unit": "ppm"}
    assert admin_client.post("/api/integrations/home_assistant/mappings",
                             json=base).status_code == 201
    assert admin_client.post(
        "/api/integrations/home_assistant/mappings",
        json={**base, "entity_id": "sensor.x", "metric": "vibes"},
    ).status_code == 400
    assert admin_client.post(
        "/api/integrations/home_assistant/mappings",
        json={**base, "entity_id": "sensor.y", "scope": "space"},
    ).status_code == 400
    # Derived metrics are computed, never mapped.
    assert admin_client.post(
        "/api/integrations/home_assistant/mappings",
        json={**base, "entity_id": "sensor.z", "metric": "pressure_delta_6h"},
    ).status_code == 400
    # Unit that can't be converted to canonical.
    assert admin_client.post(
        "/api/integrations/home_assistant/mappings",
        json={**base, "entity_id": "sensor.w", "source_unit": "banana"},
    ).status_code == 400


def test_vital_types_includes_custom(admin_client, db_session, patient):
    from models.custom_vital_definition import CustomVitalDefinition
    db_session.add(CustomVitalDefinition(patient_id=patient.id, name="etco2",
                                         unit="mmHg", display_label="EtCO2"))
    db_session.commit()
    resp = admin_client.get(
        f"/api/integrations/home_assistant/vital-types?patient_id={patient.id}")
    values = {opt["value"] for opt in resp.json()}
    assert {"spo2", "blood_pressure", "temperature", "etco2"} <= values


# ---------------------------------------------------------------------------
# Routes: entities (client monkeypatched at the route module)
# ---------------------------------------------------------------------------

def test_entities_annotated_and_shh_excluded(admin_client, patient, monkeypatch):
    from routes import home_assistant as ha_routes

    entities = [
        HAEntity(entity_id="sensor.spo2_ring", state="97", friendly_name="SpO2 Ring",
                 device_class=None, unit_of_measurement="%", domain="sensor"),
        HAEntity(entity_id="sensor.shh_pat_spo2", state="97", friendly_name="SHH SpO2",
                 device_class=None, unit_of_measurement="%", domain="sensor",
                 is_shh=True),
    ]

    class FakeClient:
        @classmethod
        def from_config(cls, config):
            return cls()

        async def list_entities(self):
            return entities

    monkeypatch.setattr(ha_routes, "HAClient", FakeClient)

    admin_client.post("/api/integrations/home_assistant/mappings",
                      json=_vital_mapping_body(patient))
    resp = admin_client.get("/api/integrations/home_assistant/entities")
    assert resp.status_code == 200
    body = resp.json()
    assert [e["entity_id"] for e in body] == ["sensor.spo2_ring"]  # SHH excluded
    assert body[0]["mapped"] is True

    resp = admin_client.get("/api/integrations/home_assistant/entities?exclude_shh=false")
    assert len(resp.json()) == 2


def test_entities_unreachable_returns_502(admin_client, monkeypatch):
    from routes import home_assistant as ha_routes

    class DeadClient:
        @classmethod
        def from_config(cls, config):
            raise HAClientError("not configured")

    monkeypatch.setattr(ha_routes, "HAClient", DeadClient)
    resp = admin_client.get("/api/integrations/home_assistant/entities")
    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# Status + registries
# ---------------------------------------------------------------------------

def test_status_endpoint(admin_client):
    resp = admin_client.get("/api/integrations/home_assistant/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["connected"] is False
    assert body["mapping_count"] == 0


def test_registered_in_both_frameworks():
    from integrations.registry import get_integration
    from environment.registry import registry as env_registry
    assert get_integration("home_assistant") is not None
    env_connector = env_registry.get("home_assistant")
    assert env_connector is not None
    assert env_connector.poll_capable is False
