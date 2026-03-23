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

# Section key -> (value_template, unit_of_measurement, display_name) for discovery
# Sections with get/both permission get one sensor each; state_topic is same for all (combined JSON).
# blood_pressure is special-cased in the loop to create three sensors (systolic, diastolic, MAP).
SECTION_DISCOVERY: Dict[str, Tuple[str, str, str]] = {
    "spo2": ("{{ value_json.spo2 }}", "%", "SpO₂"),
    "bpm": ("{{ value_json.bpm }}", "BPM", "Heart Rate"),
    "heart_rate": ("{{ value_json.bpm }}", "BPM", "Heart Rate"),
    "perfusion": ("{{ value_json.perfusion }}", "PI", "Perfusion"),
    "temperature": ("{{ value_json.body_temp | default(value_json.skin_temp) }}", "°F", "Temperature"),
    "blood_pressure": ("{{ value_json.map_bp | default(value_json.systolic_bp) }}", "mmHg", "Blood Pressure"),
}

# Blood pressure: three sensors per patient (systolic, diastolic, MAP) on same state_topic
BLOOD_PRESSURE_SENSORS: List[Tuple[str, str, str]] = [
    ("{{ value_json.systolic_bp }}", "mmHg", "Blood Pressure Systolic"),
    ("{{ value_json.diastolic_bp }}", "mmHg", "Blood Pressure Diastolic"),
    ("{{ value_json.map_bp }}", "mmHg", "Blood Pressure MAP"),
]


def _safe_device_id(name: str, patient_id: int) -> str:
    """HA-friendly device identifier: lowercase alphanumeric + underscores, fallback to patient id."""
    if not name:
        return f"shh_patient_{patient_id}"
    safe = re.sub(r"[^a-z0-9]+", "_", name.lower().strip()).strip("_")
    return f"shh_{safe}" if safe else f"shh_patient_{patient_id}"


