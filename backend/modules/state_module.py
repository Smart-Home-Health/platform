# modules/state_module.py
"""
State module - manages centralized application state and handles database operations.
"""
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional
import logging

from bus import EventBus
from events import (
    SensorUpdate, VitalSignRecorded, AlertTriggered, AlertResolved, 
    MedicationDue, CareTaskDue, EventSource
)

logger = logging.getLogger("state_module")

class StateModule:
    """Manages centralized application state and database operations."""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        
        # Current sensor state
        self.sensor_state = {}
        
        # Initialize with default sensor values
        self._initialize_sensor_state()
        
        # Alert tracking
        self.current_alert_id = None
        self.alert_thresholds_exceeded = False
        self.alert_start_data_id = None
        self.alert_recovery_start_time = None
        
        # Pulse ox data caching for alerts
        self.pulse_ox_cache = []
        self.event_data_points = []
        
    def _initialize_sensor_state(self):
        """Initialize sensor state with default values."""
        from sensor_manager import SENSOR_DEFINITIONS
        
        self.sensor_state = {name: None for name in SENSOR_DEFINITIONS.keys()}
        logger.info("Sensor state initialized")

    async def start_event_subscribers(self):
        """Start subscribing to relevant events."""
        asyncio.create_task(self._resilient_subscriber(
            "sensor_updates", SensorUpdate, self._handle_sensor_update))
        asyncio.create_task(self._resilient_subscriber(
            "vital_recordings", VitalSignRecorded, self._handle_vital_recording))
        logger.info("State module event subscribers started")

    async def _resilient_subscriber(self, name, event_type, handler):
        """Run a subscriber loop that auto-restarts on failure."""
        while True:
            try:
                async for event in self.event_bus.subscribe_to_type(event_type):
                    try:
                        await handler(event)
                    except Exception as e:
                        logger.error(f"Error in {name} handler: {e}")
            except (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt):
                logger.info(f"Subscriber {name} shutting down")
                return
            except Exception as e:
                logger.error(f"Subscriber {name} died: {e} — restarting in 1s")
                await asyncio.sleep(1)

    async def _subscribe_to_vital_recordings(self):
        """Subscribe to vital recording events and save to database."""
        async for event in self.event_bus.subscribe_to_type(VitalSignRecorded):
            try:
                await self._handle_vital_recording(event)
            except Exception as e:
                logger.error(f"Error handling vital recording: {e}")

    async def _handle_sensor_update(self, event: SensorUpdate):
        """Handle sensor update events."""
        # Update local state
        self.sensor_state.update(event.values)
        
        logger.debug(f"Updated sensor state: {event.values}")
        
        # Check for alerts if this is pulse ox data
        pulse_ox_values = {}
        for key in ["spo2", "bpm", "perfusion"]:
            if key in event.values:
                pulse_ox_values[key] = event.values[key]
        
        if pulse_ox_values:
            await self._handle_pulse_ox_update(pulse_ox_values, event.raw, patient_id=event.patient_id)
        
        # Publish to MQTT if this didn't originate from MQTT
        if event.source != EventSource.MQTT:
            await self._publish_sensor_data_to_mqtt(event.values)

    async def _handle_vital_recording(self, event: VitalSignRecorded):
        """Handle vital recording events by saving to database."""
        try:
            def _sync_save():
                from state_manager import get_db_session
                if event.vital_type == "blood_pressure":
                    from crud.vitals import save_blood_pressure
                    with get_db_session() as db:
                        save_blood_pressure(
                            db=db,
                            systolic=event.data["systolic"],
                            diastolic=event.data["diastolic"],
                            map_value=event.data.get("map"),
                            notes=event.data.get("raw_data")
                        )
                elif event.vital_type == "temperature":
                    from crud.vitals import save_temperature
                    with get_db_session() as db:
                        save_temperature(
                            db=db,
                            body_temp=event.data.get("body_temp"),
                            skin_temp=event.data.get("skin_temp"),
                            notes=event.data.get("raw_data")
                        )
                else:
                    return None
                return event.vital_type

            saved = await asyncio.to_thread(_sync_save)
            if saved:
                logger.info(f"Saved {saved} reading to vitals table")

        except Exception as e:
            logger.error(f"Error saving vital recording to database: {e}")

    async def _handle_pulse_ox_update(self, pulse_ox_data: dict, raw_data: Optional[str], patient_id: Optional[int] = None):
        """Handle pulse oximeter data and check for alerts."""
        try:
            spo2 = pulse_ox_data.get("spo2")
            bpm = pulse_ox_data.get("bpm")
            perfusion = pulse_ox_data.get("perfusion")

            # Cache the data
            timestamp = datetime.now()
            data_point = {
                "timestamp": timestamp,
                "spo2": spo2,
                "bpm": bpm,
                "perfusion": perfusion,
                "raw": raw_data
            }

            self.pulse_ox_cache.append(data_point)

            # Keep only last 150 points (~30 seconds at 5Hz)
            if len(self.pulse_ox_cache) > 150:
                self.pulse_ox_cache.pop(0)

            # Save to database
            await self._save_pulse_ox_data(spo2, bpm, perfusion, raw_data, patient_id=patient_id)

            # Check thresholds for alerts
            await self._check_pulse_ox_thresholds(spo2, bpm, timestamp, data_point, patient_id=patient_id)
            
        except Exception as e:
            logger.error(f"Error handling pulse ox update: {e}")

    async def _save_pulse_ox_data(self, spo2, bpm, perfusion, raw_data, patient_id=None):
        """Save pulse oximeter data to database (runs in thread to avoid blocking event loop)."""
        def _sync_save():
            from state_manager import get_db_session
            from crud.vitals import save_pulse_ox_data
            with get_db_session() as db:
                save_pulse_ox_data(
                    db=db,
                    spo2=spo2,
                    bpm=bpm,
                    pa=perfusion,
                    raw_data=raw_data,
                    patient_id=patient_id
                )
        try:
            await asyncio.to_thread(_sync_save)
        except Exception as e:
            logger.error(f"Error saving pulse ox data: {e}")

    async def _check_pulse_ox_thresholds(self, spo2, bpm, timestamp, data_point, patient_id=None):
        """Check pulse ox values against thresholds and manage alerts.

        State machine:
          IDLE  → thresholds exceeded → ALARM (start alert)
          ALARM → thresholds exceeded → ALARM (continue, reset recovery timer)
          ALARM → thresholds normal   → RECOVERING (start 30s timer)
          RECOVERING → thresholds exceeded → ALARM (cancel recovery)
          RECOVERING → 30s elapsed        → IDLE (end alert)
        """
        try:
            def _load_thresholds():
                from crud.settings import get_setting
                from state_manager import get_db_session
                with get_db_session() as db:
                    return (
                        int(get_setting(db, 'min_spo2', 90)),
                        int(get_setting(db, 'max_spo2', 100)),
                        int(get_setting(db, 'min_bpm', 55)),
                        int(get_setting(db, 'max_bpm', 155)),
                    )

            min_spo2, max_spo2, min_bpm, max_bpm = await asyncio.to_thread(_load_thresholds)

            is_disconnected = (spo2 == -1) or (bpm == -1)

            if is_disconnected:
                # Don't start or end alerts while disconnected; just keep logging if active
                return

            # Evaluate current thresholds
            spo2_alarm = spo2 is not None and (spo2 < min_spo2 or spo2 > max_spo2)
            bpm_alarm = bpm is not None and (bpm < min_bpm or bpm > max_bpm)
            thresholds_exceeded = spo2_alarm or bpm_alarm

            if self.current_alert_id is None:
                # --- IDLE ---
                if thresholds_exceeded:
                    await self._start_pulse_ox_alert(spo2, bpm, timestamp, data_point, alert_type="threshold", patient_id=patient_id)
                    self.alert_recovery_start_time = None
            else:
                # --- ALARM or RECOVERING ---
                if thresholds_exceeded:
                    # Still in alarm (or re-entered during recovery) — reset recovery
                    self.alert_recovery_start_time = None
                    self.event_data_points.append(data_point)
                else:
                    # Values normal — start or continue recovery countdown
                    if self.alert_recovery_start_time is None:
                        self.alert_recovery_start_time = timestamp
                        logger.info(f"Alert {self.current_alert_id}: values normal, starting 30s recovery timer")
                    else:
                        elapsed = (timestamp - self.alert_recovery_start_time).total_seconds()
                        if elapsed >= 30:
                            logger.info(f"Alert {self.current_alert_id}: 30s recovery complete, ending alert")
                            await self._end_pulse_ox_alert(timestamp)

        except Exception as e:
            logger.error(f"Error checking pulse ox thresholds: {e}")

    async def _start_pulse_ox_alert(self, spo2, bpm, timestamp, data_point, alert_type="threshold", patient_id=None):
        """Start a new pulse oximeter alert."""
        try:
            # Determine alert flags based on alert type
            if alert_type == "disconnected":
                spo2_alarm = False
                hr_alarm = False
                external_alarm_triggered = 1
            else:
                spo2_alarm = spo2 and (spo2 < 85 or spo2 > 100) if spo2 and spo2 != -1 else False
                hr_alarm = bpm and (bpm < 50 or bpm > 160) if bpm and bpm != -1 else False
                external_alarm_triggered = 0

            def _sync_start_alert():
                from state_manager import get_db_session
                from crud.monitoring import start_monitoring_alert
                with get_db_session() as db:
                    return start_monitoring_alert(
                        db=db,
                        spo2=spo2,
                        bpm=bpm,
                        data_id=data_point.get("id"),
                        spo2_alarm_triggered=1 if spo2_alarm else 0,
                        hr_alarm_triggered=1 if hr_alarm else 0,
                        external_alarm_triggered=external_alarm_triggered,
                        patient_id=patient_id
                    )

            alert_data = await asyncio.to_thread(_sync_start_alert)
            if alert_data:
                self.current_alert_id = alert_data.id if hasattr(alert_data, 'id') else alert_data
                self.alert_start_data_id = data_point.get("id")
            
            # Reset event tracking
            self.event_data_points = list(self.pulse_ox_cache)  # Copy current cache
            self.alert_recovery_start_time = None
            
            # Determine severity based on alert type
            if alert_type == "disconnected":
                severity = "medium"
                alert_description = f"Device disconnected (SpO2={spo2}, BPM={bpm})"
            else:
                severity = "high" if spo2_alarm or hr_alarm else "medium"
                alert_description = f"Threshold violation (SpO2={spo2}, BPM={bpm})"
            
            # Publish alert triggered event
            alert_event = AlertTriggered(
                ts=timestamp,
                alert_type=f"pulse_ox_{alert_type}",
                alert_data={"spo2": spo2, "bpm": bpm, "timestamp": timestamp.isoformat(), "type": alert_type},
                severity=severity,
                source=EventSource.SYSTEM
            )
            await self.event_bus.publish(alert_event, topic="alerts.triggered")
            
            logger.warning(f"Pulse ox {alert_type} alert started: {alert_description}")
            
        except Exception as e:
            logger.error(f"Error starting pulse ox alert: {e}")

    async def _end_pulse_ox_alert(self, timestamp):
        """End the current pulse oximeter alert."""
        try:
            from state_manager import get_db_session
            from crud.monitoring import update_monitoring_alert, acknowledge_alert

            if self.current_alert_id:
                alert_id = self.current_alert_id

                def _sync_end_alert():
                    with get_db_session() as db:
                        update_monitoring_alert(
                            db=db,
                            alert_id=alert_id,
                            end_time=timestamp.isoformat(),
                        )
                        acknowledge_alert(db=db, alert_id=alert_id)

                await asyncio.to_thread(_sync_end_alert)
                
                # Publish alert resolved event
                alert_event = AlertResolved(
                    ts=timestamp,
                    alert_id=alert_id,
                    resolution_type="automatic",
                    source=EventSource.SYSTEM
                )
                await self.event_bus.publish(alert_event, topic="alerts.resolved")

                logger.info(f"Pulse ox alert {alert_id} automatically resolved (end_time set)")

                # Reset tracking
                self.current_alert_id = None
                self.alert_start_data_id = None
                self.event_data_points = []
                
            self.alert_recovery_start_time = None
            
        except Exception as e:
            logger.error(f"Error ending pulse ox alert: {e}")

    async def _publish_sensor_data_to_mqtt(self, sensor_data: dict):
        """Publish sensor data to MQTT via MQTT publisher."""
        try:
            # Get the MQTT publisher from the global modules
            from main import get_modules
            modules = get_modules()
            mqtt_module = modules.get("mqtt")
            
            if mqtt_module and mqtt_module.mqtt_publisher:
                publisher = mqtt_module.mqtt_publisher
                
                # Publish each sensor value to its MQTT topic
                for key, value in sensor_data.items():
                    if value is not None:
                        # Map sensor keys to vital types
                        vital_type = key
                        
                        # Create payload based on vital type
                        if vital_type in ["spo2", "bpm", "perfusion"]:
                            # These are generic vitals, use 'value' key
                            payload = {"value": value}
                        elif vital_type in ["skin_temp", "body_temp"]:
                            # Map to temperature with proper keys
                            payload = {vital_type: value}
                            vital_type = "temperature"
                        else:
                            # Generic vital format
                            payload = {"value": value}
                        
                        # Publish to MQTT
                        success = publisher.publish_vital_data(vital_type, payload)
                        if success:
                            logger.debug(f"Published {vital_type} to MQTT: {payload}")
                        else:
                            logger.debug(f"MQTT publish skipped for {vital_type} (disabled or not available)")
            else:
                logger.debug("MQTT publisher not available for sensor data")
            
        except Exception as e:
            logger.error(f"Error publishing to MQTT: {e}")

    def get_current_state(self) -> dict:
        """Get the current sensor state."""
        return self.sensor_state.copy()

    def get_status(self) -> dict:
        """Get current status of the state module."""
        return {
            "sensor_count": len(self.sensor_state),
            "current_alert_id": self.current_alert_id,
            "alert_active": self.current_alert_id is not None,
            "thresholds_exceeded": self.alert_thresholds_exceeded,
            "cache_size": len(self.pulse_ox_cache)
        }
