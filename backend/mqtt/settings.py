"""
MQTT Settings and Configuration
"""
import json
from typing import Dict, Any, Optional, List
from crud.settings import get_setting
from db import get_db
import logging

logger = logging.getLogger('mqtt.settings')

# Default topic config used when DB has no/saved topics (same as routes/mqtt get_default_mqtt_topics)
DEFAULT_MQTT_TOPICS = {
    'spo2': {'enabled': True, 'broadcast_topic': 'shh/spo2/state', 'listen_topic': 'shh/spo2/set'},
    'bpm': {'enabled': True, 'broadcast_topic': 'shh/bpm/state', 'listen_topic': 'shh/bpm/set'},
    'perfusion': {'enabled': True, 'broadcast_topic': 'shh/perfusion/state', 'listen_topic': 'shh/perfusion/set'},
    'blood_pressure': {'enabled': True, 'broadcast_topic': 'shh/bp/state', 'listen_topic': 'shh/bp/set'},
    'temperature': {'enabled': True, 'broadcast_topic': 'shh/temp/state', 'listen_topic': 'shh/temp/set'},
    'nutrition': {'enabled': False, 'water_broadcast_topic': 'shh/water/state', 'water_listen_topic': 'shh/water/set', 'calories_broadcast_topic': 'shh/calories/state', 'calories_listen_topic': 'shh/calories/set'},
    'weight': {'enabled': False, 'broadcast_topic': 'shh/weight/state', 'listen_topic': 'shh/weight/set'},
    'bathroom': {'enabled': False, 'broadcast_topic': 'shh/bathroom/state', 'listen_topic': 'shh/bathroom/set'},
    'spo2_alarm': {'enabled': True, 'broadcast_topic': 'shh/alarms/spo2', 'listen_topic': 'shh/alarms/spo2/set'},
    'bpm_alarm': {'enabled': True, 'broadcast_topic': 'shh/alarms/bpm', 'listen_topic': 'shh/alarms/bpm/set'},
}


def get_patients_with_mqtt_enabled() -> List[Dict[str, Any]]:
    """
    Return list of { patient_id, patient_name, settings } for each patient that has MQTT
    enabled (PatientIntegration for slug mqtt with enabled=True and settings.enabled True).
    patient_name is first_name + last_name for discovery/display (e.g. "john" or "John Doe").
    """
    from schemas.integration import Integration as IntegrationModel, PatientIntegration
    from schemas.patient import Patient
    db = next(get_db())
    try:
        mqtt_int = db.query(IntegrationModel).filter(IntegrationModel.slug == "mqtt").first()
        if not mqtt_int:
            return []
        rows = (
            db.query(PatientIntegration)
            .filter(
                PatientIntegration.integration_id == mqtt_int.id,
                PatientIntegration.is_enabled == True,
            )
            .all()
        )
        out = []
        for pi in rows:
            settings = pi.settings or {}
            if not settings.get("enabled", True):
                continue
            patient = db.query(Patient).filter(Patient.id == pi.patient_id).first()
            patient_name = (f"{patient.first_name} {patient.last_name}".strip() if patient else "") or f"Patient {pi.patient_id}"
            out.append({"patient_id": pi.patient_id, "patient_name": patient_name, "settings": settings})
        return out
    finally:
        db.close()


def get_patient_mqtt_config(patient_id: int) -> Optional[Dict[str, Any]]:
    """
    Get MQTT config for a patient (from PatientIntegration for mqtt).
    Returns settings dict with enabled, sections, topic_overrides, base_topic_override, or None.
    """
    from schemas.integration import Integration as IntegrationModel, PatientIntegration
    db = next(get_db())
    try:
        mqtt_int = db.query(IntegrationModel).filter(IntegrationModel.slug == "mqtt").first()
        if not mqtt_int:
            return None
        pi = (
            db.query(PatientIntegration)
            .filter(
                PatientIntegration.patient_id == patient_id,
                PatientIntegration.integration_id == mqtt_int.id,
                PatientIntegration.is_enabled == True,
            )
            .first()
        )
        if not pi:
            return None
        return pi.settings or {}
    finally:
        db.close()


