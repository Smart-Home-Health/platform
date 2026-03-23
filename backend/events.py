# events.py
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum

class EventSource(Enum):
    """Define the source of events for tracking and preventing loops"""
    SERIAL = "serial"
    MQTT = "mqtt" 
    GPIO = "gpio"
    API = "api"
    SYSTEM = "system"
    READER = "reader"  # External SHH Reader device

@dataclass(frozen=True)
class SensorUpdate:
    """Generic sensor key/value update (matches your current update_sensor input)."""
    ts: datetime
    values: Dict[str, Any]           # e.g. {"spo2": 97, "bpm": 88}
    raw: Optional[str] = None
    source: EventSource = EventSource.SERIAL
    patient_id: Optional[int] = None

@dataclass(frozen=True)
class NutritionSensorUpdate:
    """Nutrition-specific sensor update for MQTT publishing."""
    sensor_type: str                 # e.g. "nutrition_water_intake", "nutrition_calories_target"
    value: Any                       # The sensor value
    timestamp: datetime
    source: EventSource = EventSource.API
    metadata: Optional[Dict[str, Any]] = None

@dataclass(frozen=True)
class AlarmPanelState:
    """GPIO alarm panel state change"""
    ts: datetime
    alarm1: bool
    alarm2: bool
    source: EventSource = EventSource.GPIO
    patient_id: Optional[int] = None

@dataclass(frozen=True)
class VitalSignRecorded:
    """A vital sign has been recorded to the database"""
    ts: datetime
    vital_type: str                  # "blood_pressure", "temperature", etc.
    data: Dict[str, Any]            # The vital data that was recorded
    patient_id: Optional[int] = None
    source: EventSource = EventSource.API

@dataclass(frozen=True)
class AlertTriggered:
    """An alert has been triggered"""
    ts: datetime
    alert_type: str                 # "pulse_ox", "ventilator", "threshold", etc.
    alert_data: Dict[str, Any]      # Alert details
    severity: str = "medium"        # "low", "medium", "high", "critical"
    source: EventSource = EventSource.SYSTEM

@dataclass(frozen=True)
class AlertResolved:
    """An alert has been resolved"""
    ts: datetime
    alert_id: int
    resolution_type: str            # "automatic", "manual", "timeout"
    source: EventSource = EventSource.SYSTEM

@dataclass(frozen=True)
class MedicationDue:
    """A medication is due"""
    ts: datetime
    medication_id: int
    patient_id: int
    scheduled_time: datetime
    source: EventSource = EventSource.SYSTEM

@dataclass(frozen=True)
class MedicationAdministered:
    """A medication has been administered"""
    ts: datetime
    medication_id: int
    patient_id: int
    administered_time: datetime
    administered_by: Optional[str] = None
    source: EventSource = EventSource.API

@dataclass(frozen=True)
class CareTaskDue:
    """A care task is due"""
    ts: datetime
    task_id: int
    task_type: str
    patient_id: int
    scheduled_time: datetime
    source: EventSource = EventSource.SYSTEM

@dataclass(frozen=True)
class CareTaskCompleted:
    """A care task has been completed"""
    ts: datetime
    task_id: int
    patient_id: int
    completed_time: datetime
    completed_by: Optional[str] = None
    notes: Optional[str] = None
    source: EventSource = EventSource.API

@dataclass(frozen=True)
class EquipmentCheck:
    """Equipment check status update"""
    ts: datetime
    equipment_id: int
    check_type: str                 # "scheduled", "manual", "alert"
    status: str                     # "ok", "maintenance_due", "failed"
    notes: Optional[str] = None
    source: EventSource = EventSource.API

@dataclass(frozen=True)
class SettingChanged:
    """A system setting has been changed"""
    ts: datetime
    setting_key: str
    old_value: Any
    new_value: Any
    changed_by: Optional[str] = None
    source: EventSource = EventSource.API

@dataclass(frozen=True)
class SerialConnectionEvent:
    """Serial connection status change"""
    ts: datetime
    connected: bool
    port: Optional[str] = None
    error: Optional[str] = None
    source: EventSource = EventSource.SERIAL

@dataclass(frozen=True)
class MQTTConnectionEvent:
    """MQTT connection status change"""
    ts: datetime
    connected: bool
    broker: Optional[str] = None
    error: Optional[str] = None
    source: EventSource = EventSource.MQTT

@dataclass(frozen=True)
class WebSocketEvent:
    """WebSocket client connection/disconnection"""
    ts: datetime
    client_id: str
    event_type: str                 # "connected", "disconnected"
    source: EventSource = EventSource.SYSTEM

@dataclass(frozen=True)
class StateSync:
    """Request for full state synchronization (for new WebSocket clients)"""
    ts: datetime
    client_id: Optional[str] = None
    source: EventSource = EventSource.SYSTEM
