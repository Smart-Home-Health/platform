# modules/mqtt_module.py
"""
MQTT module - manages MQTT connections and publishes sensor data events from MQTT messages.
"""
import asyncio
import json
from datetime import datetime
from typing import Optional, Dict, Any
import logging

from bus import EventBus
from events import SensorUpdate, MQTTConnectionEvent, VitalSignRecorded, EventSource, NutritionSensorUpdate

logger = logging.getLogger("mqtt_module")

class MQTTModule:
    """Manages MQTT message handling and publishes events from MQTT data."""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.mqtt_manager = None
        self.mqtt_publisher = None
        self.is_connected = False
        self._patient_state_cache: Dict[int, Dict[str, Any]] = {}
        
    def set_mqtt_components(self, mqtt_manager, mqtt_publisher):
        """Set the MQTT manager and publisher components."""
        self.mqtt_manager = mqtt_manager
        self.mqtt_publisher = mqtt_publisher
        if mqtt_manager:
            mqtt_manager.set_patient_set_handler(self._sync_patient_set_handler)
        
    async def start_event_subscribers(self):
        """Start subscribing to relevant events."""
        # Subscribe to vital_saved events to publish manually entered vitals to MQTT
        asyncio.create_task(self._subscribe_to_vital_saved())
        # Subscribe to SensorUpdate events for nutrition MQTT publishing
        asyncio.create_task(self._subscribe_to_sensor_updates())
        # Subscribe to SensorUpdate for per-patient combined state publishing
        asyncio.create_task(self._subscribe_to_sensor_updates_patient_state())
        logger.info("MQTT module event subscribers started")
    
    async def _subscribe_to_sensor_updates(self):
        """Subscribe to NutritionSensorUpdate events and publish them to MQTT."""
        logger.info("Starting subscription to NutritionSensorUpdate events")
        async for event in self.event_bus.subscribe_to_type(NutritionSensorUpdate):
            try:
                await self._handle_sensor_update(event)
            except Exception as e:
                logger.error(f"Error handling NutritionSensorUpdate event: {e}")
    
    async def _handle_sensor_update(self, event: NutritionSensorUpdate):
        """Handle SensorUpdate events by publishing to MQTT."""
        try:
            sensor_type = event.sensor_type
            value = event.value
            metadata = event.metadata or {}
            
            # Only publish nutrition-related sensor updates to MQTT
            nutrition_types = [
                'nutrition_water_intake', 'nutrition_water_scheduled', 'nutrition_water_target',
                'nutrition_calories_intake', 'nutrition_calories_scheduled', 'nutrition_calories_target'
            ]
            
            if sensor_type in nutrition_types:
                logger.info(f"Publishing {sensor_type} to MQTT: {value}")
                
                if self.mqtt_publisher and self.mqtt_publisher.is_available():
                    vital_data = {
                        'value': value,
                        'metadata': metadata
                    }
                    success = self.mqtt_publisher.publish_vital_data(sensor_type, vital_data)
                    if success:
                        logger.info(f"Successfully published {sensor_type} to MQTT")
                    else:
                        logger.warning(f"Failed to publish {sensor_type} to MQTT")
                else:
                    logger.debug(f"MQTT publisher not available for {sensor_type}")
                    
        except Exception as e:
            logger.error(f"Error handling SensorUpdate event: {e}")

    async def _subscribe_to_sensor_updates_patient_state(self):
        """Subscribe to SensorUpdate; when patient_id is set, merge into per-patient state and publish combined state to MQTT."""
        logger.info("Starting subscription to SensorUpdate for per-patient MQTT state")
        async for event in self.event_bus.subscribe_to_type(SensorUpdate):
            try:
                patient_id = getattr(event, "patient_id", None)
                if patient_id is None:
                    continue
                if patient_id not in self._patient_state_cache:
                    self._patient_state_cache[patient_id] = {}
                self._patient_state_cache[patient_id].update(event.values)
                if self.mqtt_publisher and self.mqtt_publisher.is_available():
                    self.mqtt_publisher.publish_patient_combined_state(
                        patient_id, self._patient_state_cache[patient_id]
                    )
            except Exception as e:
                logger.error(f"Error publishing patient state to MQTT: {e}")
        
    async def _subscribe_to_vital_saved(self):
        """Subscribe to vital_saved events and publish them to MQTT."""
        logger.info("Starting subscription to vital_saved events")
        async for event in self.event_bus.subscribe_to_topic("vital_saved"):
            try:
                logger.info(f"Received vital_saved event: {event}")
                await self._handle_vital_saved(event)
            except Exception as e:
                logger.error(f"Error handling vital_saved event: {e}")
                
    def _vital_data_to_patient_state(self, vital_type: str, vital_data: Dict[str, Any]) -> Dict[str, Any]:
        """Map vital_type + vital_data to patient combined-state keys (for shh/patient/{id}/state)."""
        if vital_type == 'temperature':
            body = vital_data.get('body_temp') if vital_data.get('body_temp') is not None else vital_data.get('temperature')
            skin = vital_data.get('skin_temp')
            out = {}
            if body is not None:
                out['body_temp'] = body
            if skin is not None:
                out['skin_temp'] = skin
            return out
        if vital_type == 'blood_pressure':
            return {
                k: v for k, v in {
                    'systolic_bp': vital_data.get('systolic_bp') or vital_data.get('systolic'),
                    'diastolic_bp': vital_data.get('diastolic_bp') or vital_data.get('diastolic'),
                    'map_bp': vital_data.get('map_bp') or vital_data.get('map'),
                }.items() if v is not None
            }
        return {}

    async def _handle_vital_saved(self, event: dict):
        """Handle vital_saved events by publishing to MQTT."""
        try:
            logger.info(f"Processing vital_saved event: {event}")
            data = event.get("data", {})
            vital_type = data.get("vital_type")
            vital_data = data.get("vital_data", {})
            from_manual = data.get("from_manual", False)
            patient_id = data.get("patient_id")

            logger.info(f"Extracted: vital_type={vital_type}, vital_data={vital_data}, from_manual={from_manual}, patient_id={patient_id}")

            # Skip nutrition types - they're handled by NutritionSensorUpdate events
            nutrition_vital_types = ['water', 'water_ml', 'calories']
            if vital_type in nutrition_vital_types:
                logger.info(f"Skipping {vital_type} - handled by NutritionSensorUpdate with daily totals")
                return

            if vital_type and vital_data and from_manual:
                logger.info(f"Publishing manually saved {vital_type} to MQTT: {vital_data}")

                if self.mqtt_publisher and self.mqtt_publisher.is_available():
                    success = self.mqtt_publisher.publish_vital_data(vital_type, vital_data)
                    if success:
                        logger.info(f"Successfully published {vital_type} to MQTT")
                    else:
                        logger.warning(f"Failed to publish {vital_type} to MQTT")

                    # So HA sees it: publish to patient combined state topic (discovery uses shh/patient/{id}/state)
                    if patient_id is not None:
                        state_update = self._vital_data_to_patient_state(vital_type, vital_data)
                        if state_update:
                            if patient_id not in self._patient_state_cache:
                                self._patient_state_cache[patient_id] = {}
                            self._patient_state_cache[patient_id].update(state_update)
                            if self.mqtt_publisher.publish_patient_combined_state(
                                patient_id, self._patient_state_cache[patient_id]
                            ):
                                logger.info(f"Published {vital_type} to patient {patient_id} state topic for HA")
                            else:
                                logger.debug(f"Patient {patient_id} state topic not configured or filtered out")
                else:
                    logger.info(f"MQTT publisher not available for {vital_type} (MQTT disabled)")
            else:
                logger.info(f"Skipping MQTT publish - vital_type={vital_type}, has_data={bool(vital_data)}, from_manual={from_manual}")

        except Exception as e:
            logger.error(f"Error handling vital_saved event: {e}")
        
    async def handle_mqtt_message(self, topic: str, payload: dict, raw_data: str):
        """
        Handle incoming MQTT messages and convert them to events.
        This replaces the direct update_sensor calls with event publishing.
        """
        try:
            # Parse topic to determine vital type
            # Expected format: shh/{vital_type}/set
            topic_parts = topic.split('/')
            if len(topic_parts) >= 2:
                vital_type = topic_parts[1]
            else:
                logger.warning(f"Invalid MQTT topic format: {topic}")
                return
            
            logger.info(f"Processing MQTT message for {vital_type}: {payload}")
            
            # Handle different vital types
            if vital_type == "blood_pressure" or vital_type == "bp":
                await self._handle_blood_pressure_mqtt(vital_type, payload, raw_data)
            elif vital_type == "temperature" or vital_type == "temp":
                await self._handle_temperature_mqtt(vital_type, payload, raw_data)
            elif vital_type in ["bathroom", "water", "calories"]:
                await self._handle_simple_vital_mqtt(vital_type, payload, raw_data)
            elif vital_type in ["spo2", "bpm", "perfusion"]:
                await self._handle_pulse_ox_mqtt(vital_type, payload, raw_data)
            else:
                # Generic vital handling
                await self._handle_generic_vital_mqtt(vital_type, payload, raw_data)
                
        except Exception as e:
            logger.error(f"Error handling MQTT message for topic {topic}: {e}")

    def _sync_patient_set_handler(self, patient_id: int, payload: dict, topic: str, raw_data: str):
        """Sync entry for per-patient set topic; schedules async handler on the MQTT loop."""
        import asyncio
        loop = getattr(self.mqtt_manager, "loop", None) if self.mqtt_manager else None
        if loop:
            asyncio.run_coroutine_threadsafe(
                self._handle_patient_set_async(patient_id, payload, topic, raw_data),
                loop,
            )
        else:
            logger.warning("No event loop for patient set handler")

    async def _handle_patient_set_async(self, patient_id: int, payload: dict, topic: str, raw_data: str):
        """Handle combined payload on .../patient/{id}/set and dispatch to vitals with patient_id."""
        try:
            if payload.get("systolic") is not None or payload.get("diastolic") is not None or payload.get("map") is not None:
                await self._handle_blood_pressure_mqtt("blood_pressure", payload, raw_data, patient_id=patient_id)
            if payload.get("skin_temp") is not None or payload.get("body_temp") is not None:
                await self._handle_temperature_mqtt("temperature", payload, raw_data, patient_id=patient_id)
            if payload.get("spo2") is not None:
                await self._handle_pulse_ox_mqtt("spo2", {"value": payload["spo2"]}, raw_data, patient_id=patient_id)
            if payload.get("bpm") is not None:
                await self._handle_pulse_ox_mqtt("bpm", {"value": payload["bpm"]}, raw_data, patient_id=patient_id)
            if payload.get("perfusion") is not None:
                await self._handle_pulse_ox_mqtt("perfusion", {"value": payload["perfusion"]}, raw_data, patient_id=patient_id)
            if payload.get("value") is not None and not any(k in payload for k in ("systolic", "diastolic", "skin_temp", "body_temp", "spo2", "bpm", "perfusion")):
                await self._handle_simple_vital_mqtt("vital", payload, raw_data, patient_id=patient_id)
        except Exception as e:
            logger.error(f"Error handling patient {patient_id} set: {e}")

    async def _handle_blood_pressure_mqtt(self, vital_type: str, payload: dict, raw_data: str, patient_id: int = None):
        """Handle blood pressure MQTT messages."""
        systolic = payload.get("systolic")
        diastolic = payload.get("diastolic")
        map_value = payload.get("map")
        
        # Save to database if we have valid values
        if (systolic is not None and diastolic is not None and map_value is not None and
            not (systolic == 0 and diastolic == 0 and map_value == 0)):
            
            # Publish vital sign recorded event using unified approach
            vital_event = VitalSignRecorded(
                ts=datetime.now(),
                vital_type="blood_pressure",
                data={
                    "systolic": systolic,
                    "diastolic": diastolic,
                    "map": map_value,
                    "raw_data": raw_data,
                },
                patient_id=patient_id,
                source=EventSource.MQTT
            )
            await self.event_bus.publish(vital_event, topic="vitals.recorded")
            
            # Also publish sensor update for real-time display
            sensor_values = {
                "systolic_bp": systolic,
                "diastolic_bp": diastolic,
                "map_bp": map_value
            }
            
            sensor_event = SensorUpdate(
                ts=datetime.now(),
                values=sensor_values,
                raw=raw_data,
                source=EventSource.MQTT,
                patient_id=patient_id,
            )
            await self.event_bus.publish(sensor_event, topic="sensors.update")

    async def _handle_temperature_mqtt(self, vital_type: str, payload: dict, raw_data: str, patient_id: int = None):
        """Handle temperature MQTT messages."""
        skin_temp = payload.get("skin_temp")
        body_temp = payload.get("body_temp")
        
        # Save to database if we have valid values
        if skin_temp is not None and body_temp is not None:
            # Publish vital sign recorded event using unified approach
            vital_event = VitalSignRecorded(
                ts=datetime.now(),
                vital_type="temperature",
                data={
                    "skin_temp": skin_temp,
                    "body_temp": body_temp,
                    "raw_data": raw_data,
                },
                patient_id=patient_id,
                source=EventSource.MQTT
            )
            await self.event_bus.publish(vital_event, topic="vitals.recorded")
            
            # Also publish sensor updates for real-time display
            sensor_values = {}
            if skin_temp is not None:
                sensor_values["skin_temp"] = skin_temp
            if body_temp is not None:
                sensor_values["body_temp"] = body_temp
            
            if sensor_values:
                sensor_event = SensorUpdate(
                    ts=datetime.now(),
                    values=sensor_values,
                    raw=raw_data,
                    source=EventSource.MQTT,
                    patient_id=patient_id,
                )
                await self.event_bus.publish(sensor_event, topic="sensors.update")

    async def _handle_simple_vital_mqtt(self, vital_type: str, payload: dict, raw_data: str, patient_id: int = None):
        """Handle simple vital signs (bathroom, water, calories)."""
        value = payload.get("value")
        
        if value is not None:
            # Publish sensor update
            sensor_values = {vital_type: value}
            
            sensor_event = SensorUpdate(
                ts=datetime.now(),
                values=sensor_values,
                raw=raw_data,
                source=EventSource.MQTT,
                patient_id=patient_id,
            )
            await self.event_bus.publish(sensor_event, topic="sensors.update")

    async def _handle_pulse_ox_mqtt(self, vital_type: str, payload: dict, raw_data: str, patient_id: int = None):
        """Handle pulse oximeter MQTT messages."""
        value = payload.get("value")
        
        if value is not None:
            # Publish sensor update
            sensor_values = {vital_type: value}
            
            sensor_event = SensorUpdate(
                ts=datetime.now(),
                values=sensor_values,
                raw=raw_data,
                source=EventSource.MQTT,
                patient_id=patient_id,
            )
            await self.event_bus.publish(sensor_event, topic="sensors.update")

    async def _handle_generic_vital_mqtt(self, vital_type: str, payload: dict, raw_data: str, patient_id: int = None):
        """Handle generic vital signs."""
        value = payload.get("value")
        
        if value is not None:
            # Publish sensor update
            sensor_values = {vital_type: value}
            
            sensor_event = SensorUpdate(
                ts=datetime.now(),
                values=sensor_values,
                raw=raw_data,
                source=EventSource.MQTT,
                patient_id=patient_id,
            )
            await self.event_bus.publish(sensor_event, topic="sensors.update")

    async def publish_sensor_data_to_mqtt(self, sensor_data: dict):
        """
        Publish sensor data to MQTT topics.
        This is called when sensor data needs to be published to MQTT.
        """
        if not self.mqtt_publisher or not self.mqtt_publisher.is_available():
            logger.debug("MQTT publisher not available for publishing sensor data")
            return
            
        try:
            # Publish each sensor value to its respective MQTT topic
            for sensor_name, value in sensor_data.items():
                if value is not None:
                    topic = f"shh/{sensor_name}/state"
                    payload = {"value": value, "timestamp": datetime.now().isoformat()}
                    
                    await self.mqtt_publisher.publish_data(topic, payload)
                    logger.debug(f"Published {sensor_name}={value} to MQTT topic {topic}")
                    
        except Exception as e:
            logger.error(f"Error publishing sensor data to MQTT: {e}")

    async def publish_vital_to_mqtt(self, vital_type: str, vital_data: dict):
        """
        Publish a specific vital to MQTT.
        This is called when vitals are manually entered through the API.
        """
        if not self.mqtt_publisher or not self.mqtt_publisher.is_available():
            logger.debug("MQTT publisher not available for publishing vital")
            return
            
        try:
            topic = f"shh/{vital_type}/state"
            payload = {
                **vital_data,
                "timestamp": datetime.now().isoformat()
            }
            
            await self.mqtt_publisher.publish_data(topic, payload)
            logger.info(f"Published {vital_type} vital to MQTT topic {topic}")
            
        except Exception as e:
            logger.error(f"Error publishing vital {vital_type} to MQTT: {e}")

    async def handle_connection_status(self, connected: bool, broker: str = None, error: str = None):
        """Handle MQTT connection status changes."""
        self.is_connected = connected
        
        # Publish connection event
        event = MQTTConnectionEvent(
            ts=datetime.now(),
            connected=connected,
            broker=broker,
            error=error,
            source=EventSource.MQTT
        )
        await self.event_bus.publish(event, topic="mqtt.connection")
        
        if connected:
            logger.info(f"MQTT connected to {broker}")
        else:
            logger.warning(f"MQTT disconnected from {broker}: {error}")

    def get_status(self) -> dict:
        """Get current status of the MQTT module."""
        is_connected = False
        if self.mqtt_manager:
            is_connected = self.mqtt_manager.is_connected()
        
        return {
            "connected": is_connected,
            "manager_available": self.mqtt_manager is not None,
            "publisher_available": self.mqtt_publisher is not None and self.mqtt_publisher.is_available()
        }
