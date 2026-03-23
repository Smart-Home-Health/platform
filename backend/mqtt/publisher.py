"""
MQTT Publisher - Handles publishing sensor data to MQTT topics
"""
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from .settings import (
    get_mqtt_settings,
    get_vital_topic_config,
    get_patient_state_topic,
    section_allows_get,
    state_key_to_section,
)

logger = logging.getLogger('mqtt.publisher')

class MQTTPublisher:
    """Handles publishing data to MQTT topics"""
    
    def __init__(self, mqtt_client=None):
        self.mqtt_client = mqtt_client
        
    def set_client(self, client):
        """Set the MQTT client"""
        self.mqtt_client = client
        
    def is_available(self) -> bool:
        """Check if MQTT publishing is available"""
        if not self.mqtt_client:
            return False
            
        try:
            return self.mqtt_client.is_connected()
        except Exception:
            return False
            
    def publish_sensor_state(self, sensor_state: Dict[str, Any]) -> bool:
        """
        Publish current sensor state to configured MQTT topics based on database settings.
        
        Args:
            sensor_state: Dictionary containing current sensor values
            
        Returns:
            bool: True if any messages were published successfully
        """
        if not self.is_available():
            logger.debug("MQTT not available for publishing sensor state")
            return False
            
        settings = get_mqtt_settings()
        if not settings['enabled']:
            logger.debug("MQTT publishing disabled")
            return False
            
        timestamp = datetime.now().strftime("%y-%b-%d %H:%M:%S")
        published_count = 0
        
        # Publish pulse ox data (SpO2, BPM, Perfusion)
        if self._publish_pulse_ox_data(sensor_state, settings, timestamp):
            published_count += 1
            
        # Publish temperature data
        if self._publish_temperature_data(sensor_state, settings, timestamp):
            published_count += 1
            
        # Publish blood pressure data
        if self._publish_blood_pressure_data(sensor_state, settings, timestamp):
            published_count += 1
            
        if published_count > 0:
            logger.info(f"Successfully published {published_count} MQTT messages")
            return True
        else:
            logger.debug("No MQTT messages published")
            return False
            
    def publish_vital_data(self, vital_type: str, vital_data: Dict[str, Any]) -> bool:
        """
        Publish a specific vital type to MQTT based on database settings.
        
        Args:
            vital_type: The type of vital (e.g., 'bathroom', 'temperature', 'blood_pressure')
            vital_data: The data to publish (dict)
            
        Returns:
            bool: True if published successfully
        """
        logger.debug(f"Publishing {vital_type} data to MQTT: {vital_data}")
        
        if not self.is_available():
            logger.warning(f"MQTT not available for {vital_type} publish")
            return False
            
        vital_config = get_vital_topic_config(vital_type)
        if not vital_config:
            logger.debug(f"MQTT publishing for {vital_type} is disabled or not configured")
            return False
            
        settings = get_mqtt_settings()
        payload = self._create_vital_payload(vital_type, vital_data, settings['client_id'])
        
        # Get the broadcast topic
        broadcast_topic = vital_config.get('broadcast_topic', f'shh/{vital_type}/state')
        json_payload = json.dumps(payload, default=str)
        
        try:
            result = self.mqtt_client.publish(broadcast_topic, json_payload, retain=False)
            
            if result.rc == 0:
                logger.debug(f"Published {vital_type} to {broadcast_topic}")
                return True
            else:
                logger.error(f"Failed to publish {vital_type} data: rc={result.rc}")
                return False
                
        except Exception as e:
            logger.error(f"Error publishing {vital_type} data to MQTT: {str(e)}")
            return False

    def publish_patient_combined_state(self, patient_id: int, state: Dict[str, Any]) -> bool:
        """
        Publish combined state for one patient to {base}/patient/{id}/state.
        Only includes keys for which this patient's MQTT config allows 'get'.
        state: e.g. { "spo2": 99, "bpm": 100, "perfusion": 0.5, "alarm": false, ... }
        """
        if not self.is_available():
            return False
        topic = get_patient_state_topic(patient_id)
        if not topic:
            return False
        filtered = {}
        for key, value in state.items():
            if value is None:
                continue
            section = state_key_to_section(key)
            if section_allows_get(patient_id, section):
                filtered[key] = value
        if not filtered:
            return False
        payload = {**filtered, "timestamp": datetime.now().strftime("%y-%b-%d %H:%M:%S")}
        try:
            result = self.mqtt_client.publish(topic, json.dumps(payload, default=str), retain=True)
            return result.rc == 0
        except Exception as e:
            logger.error(f"Error publishing patient {patient_id} state: {e}")
            return False

    def _publish_pulse_ox_data(self, sensor_state: Dict[str, Any], settings: Dict[str, Any], timestamp: str) -> bool:
        """Publish SpO2, BPM, and Perfusion data"""
        topics = settings.get('topics', {})
        spo2_config = topics.get('spo2', {})
        
        if not spo2_config.get('enabled', False):
            return False
            
        spo2_val = sensor_state.get('spo2')
        bpm_val = sensor_state.get('bpm')
        perfusion_val = sensor_state.get('perfusion')
        
        if spo2_val is not None or bpm_val is not None or perfusion_val is not None:
            payload = {
                "timestamp": timestamp,
                "spo2": spo2_val,
                "bpm": bpm_val,
                "perfusion": perfusion_val,
                "origin": settings['client_id']
            }
            
            broadcast_topic = spo2_config.get('broadcast_topic', 'shh/spo2/state')
            json_payload = json.dumps(payload, default=str)
            
            try:
                result = self.mqtt_client.publish(broadcast_topic, json_payload, retain=True)
                return result.rc == 0
            except Exception as e:
                logger.error(f"Error publishing SpO2 data to MQTT: {str(e)}")
                return False
        return False
        
    def _publish_temperature_data(self, sensor_state: Dict[str, Any], settings: Dict[str, Any], timestamp: str) -> bool:
        """Publish temperature data"""
        topics = settings.get('topics', {})
        temp_config = topics.get('temperature', {})
        
        if not temp_config.get('enabled', False):
            return False
            
        skin_temp = sensor_state.get('skin_temp')
        body_temp = sensor_state.get('body_temp')
        
        if skin_temp is not None or body_temp is not None:
            payload = {
                "timestamp": timestamp,
                "skin_temp": skin_temp,
                "body_temp": body_temp,
                "origin": settings['client_id']
            }
            
            broadcast_topic = temp_config.get('broadcast_topic', 'shh/temperature/state')
            json_payload = json.dumps(payload, default=str)
            
            try:
                result = self.mqtt_client.publish(broadcast_topic, json_payload, retain=True)
                return result.rc == 0
            except Exception as e:
                logger.error(f"Error publishing temperature data to MQTT: {str(e)}")
                return False
        return False
        
    def _publish_blood_pressure_data(self, sensor_state: Dict[str, Any], settings: Dict[str, Any], timestamp: str) -> bool:
        """Publish blood pressure data"""
        topics = settings.get('topics', {})
        bp_config = topics.get('blood_pressure', {})
        
        if not bp_config.get('enabled', False):
            return False
            
        systolic = sensor_state.get('systolic_bp')
        diastolic = sensor_state.get('diastolic_bp')
        map_bp = sensor_state.get('map_bp')
        
        if systolic is not None or diastolic is not None or map_bp is not None:
            payload = {
                "timestamp": timestamp,
                "systolic": systolic,
                "diastolic": diastolic,
                "map": map_bp,
                "origin": settings['client_id']
            }
            
            broadcast_topic = bp_config.get('broadcast_topic', 'shh/blood_pressure/state')
            json_payload = json.dumps(payload, default=str)
            
            try:
                result = self.mqtt_client.publish(broadcast_topic, json_payload, retain=True)
                return result.rc == 0
            except Exception as e:
                logger.error(f"Error publishing blood pressure data to MQTT: {str(e)}")
                return False
        return False
        
    def _create_vital_payload(self, vital_type: str, vital_data: Dict[str, Any], client_id: str) -> Dict[str, Any]:
        """Create payload for vital data publishing"""
        timestamp = datetime.now().strftime("%y-%b-%d %H:%M:%S")
        
        # Handle datetime formatting safely
        datetime_val = vital_data.get('datetime')
        formatted_datetime = None
        if datetime_val:
            if hasattr(datetime_val, 'isoformat'):
                formatted_datetime = datetime_val.isoformat()
            else:
                formatted_datetime = str(datetime_val)
                
        base_payload = {
            "timestamp": timestamp,
            "datetime": formatted_datetime,
            "origin": client_id
        }
        
        if vital_type == 'bathroom':
            base_payload.update({
                "type": vital_data.get('bathroom_type'),
                "size": vital_data.get('bathroom_size'),
                "value": vital_data.get('value'),
                "notes": vital_data.get('notes')
            })
        elif vital_type == 'temperature':
            # Manual form may send single 'temperature' key; map to body_temp for MQTT
            body_temp = vital_data.get('body_temp')
            skin_temp = vital_data.get('skin_temp')
            if body_temp is None and skin_temp is None and vital_data.get('temperature') is not None:
                body_temp = vital_data.get('temperature')
            base_payload.update({
                "skin_temp": skin_temp,
                "body_temp": body_temp,
                "value": body_temp if body_temp is not None else skin_temp,
            })
        elif vital_type == 'blood_pressure':
            base_payload.update({
                "systolic": vital_data.get('systolic_bp'),
                "diastolic": vital_data.get('diastolic_bp'),
                "map": vital_data.get('map_bp')
            })
        elif vital_type == 'nutrition':
            base_payload.update({
                "water": vital_data.get('water'),
                "calories": vital_data.get('calories')
            })
        elif vital_type in ['water', 'calories', 'nutrition_water', 'nutrition_calories', 
                            'nutrition_water_intake', 'nutrition_water_scheduled', 'nutrition_water_target',
                            'nutrition_calories_intake', 'nutrition_calories_scheduled', 'nutrition_calories_target']:
            # Extract metadata for nutrition values
            metadata = vital_data.get('metadata', {})
            base_payload.update({
                "value": vital_data.get('value'),
                "day_start": metadata.get('day_start'),
                "day_end": metadata.get('day_end'),
                "notes": vital_data.get('notes')
            })
            # Add scheduled metadata if present
            if 'scheduled_feedings_past' in metadata:
                base_payload.update({
                    "scheduled_feedings_past": metadata.get('scheduled_feedings_past'),
                    "total_scheduled_feedings": metadata.get('total_scheduled_feedings')
                })
        else:
            # Generic vital payload
            base_payload.update({
                "value": vital_data.get('value'),
                "vital_type": vital_type,
                "notes": vital_data.get('notes')
            })
            
        return base_payload
