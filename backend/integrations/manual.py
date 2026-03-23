"""
Manual integration for local device data and manual entry.

This is the default integration that handles:
- Manual vital entry via the UI

It doesn't require external authentication and data flows in real-time
through the WebSocket/MQTT system rather than periodic syncing.

Note: Serial and GPIO devices are provided by the external shh-reader app;
they connect via the readers module (pairing + WebSocket), not this integration.
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
    Integration for manually entered data.
    
    This integration is always available and doesn't require setup.
    It serves as the source for manual vital entries from caregivers.
    Serial/GPIO sensor data is provided by the external shh-reader app via the readers API.
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
        
        Serial/GPIO devices are provided by the external shh-reader app;
        they are managed and listed under the readers API, not here.
        """
        return []
    
    async def sync_data(
        self,
        since: Optional[datetime] = None,
        device_ids: Optional[List[str]] = None
    ) -> SyncResult:
        """
        Manual integration doesn't sync - data flows in real-time.
        
        Data from reader devices (serial/GPIO) is pushed via the readers WebSocket.
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
