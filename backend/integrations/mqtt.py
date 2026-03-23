"""
MQTT integration for per-patient MQTT/Home Assistant configuration.

Stores per-patient MQTT settings (enabled, section permissions get/set/both,
topic overrides) via PatientIntegration. Connection (broker, port, etc.) is
global in app settings; this integration only holds patient-level config.
"""
from datetime import datetime
from typing import Dict, Any, Optional, List

from .base import (
    BaseIntegration,
    VitalReading,
    DeviceInfo,
    SyncResult,
    VitalType,
)
from .registry import register


# Sections (vital/sensor types) that can have get/set/both permissions
MQTT_SECTIONS = [
    "spo2",
    "bpm",
    "perfusion",
    "temperature",
    "blood_pressure",
    "nutrition",
    "weight",
    "bathroom",
    "spo2_alarm",
    "bpm_alarm",
    "alarm1",
    "alarm2",
]

# Default section permission: "get" = device publishes to HA, "set" = HA can publish to device
SECTION_PERMISSION_CHOICES = ["off", "get", "set", "both"]


@register
class MQTTIntegration(BaseIntegration):
    """
    Config-only integration for MQTT per-patient settings.

    Settings schema: {
        "enabled": bool,
        "sections": { "<section>": "get"|"set"|"both"|"off", ... },
        "base_topic_override": str | null,
        "topic_overrides": { "state_topic": str?, "set_topic": str? }
    }
    """

    slug = "mqtt"
    name = "MQTT / Home Assistant"
    description = "Publish and subscribe to MQTT topics for Home Assistant integration"
    auth_type = "none"
    supported_vitals = [
        VitalType.HEART_RATE.value,
        VitalType.SPO2.value,
        VitalType.PERFUSION_INDEX.value,
        VitalType.TEMPERATURE.value,
        VitalType.BLOOD_PRESSURE_SYSTOLIC.value,
        VitalType.BLOOD_PRESSURE_DIASTOLIC.value,
        VitalType.BLOOD_PRESSURE_MAP.value,
        VitalType.WEIGHT.value,
    ]

    @classmethod
    def get_config_schema(cls) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean", "description": "Enable MQTT for this patient"},
                "sections": {
                    "type": "object",
                    "description": "Per-section permission: get, set, both, or off",
                    "additionalProperties": {"type": "string", "enum": SECTION_PERMISSION_CHOICES},
                },
                "base_topic_override": {"type": ["string", "null"], "description": "Override base topic for this patient"},
                "topic_overrides": {
                    "type": "object",
                    "properties": {
                        "state_topic": {"type": "string"},
                        "set_topic": {"type": "string"},
                    },
                },
            },
            "required": [],
        }

    async def authenticate(self, auth_data: Dict[str, Any]) -> Dict[str, Any]:
        return {"authenticated": True, "type": "mqtt"}

    async def refresh_credentials(self) -> Dict[str, Any]:
        return {"authenticated": True, "type": "mqtt"}

    async def fetch_devices(self) -> List[DeviceInfo]:
        return []

    async def sync_data(
        self,
        since: Optional[datetime] = None,
        device_ids: Optional[List[str]] = None,
    ) -> SyncResult:
        return SyncResult(
            success=True,
            readings_count=0,
            readings=[],
            error_message="MQTT uses real-time publish/subscribe, no sync needed.",
            sync_timestamp=datetime.utcnow(),
        )

    async def test_connection(self) -> bool:
        return True