def get_patient_state_topic(patient_id: int) -> Optional[str]:
    """Get the state topic for a patient (combined JSON payload)."""
    settings = get_mqtt_settings()
    if not settings.get("enabled"):
        return None
    cfg = get_patient_mqtt_config(patient_id)
    if not cfg or not cfg.get("enabled", True):
        return None
    base = settings.get("base_topic", "shh")
    overrides = (cfg.get("topic_overrides") or {})
    if overrides.get("state_topic"):
        return overrides["state_topic"]
    base_override = cfg.get("base_topic_override") or base
    return f"{base_override}/patient/{patient_id}/state"


def get_patient_set_topic(patient_id: int) -> Optional[str]:
    """Get the set topic for a patient (HA -> device)."""
    settings = get_mqtt_settings()
    if not settings.get("enabled"):
        return None
    cfg = get_patient_mqtt_config(patient_id)
    if not cfg or not cfg.get("enabled", True):
        return None
    base = settings.get("base_topic", "shh")
    overrides = (cfg.get("topic_overrides") or {})
    if overrides.get("set_topic"):
        return overrides["set_topic"]
    base_override = cfg.get("base_topic_override") or base
    return f"{base_override}/patient/{patient_id}/set"


def state_key_to_section(key: str) -> str:
    """Map state dict key to section name for permission check."""
    if key in ("systolic_bp", "diastolic_bp", "map_bp"):
        return "blood_pressure"
    if key in ("body_temp", "skin_temp"):
        return "temperature"
    return key


def section_allows_get(patient_id: int, section: str) -> bool:
    """True if this patient's MQTT config allows publishing (get) for this section."""
    cfg = get_patient_mqtt_config(patient_id)
    if not cfg or not cfg.get("enabled", True):
        return False
    perm = (cfg.get("sections") or {}).get(section, "off")
    return perm in ("get", "both")


def section_allows_set(patient_id: int, section: str) -> bool:
    """True if this patient's MQTT config allows subscribing (set) for this section."""
    cfg = get_patient_mqtt_config(patient_id)
    if not cfg or not cfg.get("enabled", True):
        return False
    perm = (cfg.get("sections") or {}).get(section, "off")
    return perm in ("set", "both")

def get_mqtt_settings() -> Dict[str, Any]:
    """Get MQTT settings from database"""
    db = next(get_db())
    try:
        settings = {}
        
        # Get basic MQTT settings
        settings['enabled'] = get_setting(db, 'mqtt_enabled', False)
        settings['broker'] = get_setting(db, 'mqtt_broker', '')
        settings['port'] = get_setting(db, 'mqtt_port', 1883)
        settings['username'] = get_setting(db, 'mqtt_username', '')
        settings['password'] = get_setting(db, 'mqtt_password', '')
        settings['client_id'] = get_setting(db, 'mqtt_client_id', 'sensor_monitor')
        settings['base_topic'] = get_setting(db, 'mqtt_base_topic', 'shh')
        
        # Get topic configurations (merge with defaults so publisher always has e.g. temperature)
        topics_json = get_setting(db, 'mqtt_topics')
        if topics_json:
            try:
                if isinstance(topics_json, dict):
                    saved_topics = topics_json
                else:
                    saved_topics = json.loads(topics_json)
            except (json.JSONDecodeError, TypeError) as e:
                logger.error(f"Failed to parse MQTT topics from database: {e}")
                saved_topics = {}
        else:
            saved_topics = {}
        settings['topics'] = {**DEFAULT_MQTT_TOPICS, **saved_topics}

        return settings
    except Exception as e:
        logger.error(f"Error getting MQTT settings: {e}")
        return {
            'enabled': False,
            'broker': '',
            'port': 1883,
            'username': '',
            'password': '',
            'client_id': 'sensor_monitor',
            'base_topic': 'shh',
            'topics': {}
        }
    finally:
        db.close()

