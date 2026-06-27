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
from events import SensorUpdate, MQTTConnectionEvent, VitalSignRecorded, EventSource, NutritionSensorUpdate, DueCountsChanged

logger = logging.getLogger("mqtt_module")

# Per-patient MQTT section ids whose combined-state values are due-now/late badge
# counts. Each maps to two state keys (see crud helpers / mqtt.discovery).
BADGE_SECTION_IDS = ("meds_counts", "nutrition_counts", "care_task_counts", "equipment_counts")

class MQTTModule:
    """Manages MQTT message handling and publishes events from MQTT data."""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.mqtt_manager = None
        self.mqtt_publisher = None
        self.is_connected = False
        self._patient_state_cache: Dict[int, Dict[str, Any]] = {}
        # Cached alarm thresholds (min_spo2, max_spo2, min_bpm, max_bpm) + monotonic fetch time.
        self._alarm_thresholds: Optional[tuple] = None
        self._alarm_thresholds_ts: float = 0.0

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
        # Subscribe to DueCountsChanged so badge-count sensors update instantly
        asyncio.create_task(self._subscribe_to_due_counts_changed())
        # Periodically recompute badge counts so they "age in" over time
        asyncio.create_task(self._badge_counts_updater())
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
        """Nutrition (manual OR scheduled feeds + target changes) and bathroom/output
        changes flow through here from the dedicated nutrition module. Recompute the
        patient's calorie/bathroom state and publish to the per-patient combined state
        topic, which filters by the patient's MQTT `sections` config. Reacting to the
        calorie intake/target events covers every intake change without publishing
        redundantly for water/scheduled."""
        try:
            sensor_type = event.sensor_type
            if sensor_type == 'bathroom':
                compute = self._bathroom_state
            elif sensor_type in ('nutrition_calories_intake', 'nutrition_calories_target'):
                compute = self._nutrition_state
            else:
                return

            patient_id = (event.metadata or {}).get('patient_id')
            if patient_id is None:
                logger.debug(f"Event {sensor_type} has no patient_id; skipping")
                return
            if not (self.mqtt_publisher and self.mqtt_publisher.is_available()):
                return

            state_update = await compute(patient_id)
            if not state_update:
                return
            self._patient_state_cache.setdefault(patient_id, {}).update(state_update)
            if await self._publish_patient_state_with_alarms(patient_id):
                logger.info(f"Published {sensor_type} state for patient {patient_id} to HA")
        except Exception as e:
            logger.error(f"Error handling NutritionSensorUpdate event: {e}")

    async def _subscribe_to_sensor_updates_patient_state(self):
        """Subscribe to SensorUpdate; when patient_id is set, merge into per-patient state and publish combined state to MQTT."""
        logger.info("Starting subscription to SensorUpdate for per-patient MQTT state")
        async for event in self.event_bus.subscribe_to_type(SensorUpdate):
            try:
                patient_id = getattr(event, "patient_id", None)
                if patient_id is None:
                    continue
                if patient_id not in self._patient_state_cache:
                    # Fresh cache (e.g. after a restart): seed DB-derived keys
                    # (bathroom kind, calorie state) so the frequent reader
                    # publishes don't overwrite the retained combined state with
                    # only live-reader keys and blank out bathroom/nutrition in HA.
                    self._patient_state_cache[patient_id] = await self._seed_patient_state(patient_id)
                self._patient_state_cache[patient_id].update(event.values)
                await self._publish_patient_state_with_alarms(patient_id)
            except Exception as e:
                logger.error(f"Error publishing patient state to MQTT: {e}")

    async def _subscribe_to_due_counts_changed(self):
        """Refresh a patient's MQTT badge counts the moment a due item is logged /
        completed / restocked (DueCountsChanged), so HA reflects it without waiting
        for the periodic tick."""
        logger.info("Starting subscription to DueCountsChanged for MQTT badge counts")
        async for event in self.event_bus.subscribe_to_type(DueCountsChanged):
            try:
                patient_id = getattr(event, "patient_id", None)
                if patient_id is None:
                    continue
                await self._refresh_and_publish_badge_counts(patient_id)
            except Exception as e:
                logger.error(f"Error handling DueCountsChanged for MQTT badge counts: {e}")

    async def _badge_counts_updater(self):
        """Recompute every MQTT-enabled patient's badge counts every 60s so the
        due-now/late counts age in as scheduled times pass — there is no event when
        an occurrence simply crosses the ±1h / >1h thresholds. Mirrors the live
        dashboard's 60s badge poll. Patients without a badge section enabled are a
        no-op (the counts are config-gated in _badge_counts)."""
        from mqtt.settings import get_patients_with_mqtt_enabled
        logger.info("Started MQTT badge-counts updater (60s)")
        while True:
            await asyncio.sleep(60)
            try:
                if not (self.mqtt_publisher and self.mqtt_publisher.is_available()):
                    continue
                patients = await asyncio.to_thread(get_patients_with_mqtt_enabled)
                for entry in patients:
                    await self._refresh_and_publish_badge_counts(entry["patient_id"])
            except Exception as e:
                logger.error(f"Error in MQTT badge-counts updater: {e}")

    async def _badge_counts(self, patient_id: int) -> Dict[str, Any]:
        """Combined-state badge keys for a patient: due-now/late counts for meds,
        nutrition, care tasks, and equipment. Only the categories whose MQTT
        section is enabled (get/both) are computed — so a patient not using badge
        counts pays for no schedule queries and triggers no extra publishing."""
        def _load():
            from mqtt.settings import get_patient_mqtt_config
            from state_manager import get_db_session
            cfg = get_patient_mqtt_config(patient_id) or {}
            sections = cfg.get("sections") or {}
            wanted = {s for s in BADGE_SECTION_IDS if sections.get(s) in ("get", "both")}
            if not wanted:
                return {}
            out: Dict[str, Any] = {}
            with get_db_session() as db:
                if "meds_counts" in wanted:
                    from crud.medications import get_medication_due_now_late_counts
                    c = get_medication_due_now_late_counts(db, patient_id=patient_id)
                    out["meds_due_now"], out["meds_late"] = c["due_now"], c["late"]
                if "nutrition_counts" in wanted:
                    from crud.scheduling import get_nutrition_due_now_late_counts
                    c = get_nutrition_due_now_late_counts(db, patient_id=patient_id)
                    out["nutrition_due_now"], out["nutrition_late"] = c["due_now"], c["late"]
                if "care_task_counts" in wanted:
                    from crud.scheduling import get_care_task_due_now_late_counts
                    c = get_care_task_due_now_late_counts(db, patient_id=patient_id)
                    out["care_tasks_due_now"], out["care_tasks_late"] = c["due_now"], c["late"]
                if "equipment_counts" in wanted:
                    from crud.equipment import get_equipment_due_now_late_counts
                    c = get_equipment_due_now_late_counts(db, patient_id=patient_id)
                    out["equipment_due_now"], out["equipment_late"] = c["due_now"], c["late"]
            return out
        try:
            return await asyncio.to_thread(_load)
        except Exception as e:
            logger.error(f"Error computing badge counts for patient {patient_id}: {e}")
            return {}

    async def _refresh_and_publish_badge_counts(self, patient_id: int) -> None:
        """Recompute badge counts for a patient and republish the combined state.
        No-op when no badge section is enabled (empty counts). Seeds a fresh cache
        first so the republish doesn't blank out vitals/nutrition in HA."""
        if not (self.mqtt_publisher and self.mqtt_publisher.is_available()):
            return
        counts = await self._badge_counts(patient_id)
        if not counts:
            return
        if patient_id not in self._patient_state_cache:
            self._patient_state_cache[patient_id] = await self._seed_patient_state(patient_id)
        self._patient_state_cache[patient_id].update(counts)
        await self._publish_patient_state_with_alarms(patient_id)

    async def _get_alarm_thresholds(self) -> tuple:
        """Return (min_spo2, max_spo2, min_bpm, max_bpm) from settings, cached for 60s."""
        import time
        now = time.monotonic()
        if self._alarm_thresholds is None or now - self._alarm_thresholds_ts > 60:
            def _load():
                from crud.settings import get_setting
                from state_manager import get_db_session
                with get_db_session() as db:
                    return (
                        int(get_setting(db, 'min_spo2', 90)),
                        int(get_setting(db, 'max_spo2', 100)),
                        int(get_setting(db, 'min_bpm', 55)),
                        int(get_setting(db, 'max_bpm', 155)),
                    )
            try:
                self._alarm_thresholds = await asyncio.to_thread(_load)
                self._alarm_thresholds_ts = now
            except Exception as e:
                logger.error(f"Error loading alarm thresholds, using defaults: {e}")
                return self._alarm_thresholds or (90, 100, 55, 155)
        return self._alarm_thresholds

    @staticmethod
    def _compute_alarm_flags(state: Dict[str, Any], thresholds: tuple) -> Dict[str, str]:
        """Map SpO₂/BPM readings to HA binary-sensor payloads ("ON"/"OFF").

        Returns the safe "OFF" whenever the reading is in range, missing, or
        the sensor reports disconnected (-1), so Home Assistant never shows
        "Unknown" for an alarm that is simply not firing.
        """
        min_spo2, max_spo2, min_bpm, max_bpm = thresholds

        def _flag(value, lo, hi) -> str:
            if isinstance(value, (int, float)) and not isinstance(value, bool) and value != -1:
                return "ON" if (value < lo or value > hi) else "OFF"
            return "OFF"

        return {
            "spo2_alarm": _flag(state.get("spo2"), min_spo2, max_spo2),
            "bpm_alarm": _flag(state.get("bpm"), min_bpm, max_bpm),
        }

    async def _publish_patient_state_with_alarms(self, patient_id: int) -> bool:
        """Publish a patient's cached state to MQTT with computed alarm flags included."""
        if not (self.mqtt_publisher and self.mqtt_publisher.is_available()):
            return False
        state = self._patient_state_cache.get(patient_id, {})
        thresholds = await self._get_alarm_thresholds()
        payload = {**state, **self._compute_alarm_flags(state, thresholds)}
        return self.mqtt_publisher.publish_patient_combined_state(patient_id, payload)
        
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
        if vital_type == 'weight':
            value = vital_data.get('value')
            if value is None:
                value = vital_data.get('weight')
            return {'weight': value} if value is not None else {}
        # Bathroom now flows through the dedicated output module (NutritionOutput),
        # not the legacy manual-vitals 'bathroom' path.
        return {}

    async def _nutrition_state(self, patient_id: int) -> Dict[str, Any]:
        """Combined-state nutrition keys for a patient: last feed, today's total,
        and daily goal (kcal). Sourced from the DB off the event loop."""
        def _load():
            from crud.nutrition import get_patient_nutrition_mqtt_state
            from state_manager import get_db_session
            with get_db_session() as db:
                return get_patient_nutrition_mqtt_state(db, patient_id)
        try:
            return await asyncio.to_thread(_load)
        except Exception as e:
            logger.error(f"Error computing nutrition state for patient {patient_id}: {e}")
            return {}

    async def _seed_patient_state(self, patient_id: int) -> Dict[str, Any]:
        """DB-derived combined-state keys used to seed a fresh cache so they
        survive a restart and aren't dropped from the retained state by the next
        live-reader publish. Covers manual vitals (weight, temperature, BP),
        bathroom kind, and calorie/water state. Live-reader keys (spo2/bpm/
        perfusion) self-heal on the next reading and need no seeding."""
        def _load_vitals():
            from crud.vitals import get_patient_vitals_mqtt_state
            from state_manager import get_db_session
            with get_db_session() as db:
                return get_patient_vitals_mqtt_state(db, patient_id)
        seed: Dict[str, Any] = {}
        try:
            seed.update(await asyncio.to_thread(_load_vitals))
        except Exception as e:
            logger.error(f"Error seeding vitals for patient {patient_id}: {e}")
        seed.update(await self._bathroom_state(patient_id))
        seed.update(await self._nutrition_state(patient_id))
        seed.update(await self._badge_counts(patient_id))
        return seed

    async def _bathroom_state(self, patient_id: int) -> Dict[str, Any]:
        """Combined-state bathroom key for a patient: the last output kind
        (urine / bowel / both). Sourced from the DB off the event loop."""
        def _load():
            from crud.nutrition import get_patient_bathroom_mqtt_state
            from state_manager import get_db_session
            with get_db_session() as db:
                return get_patient_bathroom_mqtt_state(db, patient_id)
        try:
            return await asyncio.to_thread(_load)
        except Exception as e:
            logger.error(f"Error computing bathroom state for patient {patient_id}: {e}")
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

            if not (vital_type and from_manual and patient_id is not None):
                logger.info(f"Skipping MQTT publish - vital_type={vital_type}, from_manual={from_manual}, patient_id={patient_id}")
                return

            # Build the per-patient combined-state update. Nutrition is sourced from
            # the DB (last feed / today's total / daily goal); other vitals map from
            # the event payload. publish_patient_combined_state() then filters by the
            # patient's MQTT `sections` config, so what is actually sent is driven by
            # configuration — no hardcoded global topics / enabled flags.
            # Nutrition flows through NutritionSensorUpdate (covers manual + scheduled
            # feeds and target changes); skip it here to avoid double-publishing.
            if vital_type in ('calories', 'water', 'water_ml'):
                return
            state_update = self._vital_data_to_patient_state(vital_type, vital_data)

            if not state_update:
                logger.debug(f"No combined-state keys for {vital_type}; nothing to publish")
                return

            if not (self.mqtt_publisher and self.mqtt_publisher.is_available()):
                logger.info(f"MQTT publisher not available for {vital_type} (MQTT disabled)")
                return

            self._patient_state_cache.setdefault(patient_id, {}).update(state_update)
            if await self._publish_patient_state_with_alarms(patient_id):
                logger.info(f"Published {vital_type} to patient {patient_id} state topic for HA")
            else:
                logger.debug(f"Patient {patient_id} state topic not configured or filtered out")

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
