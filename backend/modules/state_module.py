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
# modules/state_module.py
"""
State module - manages centralized application state and handles database operations.
"""
import asyncio
from dataclasses import dataclass, field
from typing import Dict, Any, Optional
import logging

from sqlalchemy import text

from bus import EventBus
from events import (
    SensorUpdate, VitalSignRecorded, AlertTriggered, AlertResolved,
    MedicationDue, CareTaskDue, EventSource
)
from crud.alert_closure import (
    CONTINUITY_SECONDS, GAP_SECONDS, RECOVERY_SECONDS,
    LIVE_GAP, LIVE_RECOVERY, classify_sample,
)
from utils.datetime_utils import make_utc, utc_now

logger = logging.getLogger("state_module")


@dataclass
class _PatientAlertState:
    """Alert tracking for one patient's stream.

    One of these per patient, never shared: with two patients streaming
    through one process, a shared scalar meant the second patient's alarms
    never opened a row, their normal samples closed the first patient's
    alert, and their cadence masked gaps in the other stream.
    """
    alert_id: Optional[int] = None
    start_data_id: Optional[int] = None
    recovery_start_time: Optional[Any] = None
    # Last sample that carried an actual reading. The gap that ends a
    # stranded alert is measured from here, not from the last sample of any
    # kind, so that a probe streaming -1 counts as silence.
    last_valid_sample_time: Optional[Any] = None
    event_data_points: list = field(default_factory=list)


