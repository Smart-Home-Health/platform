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
MQTT Discovery - Home Assistant MQTT Discovery functionality

Multi-patient: one sensor entity per enabled vital per patient.
State topic: { base_topic }/patient/{ patient_id }/state with JSON { spo2, bpm, perfusion, ... }.
Device and entity names use the patient's name (e.g. "john"), not "Patient 1".
"""
import json
import logging
import re
from typing import Dict, Any, Optional, List, Tuple
from .settings import get_mqtt_settings, get_patients_with_mqtt_enabled

logger = logging.getLogger('mqtt.discovery')

# Section key -> (value_template, unit_of_measurement, display_name, sensor_type) for discovery.
# sensor_type is "sensor" for measurements, "binary_sensor" for alarms.
# Sections with get/both permission get one sensor each; state_topic is same for all (combined JSON).
# blood_pressure and nutrition are special-cased in the loop.
SECTION_DISCOVERY: Dict[str, Tuple[str, str, str, str]] = {
    "spo2": ("{{ value_json.spo2 }}", "%", "SpO₂", "sensor"),
    "bpm": ("{{ value_json.bpm }}", "BPM", "Heart Rate", "sensor"),
    "heart_rate": ("{{ value_json.bpm }}", "BPM", "Heart Rate", "sensor"),
    "perfusion": ("{{ value_json.perfusion }}", "PI", "Perfusion", "sensor"),
    "temperature": ("{{ value_json.body_temp | default(value_json.skin_temp) }}", "°F", "Temperature", "sensor"),
    "blood_pressure": ("{{ value_json.map_bp | default(value_json.systolic_bp) }}", "mmHg", "Blood Pressure", "sensor"),
    "weight": ("{{ value_json.weight }}", "lbs", "Weight", "sensor"),
    "bathroom": ("{{ value_json.bathroom }}", "", "Bathroom Activity", "sensor"),
    "spo2_alarm": ("{{ value_json.spo2_alarm }}", "", "SpO₂ Alarm", "binary_sensor"),
    "bpm_alarm": ("{{ value_json.bpm_alarm }}", "", "Heart Rate Alarm", "binary_sensor"),
    "alarm1": ("{{ value_json.alarm1 }}", "", "GPIO Alarm 1", "binary_sensor"),
    "alarm2": ("{{ value_json.alarm2 }}", "", "GPIO Alarm 2", "binary_sensor"),
}

# Sections whose value is categorical text, not a numeric measurement — these
# must NOT get state_class=measurement (HA would mark them Unavailable).
TEXT_SECTIONS = {"bathroom"}

# Blood pressure: three sensors per patient (systolic, diastolic, MAP) on same state_topic
BLOOD_PRESSURE_SENSORS: List[Tuple[str, str, str]] = [
    ("{{ value_json.systolic_bp }}", "mmHg", "Blood Pressure Systolic"),
    ("{{ value_json.diastolic_bp }}", "mmHg", "Blood Pressure Diastolic"),
    ("{{ value_json.map_bp }}", "mmHg", "Blood Pressure MAP"),
]

# Nutrition: calorie + water sensors per patient on the same combined state_topic.
# Last given feed, today's running total, and the daily goal (kcal / mL).
NUTRITION_SENSORS: List[Tuple[str, str, str, str]] = [
    ("{{ value_json.calories_last }}", "kcal", "Calories Last", "calories_last"),
    ("{{ value_json.calories_intake }}", "kcal", "Calories Today", "calories_intake"),
    ("{{ value_json.calories_target }}", "kcal", "Calories Goal", "calories_target"),
    ("{{ value_json.water_last }}", "mL", "Water Last", "water_last"),
    ("{{ value_json.water_intake }}", "mL", "Water Today", "water_intake"),
    ("{{ value_json.water_target }}", "mL", "Water Goal", "water_target"),
]

# Badge-count sections: each expands into two sensors (due now + late). Values
# are integers published into the combined state by MQTTModule. Keyed by the
# section id used in the per-patient MQTT config.
# Entries: (value_template, display_name, state_key_suffix)
BADGE_SENSORS: Dict[str, List[Tuple[str, str, str]]] = {
    "meds_counts": [
        ("{{ value_json.meds_due_now }}", "Medications Due Now", "meds_due_now"),
        ("{{ value_json.meds_late }}", "Medications Late", "meds_late"),
    ],
    "nutrition_counts": [
        ("{{ value_json.nutrition_due_now }}", "Nutrition Due Now", "nutrition_due_now"),
        ("{{ value_json.nutrition_late }}", "Nutrition Late", "nutrition_late"),
    ],
    "care_task_counts": [
        ("{{ value_json.care_tasks_due_now }}", "Care Tasks Due Now", "care_tasks_due_now"),
        ("{{ value_json.care_tasks_late }}", "Care Tasks Late", "care_tasks_late"),
    ],
    "equipment_counts": [
        ("{{ value_json.equipment_due_now }}", "Equipment Due Now", "equipment_due_now"),
        ("{{ value_json.equipment_late }}", "Equipment Late", "equipment_late"),
    ],
}


def _safe_device_id(name: str, patient_id: int) -> str:
    """HA-friendly device identifier: lowercase alphanumeric + underscores, fallback to patient id."""
    if not name:
        return f"shh_patient_{patient_id}"
    safe = re.sub(r"[^a-z0-9]+", "_", name.lower().strip()).strip("_")
    return f"shh_{safe}" if safe else f"shh_patient_{patient_id}"


def _publish_discovery(
    mqtt_client, discovery_prefix: str, sensor_type: str,
    sensor_id: str, uniq_id: str, name: str,
    state_topic: str, val_tpl: str, unit: str,
    device_info: dict, **extra,
) -> int:
    """Publish a single discovery message. Returns 1 on success, 0 on failure."""
    config = {
        "uniq_id": uniq_id,
        "name": name,
        "stat_t": state_topic,
        "val_tpl": val_tpl,
        "json_attr_t": state_topic,
        "avty_t": f"{state_topic.rsplit('/patient/', 1)[0]}/availability",
        "dev": device_info,
        **extra,
    }
    if unit:
        config["unit_of_meas"] = unit
    discovery_topic = f"{discovery_prefix}/{sensor_type}/{sensor_id}/config"
    try:
        result = mqtt_client.publish(discovery_topic, json.dumps(config), retain=True)
        if result.rc == 0:
            logger.info(f"Sent MQTT Discovery for {name} to {discovery_topic}")
            return 1
        else:
            logger.error(f"Failed to send discovery for {sensor_id}: rc={result.rc}")
            return 0
    except Exception as e:
        logger.error(f"Error sending discovery for {sensor_id}: {e}")
        return 0


def send_mqtt_discovery(mqtt_client, patient_id: Optional[int] = None) -> bool:
    """
    Send MQTT Discovery messages to Home Assistant.

    When patient_id is set, send discovery only for that patient.
    When patient_id is None, send discovery for all patients with MQTT enabled.
    Uses patient name (e.g. "john") for device/entity names, not "Patient #".
    Sends one sensor per enabled section (SpO₂, Heart Rate, Perfusion, Temperature, Blood Pressure)
    that has get or both permission.

    Args:
        mqtt_client: The connected MQTT client
        patient_id: If set, only this patient; else all enabled patients

    Returns:
        bool: True if at least one discovery message was sent successfully
    """
    if not mqtt_client or not mqtt_client.is_connected():
        logger.error("MQTT client not available for discovery")
        return False

    settings = get_mqtt_settings()
    if not settings['enabled']:
        logger.warning("MQTT disabled, skipping discovery")
        return False

    base_topic = settings.get('base_topic', 'shh')

    patients: List[Dict[str, Any]] = get_patients_with_mqtt_enabled()
    if patient_id is not None:
        patients = [p for p in patients if p["patient_id"] == patient_id]
    if not patients:
        logger.info("No patients with MQTT enabled for discovery")
        return False

    discovery_prefix = "homeassistant"
    success_count = 0

    for entry in patients:
        pid = entry["patient_id"]
        patient_name = entry.get("patient_name") or f"Patient {pid}"
        sections = (entry.get("settings") or {}).get("sections") or {}
        state_topic = f"{base_topic}/patient/{pid}/state"
        device_ident = _safe_device_id(patient_name, pid)
        device_info = {
            "identifiers": [device_ident],
            "name": patient_name,
            "mf": "Smart Home Health",
            "mdl": "Smart Healthcare Hub",
        }

        # One sensor per section that allows get or both.
        # blood_pressure → three sensors (systolic, diastolic, MAP).
        # nutrition → six sensors (water/calories intake, scheduled, target).
        for section_key, perm in sections.items():
            if perm not in ("get", "both"):
                continue

            # --- Blood pressure: expand to three sensors ---
            if section_key == "blood_pressure":
                for idx, (val_tpl, unit, display_name) in enumerate(BLOOD_PRESSURE_SENSORS):
                    safe_section = f"blood_pressure_{['systolic', 'diastolic', 'map'][idx]}"
                    success_count += _publish_discovery(
                        mqtt_client, discovery_prefix, "sensor",
                        f"{device_ident}_{safe_section}",
                        f"{base_topic}_patient_{pid}_{safe_section}",
                        f"{patient_name} {display_name}",
                        state_topic, val_tpl, unit, device_info,
                        stat_cla="measurement",
                    )
                continue

            # --- Nutrition: expand to six sensors ---
            if section_key == "nutrition":
                for val_tpl, unit, display_name, suffix in NUTRITION_SENSORS:
                    safe_section = f"nutrition_{suffix}"
                    success_count += _publish_discovery(
                        mqtt_client, discovery_prefix, "sensor",
                        f"{device_ident}_{safe_section}",
                        f"{base_topic}_patient_{pid}_{safe_section}",
                        f"{patient_name} {display_name}",
                        state_topic, val_tpl, unit, device_info,
                        stat_cla="measurement",
                    )
                continue

            # --- Badge counts: expand to two sensors (due now + late) ---
            if section_key in BADGE_SENSORS:
                for val_tpl, display_name, suffix in BADGE_SENSORS[section_key]:
                    success_count += _publish_discovery(
                        mqtt_client, discovery_prefix, "sensor",
                        f"{device_ident}_{suffix}",
                        f"{base_topic}_patient_{pid}_{suffix}",
                        f"{patient_name} {display_name}",
                        state_topic, val_tpl, "", device_info,
                        stat_cla="measurement",
                    )
                continue

            # --- Standard and alarm sections ---
            section_config = SECTION_DISCOVERY.get(section_key)
            if not section_config:
                logger.warning(f"Unknown MQTT section '{section_key}' for patient {pid}, skipping")
                continue
            val_tpl, unit, display_name, sensor_type = section_config
            safe_section = section_key.replace(" ", "_").lower()

            extra = {}
            if sensor_type == "binary_sensor":
                extra["pl_on"] = "ON"
                extra["pl_off"] = "OFF"
                extra["dev_cla"] = "problem"
            elif section_key not in TEXT_SECTIONS:
                # state_class=measurement requires a numeric state; categorical
                # text sensors (e.g. bathroom: urine/bowel/both) must omit it or
                # HA marks them Unavailable on a non-numeric value.
                extra["stat_cla"] = "measurement"

            success_count += _publish_discovery(
                mqtt_client, discovery_prefix, sensor_type,
                f"{device_ident}_{safe_section}",
                f"{base_topic}_patient_{pid}_{safe_section}",
                f"{patient_name} {display_name}",
                state_topic, val_tpl, unit, device_info,
                **extra,
            )

    logger.info(f"Sent {success_count} MQTT Discovery messages (per-vital per patient)")
    return success_count > 0
