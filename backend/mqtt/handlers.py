"""
MQTT Message Handlers - Process incoming MQTT messages
"""
import logging
from typing import Dict, Any
from crud.vitals import save_blood_pressure, save_temperature
from db import get_db

logger = logging.getLogger('mqtt.handlers')

class MQTTMessageHandlers:
    """Handles processing of incoming MQTT messages"""
    
    def __init__(self, update_sensor_callback=None):
        """
        Initialize with callback for updating sensor state
        
        Args:
            update_sensor_callback: Function to call when sensor data is updated
                                  Should accept: update_sensor(*updates, from_mqtt=True)
        """
        self.update_sensor = update_sensor_callback
        
    def handle_blood_pressure(self, vital_name: str, payload: Dict[str, Any], topic: str, raw_data: str):
        """Handle blood pressure MQTT messages"""
        logger.info(f"Processing blood pressure data: {payload}")
        
        systolic = payload.get("systolic")
        diastolic = payload.get("diastolic")
        map_value = payload.get("map")
        
        # Save to database if we have all valid values
        if (systolic is not None and diastolic is not None and map_value is not None and
            not (systolic == 0 and diastolic == 0 and map_value == 0)):
            db = next(get_db())
            try:
                save_blood_pressure(
                    db=db,
                    systolic=systolic,
                    diastolic=diastolic,
                    map_value=map_value,
                    notes=raw_data
                )
                # Update sensor state if callback is available
                if self.update_sensor:
                    self.update_sensor(
                        ("systolic_bp", systolic), 
                        ("diastolic_bp", diastolic), 
                        ("map_bp", map_value), 
                        from_mqtt=True
                    )
            finally:
                db.close()
        else:
            logger.info(f"Ignoring invalid BP values: systolic={systolic}, diastolic={diastolic}, map={map_value}")
            
    def handle_temperature(self, vital_name: str, payload: Dict[str, Any], topic: str, raw_data: str):
        """Handle temperature MQTT messages"""
        logger.info(f"Processing temperature data: {payload}")
        
        skin_temp = payload.get("skin_temp")
        body_temp = payload.get("body_temp")
        
        if (skin_temp is not None and body_temp is not None and
            not (skin_temp == 0 and body_temp == 0)):
            db = next(get_db())
            try:
                save_temperature(
                    db=db,
                    body_temp=body_temp,
                    skin_temp=skin_temp,
                    notes=raw_data
                )
                # Update sensor state if callback is available
                if self.update_sensor:
                    self.update_sensor(("skin_temp", skin_temp), from_mqtt=True)
                    self.update_sensor(("body_temp", body_temp), from_mqtt=True)
            finally:
                db.close()
        else:
            logger.info(f"Ignoring invalid temperature values: skin_temp={skin_temp}, body_temp={body_temp}")
            
    def handle_nutrition(self, vital_name: str, payload: Dict[str, Any], topic: str, raw_data: str):
        """Handle nutrition MQTT messages (water and calories)"""
        logger.info(f"Processing nutrition data: {payload}")
        
        # Determine if this is water or calories based on topic or payload
        water_value = payload.get("water")
        calories_value = payload.get("calories")
        
        if self.update_sensor:
            if water_value is not None:
                self.update_sensor(("water", water_value), from_mqtt=True)
            if calories_value is not None:
                self.update_sensor(("calories", calories_value), from_mqtt=True)
                
    def handle_standard_vital(self, vital_name: str, payload: Dict[str, Any], topic: str, raw_data: str):
        """Handle standard vitals (spo2, bpm, perfusion, etc.)"""
        logger.info(f"Processing {vital_name} data: {payload}")
        
        value = payload.get(vital_name)
        if value is not None and self.update_sensor:
            self.update_sensor((vital_name, value), from_mqtt=True)
        else:
            logger.warning(f"{vital_name} not found in payload {payload}")

def create_message_handlers(update_sensor_callback) -> Dict[str, Any]:
    """
    Create a dictionary of message handlers for MQTT processing
    
    Args:
        update_sensor_callback: Function to call for sensor updates
        
    Returns:
        Dict mapping vital types to handler functions
    """
    handlers = MQTTMessageHandlers(update_sensor_callback)
    
    return {
        'blood_pressure': handlers.handle_blood_pressure,
        'temperature': handlers.handle_temperature,
        'nutrition': handlers.handle_nutrition,
        'spo2': handlers.handle_standard_vital,
        'bpm': handlers.handle_standard_vital,
        'perfusion': handlers.handle_standard_vital,
        'weight': handlers.handle_standard_vital,
        'bathroom': handlers.handle_standard_vital,
    }