def send_mqtt_discovery(mqtt_client, test_mode: bool = True, patient_id: Optional[int] = None) -> bool:
    """
    Send MQTT Discovery messages to Home Assistant.

    When patient_id is set, send discovery only for that patient.
    When patient_id is None, send discovery for all patients with MQTT enabled.
    Uses patient name (e.g. "john") for device/entity names, not "Patient #".
    Sends one sensor per enabled section (SpO₂, Heart Rate, Perfusion, Temperature, Blood Pressure)
    that has get or both permission.

    Args:
        mqtt_client: The connected MQTT client
        test_mode: If True, uses {base_topic}-test instead of {base_topic}
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
    if test_mode:
        base_topic = f"{base_topic}-test"

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

        # One sensor per section that allows get or both (blood_pressure → three sensors: systolic, diastolic, MAP)
        for section_key, perm in sections.items():
            if perm not in ("get", "both"):
                continue
            if section_key == "blood_pressure":
                for idx, (val_tpl, unit, display_name) in enumerate(BLOOD_PRESSURE_SENSORS):
                    safe_section = f"blood_pressure_{['systolic', 'diastolic', 'map'][idx]}"
                    sensor_id = f"{device_ident}_{safe_section}"
                    config = {
                        "uniq_id": f"{base_topic}_patient_{pid}_{safe_section}",
                        "name": f"{patient_name} {display_name}",
                        "stat_t": state_topic,
                        "val_tpl": val_tpl,
                        "json_attr_t": state_topic,
                        "avty_t": f"{base_topic}/availability",
                        "unit_of_meas": unit,
                        "stat_cla": "measurement",
                        "dev": device_info,
                    }
                    discovery_topic = f"{discovery_prefix}/sensor/{sensor_id}/config"
                    try:
                        result = mqtt_client.publish(discovery_topic, json.dumps(config), retain=True)
                        if result.rc == 0:
                            logger.info(f"Sent MQTT Discovery for {patient_name} {display_name} to {discovery_topic}")
                            success_count += 1
                        else:
                            logger.error(f"Failed to send discovery for {sensor_id}: rc={result.rc}")
                    except Exception as e:
                        logger.error(f"Error sending discovery for {sensor_id}: {e}")
                continue
            section_config = SECTION_DISCOVERY.get(section_key)
            if not section_config:
                continue
            val_tpl, unit, display_name = section_config
            safe_section = section_key.replace(" ", "_").lower()
            sensor_id = f"{device_ident}_{safe_section}"
            config = {
                "uniq_id": f"{base_topic}_patient_{pid}_{safe_section}",
                "name": f"{patient_name} {display_name}",
                "stat_t": state_topic,
                "val_tpl": val_tpl,
                "json_attr_t": state_topic,
                "avty_t": f"{base_topic}/availability",
                "unit_of_meas": unit,
                "stat_cla": "measurement",
                "dev": device_info,
            }
            discovery_topic = f"{discovery_prefix}/sensor/{sensor_id}/config"
            try:
                result = mqtt_client.publish(discovery_topic, json.dumps(config), retain=True)
                if result.rc == 0:
                    logger.info(f"Sent MQTT Discovery for {patient_name} {display_name} to {discovery_topic}")
                    success_count += 1
                else:
                    logger.error(f"Failed to send discovery for {sensor_id}: rc={result.rc}")
            except Exception as e:
                logger.error(f"Error sending discovery for {sensor_id}: {e}")

    logger.info(f"Sent {success_count} MQTT Discovery messages (per-vital per patient)")
    return success_count > 0


def _send_legacy_mqtt_discovery(mqtt_client, test_mode: bool, base_topic: str, topics_config: dict, device_info: dict) -> int:
    """
    Legacy: send one sensor per vital (old behavior). Used only when no patients have MQTT enabled.
    Returns count of discovery messages sent.
    """
    discovery_prefix = "homeassistant"
    sensors = {}
    
    for vital_name, config in topics_config.items():
        if not config.get('enabled', False):
            continue
        
        # Handle nutrition special case with multiple sensors
        if vital_name == 'nutrition':
            # Water intake (actual consumed)
            water_topic = config.get('water_broadcast_topic')
            if water_topic:
                sensors[f"{vital_name}_water_intake"] = {
                    "uniq_id": f"{base_topic}_sensor.water_intake",
                    "name": "Water Intake",
                    "stat_t": water_topic,
                    "val_tpl": "{{ value_json.value }}",
                    "json_attr_t": f"{water_topic}/attributes",
                    "avty_t": f"{base_topic}/availability",
                    "unit_of_meas": "ml",
                    "stat_cla": "measurement",
                    "icon": "mdi:water"
                }
                
                # Water scheduled (expected progress)
                sensors[f"{vital_name}_water_scheduled"] = {
                    "uniq_id": f"{base_topic}_sensor.water_scheduled",
                    "name": "Water Scheduled",
                    "stat_t": f"{water_topic}/scheduled",
                    "val_tpl": "{{ value_json.value }}",
                    "json_attr_t": f"{water_topic}/scheduled/attributes",
                    "avty_t": f"{base_topic}/availability",
                    "unit_of_meas": "ml",
                    "stat_cla": "measurement",
                    "icon": "mdi:calendar-clock"
                }
                
                # Water target (daily limit)
                sensors[f"{vital_name}_water_target"] = {
                    "uniq_id": f"{base_topic}_sensor.water_target",
                    "name": "Water Target",
                    "stat_t": f"{water_topic}/target",
                    "val_tpl": "{{ value_json.value }}",
                    "json_attr_t": f"{water_topic}/target/attributes",
                    "avty_t": f"{base_topic}/availability",
                    "unit_of_meas": "ml",
                    "stat_cla": "measurement",
                    "icon": "mdi:flag-checkered"
                }
            
            # Calories intake (actual consumed)
            calories_topic = config.get('calories_broadcast_topic')
            if calories_topic:
                sensors[f"{vital_name}_calories_intake"] = {
                    "uniq_id": f"{base_topic}_sensor.calories_intake",
                    "name": "Calorie Intake",
                    "stat_t": calories_topic,
                    "val_tpl": "{{ value_json.value }}",
                    "json_attr_t": f"{calories_topic}/attributes",
                    "avty_t": f"{base_topic}/availability",
                    "unit_of_meas": "kcal",
                    "stat_cla": "measurement",
                    "icon": "mdi:food-apple"
                }
                
                # Calories scheduled (expected progress)
                sensors[f"{vital_name}_calories_scheduled"] = {
                    "uniq_id": f"{base_topic}_sensor.calories_scheduled",
                    "name": "Calories Scheduled",
                    "stat_t": f"{calories_topic}/scheduled",
                    "val_tpl": "{{ value_json.value }}",
                    "json_attr_t": f"{calories_topic}/scheduled/attributes",
                    "avty_t": f"{base_topic}/availability",
                    "unit_of_meas": "kcal",
                    "stat_cla": "measurement",
                    "icon": "mdi:calendar-clock"
                }
                
                # Calories target (daily limit)
                sensors[f"{vital_name}_calories_target"] = {
                    "uniq_id": f"{base_topic}_sensor.calories_target",
                    "name": "Calories Target",
                    "stat_t": f"{calories_topic}/target",
                    "val_tpl": "{{ value_json.value }}",
                    "json_attr_t": f"{calories_topic}/target/attributes",
                    "avty_t": f"{base_topic}/availability",
                    "unit_of_meas": "kcal",
                    "stat_cla": "measurement",
                    "icon": "mdi:flag-checkered"
                }
        
        # Handle standard vitals
        else:
            broadcast_topic = config.get('broadcast_topic')
            if broadcast_topic:
                # Blood pressure gets three separate sensors
                if vital_name == 'blood_pressure':
                    bp_sensors = get_blood_pressure_sensors(broadcast_topic, base_topic)
                    sensors.update(bp_sensors)
                else:
                    sensor_config = get_sensor_config(vital_name, broadcast_topic, base_topic)
                    if sensor_config:
                        sensors[vital_name] = sensor_config

    
    # Send discovery messages for all configured sensors
    success_count = 0
    for sensor_id, config in sensors.items():
        config["dev"] = device_info
        
        # Determine if this is a binary sensor (alarms) or regular sensor
        is_binary = 'alarm' in sensor_id
        sensor_type = 'binary_sensor' if is_binary else 'sensor'
        
        discovery_topic = f"{discovery_prefix}/{sensor_type}/{sensor_id}/config"
        json_payload = json.dumps(config)

        try:
            result = mqtt_client.publish(discovery_topic, json_payload, retain=True)
            if result.rc == 0:
                logger.info(f"Sent MQTT Discovery for {sensor_id} to {discovery_topic}")
                success_count += 1
            else:
                logger.error(f"Failed to send discovery for {sensor_id}: rc={result.rc}")
        except Exception as e:
            logger.error(f"Error sending discovery for {sensor_id}: {e}")
            
    logger.info(f"Sent {success_count}/{len(sensors)} MQTT Discovery messages")
    return success_count > 0

def get_blood_pressure_sensors(broadcast_topic: str, base_topic: str) -> Dict[str, Dict[str, Any]]:
    """
    Get three separate sensor configurations for blood pressure (systolic, diastolic, MAP)
    
    Args:
        broadcast_topic: MQTT topic where blood pressure data is published
        base_topic: Base MQTT topic for the system
        
    Returns:
        Dict containing three sensor configurations
    """
    return {
        'blood_pressure_systolic': {
            "uniq_id": f"{base_topic}_sensor.bp_systolic",
            "name": "Blood Pressure Systolic",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.systolic }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "unit_of_meas": "mmHg",
            "stat_cla": "measurement",
        },
        'blood_pressure_diastolic': {
            "uniq_id": f"{base_topic}_sensor.bp_diastolic",
            "name": "Blood Pressure Diastolic",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.diastolic }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "unit_of_meas": "mmHg",
            "stat_cla": "measurement",
        },
        'blood_pressure_map': {
            "uniq_id": f"{base_topic}_sensor.bp_map",
            "name": "Blood Pressure MAP",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.map }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "unit_of_meas": "mmHg",
            "stat_cla": "measurement",
        }
    }

def get_sensor_config(vital_name: str, broadcast_topic: str, base_topic: str) -> Optional[Dict[str, Any]]:
    """
    Get sensor configuration for a specific vital type
    
    Args:
        vital_name: Name of the vital (e.g., 'spo2', 'temperature')
        broadcast_topic: MQTT topic where the sensor publishes data
        base_topic: Base MQTT topic for the system
        
    Returns:
        Dict containing sensor configuration or None if not supported
    """
    vital_configs = {
        'spo2': {
            "uniq_id": f"{base_topic}_sensor.spo2",
            "name": "SpO₂ Level",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.value }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "unit_of_meas": "%",
            "stat_cla": "measurement",
        },
        'bpm': {
            "uniq_id": f"{base_topic}_sensor.bpm",
            "name": "Heart Rate",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.value }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "unit_of_meas": "BPM",
            "stat_cla": "measurement",
        },
        'perfusion': {
            "uniq_id": f"{base_topic}_sensor.perfusion",
            "name": "Perfusion Index",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.value }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "unit_of_meas": "PA",
            "stat_cla": "measurement",
        },
        'temperature': {
            "uniq_id": f"{base_topic}_sensor.temperature",
            "name": "Body Temperature",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.body_temp }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "unit_of_meas": "°F",
            "stat_cla": "measurement",
        },
        'weight': {
            "uniq_id": f"{base_topic}_sensor.weight",
            "name": "Weight",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.value }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "unit_of_meas": "lbs",
            "stat_cla": "measurement",
        },
        'bathroom': {
            "uniq_id": f"{base_topic}_sensor.bathroom",
            "name": "Bathroom Activity",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.value }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
        },
        'spo2_alarm': {
            "uniq_id": f"{base_topic}_sensor.spo2_alarm",
            "name": "SpO₂ Alarm",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.value }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "payload_on": "ON",
            "payload_off": "OFF",
            "device_class": "problem",
        },
        'bpm_alarm': {
            "uniq_id": f"{base_topic}_sensor.bmp_alarm",
            "name": "Heart Rate Alarm",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.value }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "payload_on": "ON",
            "payload_off": "OFF",
            "device_class": "problem",
        },
        'alarm1': {
            "uniq_id": f"{base_topic}_sensor.gpio_alarm1",
            "name": "GPIO Alarm 1",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.value }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "payload_on": "ON",
            "payload_off": "OFF",
            "device_class": "problem",
        },
        'alarm2': {
            "uniq_id": f"{base_topic}_sensor.gpio_alarm2",
            "name": "GPIO Alarm 2",
            "stat_t": broadcast_topic,
            "val_tpl": "{{ value_json.value }}",
            "json_attr_t": f"{broadcast_topic}/attributes",
            "avty_t": f"{base_topic}/availability",
            "payload_on": "ON",
            "payload_off": "OFF",
            "device_class": "problem",
        }
    }
    
    return vital_configs.get(vital_name)