class StateModule:
    """Manages centralized application state and database operations."""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        
        # Current sensor state
        self.sensor_state = {}
        
        # Initialize with default sensor values
        self._initialize_sensor_state()
        
        # Alert tracking, keyed by patient_id (resolved to the background
        # patient before use, so the key matches the row's patient_id).
        self.patient_alerts: Dict[Optional[int], _PatientAlertState] = {}

        # Pulse ox data caching for alerts
        self.pulse_ox_cache = []

    def _initialize_sensor_state(self):
        """Initialize sensor state with default values."""
        from sensor_manager import SENSOR_DEFINITIONS
        
        self.sensor_state = {name: None for name in SENSOR_DEFINITIONS.keys()}
        logger.info("Sensor state initialized")

    async def start_event_subscribers(self):
        """Start subscribing to relevant events."""
        # Before any sample can arrive: an alert that was open when the
        # process last stopped must be adopted, or the engine re-opens a
        # duplicate row on the next alarm sample and the original strands.
        await self._rehydrate_open_alerts()
        asyncio.create_task(self._resilient_subscriber(
            "sensor_updates", SensorUpdate, self._handle_sensor_update))
        asyncio.create_task(self._resilient_subscriber(
            "vital_recordings", VitalSignRecorded, self._handle_vital_recording))
        logger.info("State module event subscribers started")

    def _alert_state(self, patient_id) -> _PatientAlertState:
        st = self.patient_alerts.get(patient_id)
        if st is None:
            st = _PatientAlertState()
            self.patient_alerts[patient_id] = st
        return st

    async def _rehydrate_open_alerts(self):
        """Adopt alerts left open by a previous process (newest per patient).

        last_valid_sample_time is restored from the stored stream, not left
        empty: the gap rule measures silence from it, and without it the
        first sample after a long outage would start a fresh recovery
        countdown and stamp the end at the moment monitoring resumed — the
        exact failure PR #141 removed.
        """
        def _sync_load():
            from state_manager import get_db_session
            with get_db_session() as db:
                rows = db.execute(text(
                    "SELECT DISTINCT ON (patient_id) patient_id, id "
                    "FROM monitoring_alerts "
                    "WHERE end_time IS NULL AND end_source IS NULL "
                    "ORDER BY patient_id, start_time DESC, id DESC"
                )).all()
                adopted = []
                for pid, alert_id in rows:
                    last_valid = db.execute(text(
                        "SELECT max(timestamp) FROM pulse_ox_data "
                        "WHERE patient_id = :pid AND spo2 > 0 AND bpm > 0"
                    ), {"pid": pid}).scalar()
                    adopted.append((pid, alert_id, last_valid))
                return adopted

        try:
            adopted = await asyncio.to_thread(_sync_load)
        except Exception as e:
            logger.error(f"Error rehydrating open alerts: {e}")
            return

        for pid, alert_id, last_valid in adopted:
            st = self._alert_state(pid)
            st.alert_id = alert_id
            st.recovery_start_time = None
            st.last_valid_sample_time = make_utc(last_valid) if last_valid else None
            logger.info(
                f"Rehydrated open alert {alert_id} for patient {pid} "
                f"(last valid sample: {last_valid})"
            )

    async def _resilient_subscriber(self, name, event_type, handler):
        """Run a subscriber loop that auto-restarts on failure."""
        while True:
            try:
                async for event in self.event_bus.subscribe_to_type(event_type):
                    try:
                        await handler(event)
                    except Exception as e:
                        logger.error(f"Error in {name} handler: {e}")
                if not self.event_bus._running:
                    # Bus stopped: the subscription generator ends normally;
                    # without this check the while-True re-subscribes in a
                    # hot loop during shutdown.
                    logger.info(f"Subscriber {name} exiting (event bus stopped)")
                    return
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

            # Cache the data. Aware UTC: start_time is written with utc_now(),
            # and a naive local end_time would disagree with it by the offset
            # the moment this runs anywhere that is not on UTC.
            timestamp = utc_now()
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

        State machine, run independently per patient:
          IDLE  → thresholds exceeded → ALARM (start alert)
          ALARM → thresholds exceeded → ALARM (continue, reset recovery timer)
          ALARM → thresholds normal   → RECOVERING (start 30s timer)
          RECOVERING → thresholds exceeded → ALARM (cancel recovery)
          RECOVERING → 30s continuous     → IDLE (end alert)
          ALARM/RECOVERING → stream goes quiet → IDLE (end at last valid sample)

        The recovery countdown insists on *continuous* samples. It used to
        compare plain wall-clock between the first normal reading and any later
        one, so a sensor that came off mid-recovery and returned hours later
        satisfied "30 seconds have passed" on its first sample back, and the
        episode went into the record as having lasted those hours.
        """
        try:
            def _load_context():
                from crud.alert_closure import load_thresholds
                from state_manager import get_db_session
                with get_db_session() as db:
                    # Resolve the stream to a patient here, not at row-insert
                    # time: the per-patient state below must be keyed by the
                    # same id the row will carry, or a None-keyed stream and
                    # its resolved patient would fight over the same alerts.
                    resolved = patient_id
                    if resolved is None:
                        from crud.patients import get_background_patient_id
                        resolved = get_background_patient_id(db)
                    return load_thresholds(db), resolved

            thresholds, patient_id = await asyncio.to_thread(_load_context)
            st = self._alert_state(patient_id)
            kind = classify_sample(spo2, bpm, thresholds)
            prev_valid = st.last_valid_sample_time

            # The stream went quiet. Whatever arrives now describes a later
            # state of the world, not this episode, so close at the last thing
            # we actually saw and let this sample be judged as if idle.
            #
            # This runs before the disconnected check on purpose: when a probe
            # comes off, rows keep arriving at full cadence carrying -1, so the
            # sample stream has no hole in it at all. Only the *valid* samples
            # stop, which is why the gap is measured on those.
            if (st.alert_id is not None and prev_valid is not None
                    and (timestamp - prev_valid).total_seconds() > GAP_SECONDS):
                logger.info(
                    f"Alert {st.alert_id}: no valid samples for "
                    f"{(timestamp - prev_valid).total_seconds():.0f}s, "
                    f"ending at the last one"
                )
                await self._end_pulse_ox_alert(st, prev_valid, end_source=LIVE_GAP)

            if kind == "disconnected":
                # No reading to judge. Deliberately does not advance
                # last_valid_sample_time, so a long probe-off eventually
                # trips the gap above rather than sitting here forever. It does
                # break any recovery in progress: a stretch we could not see is
                # not evidence the patient stayed well.
                st.recovery_start_time = None
                return

            st.last_valid_sample_time = timestamp
            thresholds_exceeded = kind == "alarm"

            if st.alert_id is None:
                # --- IDLE ---
                if thresholds_exceeded:
                    await self._start_pulse_ox_alert(st, spo2, bpm, timestamp, data_point, alert_type="threshold", patient_id=patient_id)
                    st.recovery_start_time = None
            else:
                # --- ALARM or RECOVERING ---
                if thresholds_exceeded:
                    # Still in alarm (or re-entered during recovery) — reset recovery
                    st.recovery_start_time = None
                    st.event_data_points.append(data_point)
                else:
                    # Values normal — start or continue recovery countdown.
                    # A hole in the stream restarts it: the stretch either side
                    # is not one continuous run of normal readings.
                    broken = (prev_valid is not None
                              and (timestamp - prev_valid).total_seconds() > CONTINUITY_SECONDS)
                    if st.recovery_start_time is None or broken:
                        st.recovery_start_time = timestamp
                        logger.info(f"Alert {st.alert_id}: values normal, starting {RECOVERY_SECONDS}s recovery timer")
                    else:
                        elapsed = (timestamp - st.recovery_start_time).total_seconds()
                        if elapsed >= RECOVERY_SECONDS:
                            logger.info(f"Alert {st.alert_id}: {RECOVERY_SECONDS}s recovery complete, ending alert")
                            await self._end_pulse_ox_alert(st, timestamp, end_source=LIVE_RECOVERY)

        except Exception as e:
            logger.error(f"Error checking pulse ox thresholds: {e}")

    async def _start_pulse_ox_alert(self, st, spo2, bpm, timestamp, data_point, alert_type="threshold", patient_id=None):
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
                st.alert_id = alert_data.id if hasattr(alert_data, 'id') else alert_data
                st.start_data_id = data_point.get("id")

            # Reset event tracking
            st.event_data_points = list(self.pulse_ox_cache)  # Copy current cache
            st.recovery_start_time = None
            
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

    async def _end_pulse_ox_alert(self, st, timestamp, end_source=LIVE_RECOVERY):
        """End the patient's current pulse oximeter alert.

        end_source records how we arrived at this end time, so a reader can
        tell an episode we watched resolve from one we closed because the
        sensor stopped reporting.
        """
        try:
            from state_manager import get_db_session
            from crud.monitoring import update_monitoring_alert

            if st.alert_id:
                alert_id = st.alert_id
                end_time = make_utc(timestamp)

                def _sync_end_alert():
                    from schemas.monitoring_alert import MonitoringAlert
                    with get_db_session() as db:
                        # A rehydrated alert may have been closed by the sweep
                        # while this process still tracked it. Its inferred end
                        # (at the last real sample) must not be replaced with a
                        # live time stamped after the stream resumed.
                        already = db.query(MonitoringAlert.end_time).filter(
                            MonitoringAlert.id == alert_id).scalar()
                        if already is not None:
                            return False
                        update_monitoring_alert(
                            db=db,
                            alert_id=alert_id,
                            end_time=end_time,
                            end_source=end_source,
                        )
                        return True

                closed_here = await asyncio.to_thread(_sync_end_alert)

                if closed_here:
                    # Publish alert resolved event
                    alert_event = AlertResolved(
                        ts=timestamp,
                        alert_id=alert_id,
                        resolution_type="automatic",
                        source=EventSource.SYSTEM
                    )
                    await self.event_bus.publish(alert_event, topic="alerts.resolved")

                    logger.info(f"Pulse ox alert {alert_id} automatically resolved ({end_source})")
                else:
                    logger.info(f"Pulse ox alert {alert_id} was already closed elsewhere; releasing it")

                # Reset tracking
                st.alert_id = None
                st.start_data_id = None
                st.event_data_points = []

            st.recovery_start_time = None

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
        active_alerts = {pid: st.alert_id for pid, st in self.patient_alerts.items()
                         if st.alert_id is not None}
        return {
            "sensor_count": len(self.sensor_state),
            "active_alerts": active_alerts,
            "alert_active": bool(active_alerts),
            "cache_size": len(self.pulse_ox_cache)
        }