def get_enabled_topics(mqtt_settings: Dict[str, Any]) -> Dict[str, str]:
    """Get list of enabled topics from MQTT settings"""
    enabled_topics = {}
    
    for vital_name, config in mqtt_settings.get('topics', {}).items():
        if config.get('enabled', False):
            # Handle nutrition special case with 4 topics
            if vital_name == 'nutrition':
                if config.get('water_broadcast_topic'):
                    enabled_topics['water_broadcast'] = config.get('water_broadcast_topic')
                if config.get('water_listen_topic'):
                    enabled_topics['water_listen'] = config.get('water_listen_topic')
                if config.get('calories_broadcast_topic'):
                    enabled_topics['calories_broadcast'] = config.get('calories_broadcast_topic')
                if config.get('calories_listen_topic'):
                    enabled_topics['calories_listen'] = config.get('calories_listen_topic')
            else:
                # Standard vitals with broadcast and listen topics
                if config.get('broadcast_topic'):
                    enabled_topics[f'{vital_name}_broadcast'] = config['broadcast_topic']
                if config.get('listen_topic'):
                    enabled_topics[f'{vital_name}_listen'] = config['listen_topic']
    
    return enabled_topics

def is_mqtt_enabled() -> bool:
    """Quick check if MQTT is enabled"""
    settings = get_mqtt_settings()
    return settings.get('enabled', False) and settings.get('broker', '')

def get_vital_topic_config(vital_type: str) -> Optional[Dict[str, Any]]:
    """Get topic configuration for a specific vital type"""
    settings = get_mqtt_settings()
    if not settings.get('enabled', False):
        return None
        
    topics = settings.get('topics', {})
    base_topic = settings.get('base_topic', 'shh')
    nutrition_config = topics.get('nutrition', {})
    
    # Handle nutrition sensor types (e.g., nutrition_water_intake, nutrition_calories_target)
    # These use the configured topics from the database
    nutrition_types = {
        'nutrition_water_intake': 'water_broadcast_topic',
        'nutrition_water_scheduled': 'water_broadcast_topic',  # Uses same base, different suffix
        'nutrition_water_target': 'water_broadcast_topic',
        'nutrition_calories_intake': 'calories_broadcast_topic',
        'nutrition_calories_scheduled': 'calories_broadcast_topic',
        'nutrition_calories_target': 'calories_broadcast_topic',
    }
    
    if vital_type in nutrition_types:
        if nutrition_config.get('enabled', False):
            topic_key = nutrition_types[vital_type]
            base_broadcast = nutrition_config.get(topic_key, f"{base_topic}/water/state" if 'water' in vital_type else f"{base_topic}/calories/state")
            
            # Modify topic for scheduled/target variants
            # Discovery expects: shh/water/state/scheduled, shh/water/state/target
            if '_scheduled' in vital_type:
                broadcast_topic = f"{base_broadcast}/scheduled"
            elif '_target' in vital_type:
                broadcast_topic = f"{base_broadcast}/target"
            else:
                broadcast_topic = base_broadcast
                
            return {
                'enabled': True,
                'broadcast_topic': broadcast_topic
            }
        return None
    
    # Handle legacy water/water_ml/calories vital types from vital_saved events
    # These should use the nutrition topic configuration
    legacy_nutrition_map = {
        'water': 'water_broadcast_topic',
        'water_ml': 'water_broadcast_topic', 
        'calories': 'calories_broadcast_topic',
    }
    
    if vital_type in legacy_nutrition_map:
        if nutrition_config.get('enabled', False):
            topic_key = legacy_nutrition_map[vital_type]
            broadcast_topic = nutrition_config.get(topic_key)
            if broadcast_topic:
                return {
                    'enabled': True,
                    'broadcast_topic': broadcast_topic
                }
        return None
    
    vital_config = topics.get(vital_type, {})
    
    if not vital_config.get('enabled', False):
        return None
        
    return vital_config
