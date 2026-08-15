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
Inbound HA ingestion logic: config/state accessors and the routing of one HA
entity state into either a Vital row or an environmental observation.

Connection config is home-level (settings table, same two-key pattern as
environment connectors: config vs machine-state so status writes never race a
user's config save). Entity mappings live in the ha_entity_mappings table.
"""
import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from environment import metrics as env_metrics
from environment import service as env_service
from environment.base import EnvObservation
from homeassistant.client import parse_ha_timestamp, supervisor_available
from schemas.ha_entity_mapping import HAEntityMapping
from schemas.vital import Vital

logger = logging.getLogger("homeassistant")

CONFIG_KEY = "homeassistant.config"   # {enabled, mode, base_url, token}
STATE_KEY = "homeassistant.state"     # {connected, last_connect_at, last_event_at, last_error}

SOURCE_TYPE = "home_assistant"

# HA state strings that are lifecycle placeholders, not readings.
NON_NUMERIC_STATES = {"unavailable", "unknown", "none", ""}

TARGET_KINDS = ("vital", "environment")

# The app's event loop, set by the listener at startup so vital_saved events
# can be published from worker threads (asyncio.to_thread) as well.
_main_loop = None


def set_main_loop(loop) -> None:
    global _main_loop
    _main_loop = loop


# ---------------------------------------------------------------------------
# Config / state (settings table)
# ---------------------------------------------------------------------------

def get_config(db: Session) -> Dict:
    from crud.settings import get_setting
    return get_setting(db, CONFIG_KEY) or {}


def save_config(db: Session, config: Dict) -> None:
    from crud.settings import save_setting
    import json
    save_setting(db, CONFIG_KEY, json.dumps(config), data_type="json",
                 description="Inbound Home Assistant integration config")


def get_state(db: Session) -> Dict:
    from crud.settings import get_setting
    return get_setting(db, STATE_KEY) or {}


def save_state(db: Session, **updates) -> Dict:
    """Merge ``updates`` into the persisted runtime state and return it."""
    from crud.settings import save_setting
    import json
    state = get_state(db)
    state.update(updates)
    save_setting(db, STATE_KEY, json.dumps(state), data_type="json",
                 description="Inbound Home Assistant integration state")
    return state


def connection_available(config: Dict) -> bool:
    """Whether a connection could be established with this config."""
    config = config or {}
    if (config.get("mode") or "auto") != "external" and supervisor_available():
        return True
    return bool((config.get("base_url") or "").strip() and (config.get("token") or "").strip())


# ---------------------------------------------------------------------------
# Unit conversion (environment targets only; vitals store HA's unit as-is)
# ---------------------------------------------------------------------------

def _c_from_f(v: float) -> float:
    return (v - 32.0) * 5.0 / 9.0


# metric -> {source unit (lowercased) -> converter to the canonical unit}.
# The canonical unit itself always passes through; aliases listed explicitly.
_ENV_CONVERTERS: Dict[str, Dict[str, Any]] = {
    "temperature": {"°c": None, "c": None, "°f": _c_from_f, "f": _c_from_f,
                    "k": lambda v: v - 273.15},
    "barometric_pressure": {
        "hpa": None, "mbar": None, "mmhg": lambda v: v * 1.33322,
        "inhg": lambda v: v * 33.8639, "kpa": lambda v: v * 10.0,
        "psi": lambda v: v * 68.9476, "pa": lambda v: v / 100.0,
    },
    "relative_humidity": {"%": None},
    "precipitation": {"mm": None, "in": lambda v: v * 25.4},
    "aqi": {"aqi": None, "": None},
    "pm25": {"µg/m³": None, "ug/m3": None, "µg/m3": None,
             "mg/m³": lambda v: v * 1000.0, "mg/m3": lambda v: v * 1000.0},
    "ozone": {"µg/m³": None, "ug/m3": None, "µg/m3": None,
              "mg/m³": lambda v: v * 1000.0, "mg/m3": lambda v: v * 1000.0},
    "pollen": {"grains/m³": None, "grains/m3": None},
    "co2": {"ppm": None},
    "voc": {"ppb": None, "ppm": lambda v: v * 1000.0},
    "noise_level": {"db": None, "dba": None, "db(a)": None},
}
_ENV_CONVERTERS["barometric_pressure_msl"] = _ENV_CONVERTERS["barometric_pressure"]


def convert_to_canonical(value: float, source_unit: Optional[str], metric: str) -> float:
    """
    Convert a reading to the metric's canonical unit. An empty source unit is
    trusted as already-canonical (some HA sensors omit units). Raises
    ValueError for units we can't convert — better loud than silently wrong.
    """
    canonical = env_metrics.canonical_unit(metric)  # raises on unknown metric
    unit = (source_unit or "").strip()
    if not unit or unit == canonical:
        return float(value)
    converter_map = _ENV_CONVERTERS.get(metric, {})
    if unit.lower() in converter_map:
        converter = converter_map[unit.lower()]
        return float(value) if converter is None else float(converter(float(value)))
    raise ValueError(
        f"Cannot convert unit {source_unit!r} to {canonical!r} for metric {metric!r}"
    )


def convertible_unit(source_unit: Optional[str], metric: str) -> bool:
    try:
        convert_to_canonical(1.0, source_unit, metric)
        return True
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# State-event routing
# ---------------------------------------------------------------------------

def handle_state_event(db: Session, mapping: HAEntityMapping,
                       new_state: Dict[str, Any]) -> bool:
    """
    Route one HA state object through a mapping. Returns True when a row was
    recorded. The caller owns the commit. Never raises: routing errors are
    written to mapping.last_error instead (visible in the admin UI).
    """
    raw_value = new_state.get("state")
    if raw_value is None or str(raw_value).strip().lower() in NON_NUMERIC_STATES:
        return False
    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        mapping.last_error = f"Non-numeric state: {raw_value!r}"
        return False

    ts = parse_ha_timestamp(new_state.get("last_updated")) or datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)

    last_seen = mapping.last_seen_at
    if last_seen is not None and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    if last_seen is not None:
        # Replays (reconnect seeding) and out-of-order frames.
        if ts <= last_seen:
            return False
        # Optional per-mapping throttle, measured against the last *recorded*
        # reading so a chatty sensor can't starve itself.
        if mapping.min_interval_seconds and \
                (ts - last_seen).total_seconds() < mapping.min_interval_seconds:
            return False

    attributes = new_state.get("attributes") or {}
    unit = attributes.get("unit_of_measurement") or mapping.source_unit

    try:
        if mapping.target_kind == "vital":
            recorded = _record_vital(db, mapping, value, unit, ts, new_state)
        elif mapping.target_kind == "environment":
            recorded = _record_environment(db, mapping, value, unit, ts)
        else:
            mapping.last_error = f"Unknown target_kind: {mapping.target_kind!r}"
            return False
    except Exception as e:
        logger.error(f"[homeassistant] {mapping.entity_id}: recording failed: {e}")
        mapping.last_error = str(e)[:500]
        return False

    # Staleness reflects the last successfully routed state either way; the
    # return value reports whether a NEW row landed (a dedup hit means this
    # exact reading is already stored, so it's a no-op, not a record).
    mapping.last_seen_at = ts
    mapping.last_value = value
    mapping.last_error = None
    return recorded


def _external_id(entity_id: str, ts: datetime) -> str:
    """Stable dedup id within Vital.external_id's String(100) limit."""
    digest = hashlib.sha1(f"{entity_id}|{ts.isoformat()}".encode()).hexdigest()[:32]
    return f"ha:{digest}"


def _record_vital(db: Session, mapping: HAEntityMapping, value: float,
                  unit: Optional[str], ts: datetime, new_state: Dict[str, Any]) -> bool:
    """Insert a Vital row; returns False when the reading is already stored."""
    from terminology import loinc_for, ucum_for

    external_id = _external_id(mapping.entity_id, ts)
    if db.query(Vital.id).filter(Vital.external_id == external_id).first():
        return False

    # BP components are stored as vital_type="blood_pressure" + vital_group,
    # but LOINC codes are per-component.
    loinc_type = mapping.vital_type
    if mapping.vital_type == "blood_pressure" and mapping.vital_group in ("systolic", "diastolic", "map"):
        loinc_type = f"blood_pressure_{mapping.vital_group}"

    now = datetime.utcnow()
    db.add(Vital(
        account_id=mapping.account_id,
        patient_id=mapping.patient_id,
        vital_type=mapping.vital_type,
        vital_group=mapping.vital_group,
        value=value,
        unit=unit,
        code=loinc_for(loinc_type, source=SOURCE_TYPE),
        ucum_unit=ucum_for(unit),
        source=SOURCE_TYPE,
        device_id=mapping.entity_id[:100],
        external_id=external_id,
        raw_data={"entity_id": mapping.entity_id,
                  "state": new_state.get("state"),
                  "attributes": new_state.get("attributes")},
        timestamp=ts,
        created_at=now,
    ))
    _publish_vital_saved(mapping, value)
    return True


def _publish_vital_saved(mapping: HAEntityMapping, value: float) -> None:
    """
    Publish the same "vital_saved" topic event the manual-vitals route emits,
    so the websocket module refreshes clients and the MQTT module republishes
    weight/temperature/BP on the patient's combined-state topic. from_manual
    here means "did not arrive via our MQTT broker" — the flag exists for MQTT
    loop prevention, and the HA WebSocket is a different transport entirely.
    """
    if mapping.vital_type == "blood_pressure" and mapping.vital_group:
        vital_data: Dict[str, Any] = {mapping.vital_group: value}
    elif mapping.vital_type == "temperature":
        key = "skin_temp" if mapping.vital_group == "skin" else "body_temp"
        vital_data = {key: value}
    else:
        vital_data = {"value": value}
    try:
        import asyncio
        from main import get_modules
        event_bus = get_modules().get("event_bus")
        if not event_bus:
            return
        event = {"type": "vital_saved", "data": {
            "vital_type": mapping.vital_type,
            "vital_data": vital_data,
            "from_manual": True,
            "patient_id": mapping.patient_id,
        }}
        coro = event_bus.publish(event, topic="vital_saved")
        try:
            asyncio.get_running_loop().create_task(coro)
        except RuntimeError:
            # Worker thread (asyncio.to_thread in the listener).
            if _main_loop is not None:
                asyncio.run_coroutine_threadsafe(coro, _main_loop)
            else:
                coro.close()
    except Exception as e:
        logger.error(f"Failed to publish vital_saved for {mapping.entity_id}: {e}")


def _record_environment(db: Session, mapping: HAEntityMapping, value: float,
                        unit: Optional[str], ts: datetime) -> bool:
    """Emit one observation; returns False when deduped as already stored."""
    canonical_value = convert_to_canonical(value, unit, mapping.metric)
    return 0 < env_service.emit_observations(db, SOURCE_TYPE, [EnvObservation(
        timestamp=ts,
        metric=mapping.metric,
        value=round(canonical_value, 2),
        unit=env_metrics.canonical_unit(mapping.metric),
        scope=mapping.scope or "room",
        location=mapping.location or "",
        source_id=mapping.entity_id,
        quality="measured",
    )])
