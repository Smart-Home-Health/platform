"""
Manual integration for local device data and manual entry.

This is the default integration that handles:
- Serial-connected devices (pulse oximeters, temp sensors)
- Manual vital entry via the UI
- Local GPIO/sensor data

It doesn't require external authentication and data flows in real-time
through the WebSocket/MQTT system rather than periodic syncing.

Note: Network-connected SHH devices (like SHH Pulse Oximeter readers)
are handled through the readers module, not this integration.
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


@register
class ManualIntegration(BaseIntegration):
    """
    Integration for manually entered data and local SHH devices.
    
    This integration is always available and doesn't require setup.
    It serves as the source for:
    - Manual vital entries from caregivers
    - Real-time data from serial-connected devices
    - Local sensor readings (GPIO, etc.)
    """
    
    slug = "manual"
    name = "Manual / SHH Device"
    description = "Manual entries and locally connected devices"
    auth_type = "none"
    supported_vitals = [
        VitalType.HEART_RATE.value,
        VitalType.SPO2.value,
        VitalType.BLOOD_PRESSURE_SYSTOLIC.value,
        VitalType.BLOOD_PRESSURE_DIASTOLIC.value,
        VitalType.TEMPERATURE.value,
        VitalType.RESPIRATORY_RATE.value,
        VitalType.PERFUSION_INDEX.value,
    ]
    
    @classmethod
    def get_config_schema(cls) -> Dict[str, Any]:
        """
        Manual integration has no configuration - always available.
        """
        return {
            "type": "object",
            "properties": {},
            "required": [],
            "description": "No configuration needed for manual entry."
        }
    
    async def authenticate(self, auth_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        No authentication needed for manual integration.
        """
        return {"authenticated": True, "type": "manual"}
    
    async def refresh_credentials(self) -> Dict[str, Any]:
        """
        No credentials to refresh.
        """
        return {"authenticated": True, "type": "manual"}
    
    async def fetch_devices(self) -> List[DeviceInfo]:
        """
        Return info about locally connected devices.
        
        This could be expanded to query the serial module for
        connected devices and their status.
        """
        # TODO: Query serial_module for actual connected devices
        return [
            DeviceInfo(
                device_id="shh-serial-primary",
                device_type="pulse_oximeter",
                device_name="Primary Serial Sensor",
                device_model="SHH Serial Device",
                last_seen_at=datetime.utcnow(),
            ),
        ]
    
    async def sync_data(
        self,
        since: Optional[datetime] = None,
        device_ids: Optional[List[str]] = None
    ) -> SyncResult:
        """
        Manual integration doesn't sync - data flows in real-time.
        
        Data from serial devices is pushed via WebSocket/MQTT as it arrives.
        Manual entries are saved directly to the database.
        This method exists only for API compatibility.
        """
        return SyncResult(
            success=True,
            readings_count=0,
            readings=[],
            error_message="Manual integration uses real-time data flow, no sync needed.",
            sync_timestamp=datetime.utcnow(),
        )
    
    async def test_connection(self) -> bool:
        """
        Manual integration is always available.
        """
        return True
