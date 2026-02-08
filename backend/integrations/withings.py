"""
Withings integration for health devices (scales, BP monitors, etc.)

Withings uses OAuth 2.0 authentication. Users authorize access through
the Withings website, and we receive tokens to fetch their health data.

Supported devices:
- Body+ / Body Cardio scales (weight, body composition)
- BPM Connect / BPM Core (blood pressure)
- Thermo (temperature)
- Sleep/Sleep Analyzer (sleep tracking)
- ScanWatch (HR, SpO2, ECG)

API Documentation: https://developer.withings.com/api-reference
"""
import os
import httpx
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

from .base import (
    BaseIntegration,
    VitalReading,
    DeviceInfo,
    SyncResult,
    VitalType,
    VitalUnit,
    AuthenticationError,
    SyncError,
)
from .registry import register


# Withings API configuration
WITHINGS_API_BASE = "https://wbsapi.withings.net"
WITHINGS_AUTH_URL = "https://account.withings.com/oauth2_user/authorize2"
WITHINGS_TOKEN_URL = "https://wbsapi.withings.net/v2/oauth2"

# Withings measurement types to our vital types
WITHINGS_MEASURE_TYPES = {
    1: (VitalType.WEIGHT.value, VitalUnit.KG.value),
    4: (VitalType.BLOOD_PRESSURE_SYSTOLIC.value, VitalUnit.MMHG.value),
    5: (VitalType.BLOOD_PRESSURE_DIASTOLIC.value, VitalUnit.MMHG.value),
    8: (VitalType.BODY_FAT.value, VitalUnit.PERCENT.value),
    9: (VitalType.BLOOD_PRESSURE_DIASTOLIC.value, VitalUnit.MMHG.value),  # Min diastolic
    10: (VitalType.BLOOD_PRESSURE_SYSTOLIC.value, VitalUnit.MMHG.value),  # Max systolic
    11: (VitalType.HEART_RATE.value, VitalUnit.BPM.value),
    12: (VitalType.TEMPERATURE.value, VitalUnit.CELSIUS.value),
    54: (VitalType.SPO2.value, VitalUnit.PERCENT.value),
    71: (VitalType.BONE_MASS.value, VitalUnit.KG.value),
    73: (VitalType.MUSCLE_MASS.value, VitalUnit.KG.value),
    77: (VitalType.WATER_PERCENTAGE.value, VitalUnit.PERCENT.value),
    91: (VitalType.BLOOD_PRESSURE_MAP.value, VitalUnit.MMHG.value),  # Pulse Wave Velocity
}

# Withings device models
WITHINGS_DEVICE_MODELS = {
    0: "Unknown",
    16: "Withings WS-30",
    21: "Withings Thermo",
    22: "Withings Aura",
    41: "Withings Sleep",
    44: "Withings BPM+",
    45: "Withings Body+",
    46: "Withings BPM Core",
    51: "Withings ScanWatch",
    52: "Withings Body Scan",
    54: "Withings Body Cardio",
    55: "Withings BPM Connect",
    58: "Withings ScanWatch Light",
}


@register
class WithingsIntegration(BaseIntegration):
    """
    Integration with Withings Health ecosystem.
    
    Supports OAuth2 authentication and data sync from:
    - Scales (weight, body composition)
    - Blood pressure monitors
    - Thermometers
    - Sleep trackers
    - Smartwatches (ScanWatch)
    """
    
    slug = "withings"
    name = "Withings"
    description = "Withings smart scales, blood pressure monitors, and wearables"
    auth_type = "oauth2"
    supported_vitals = [
        VitalType.WEIGHT.value,
        VitalType.BODY_FAT.value,
        VitalType.MUSCLE_MASS.value,
        VitalType.BONE_MASS.value,
        VitalType.WATER_PERCENTAGE.value,
        VitalType.BLOOD_PRESSURE_SYSTOLIC.value,
        VitalType.BLOOD_PRESSURE_DIASTOLIC.value,
        VitalType.HEART_RATE.value,
        VitalType.TEMPERATURE.value,
        VitalType.SPO2.value,
        VitalType.SLEEP_DURATION.value,
    ]
    
    @classmethod
    def get_config_schema(cls) -> Dict[str, Any]:
        """
        Withings requires OAuth2 - no manual configuration needed.
        """
        return {
            "type": "object",
            "properties": {
                "sync_weight": {
                    "type": "boolean",
                    "title": "Sync Weight & Body Composition",
                    "default": True,
                },
                "sync_blood_pressure": {
                    "type": "boolean",
                    "title": "Sync Blood Pressure",
                    "default": True,
                },
                "sync_temperature": {
                    "type": "boolean",
                    "title": "Sync Temperature",
                    "default": True,
                },
                "sync_sleep": {
                    "type": "boolean",
                    "title": "Sync Sleep Data",
                    "default": False,
                },
            },
            "required": [],
            "description": "Click 'Connect' to authorize with your Withings account.",
        }
    
    @classmethod
    def get_oauth_url(cls, state: str, redirect_uri: str) -> Optional[str]:
        """
        Generate Withings OAuth authorization URL.
        
        Args:
            state: CSRF protection state
            redirect_uri: Callback URL
            
        Returns:
            Authorization URL
        """
        client_id = os.getenv("WITHINGS_CLIENT_ID")
        if not client_id:
            return None
            
        # Withings scopes
        scope = "user.info,user.metrics,user.activity"
        
        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scope,
            "state": state,
        }
        
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{WITHINGS_AUTH_URL}?{query}"
    
    async def authenticate(self, auth_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Exchange authorization code for access tokens.
        
        Args:
            auth_data: Dict with 'code' from OAuth callback
            
        Returns:
            Credentials dict with access_token, refresh_token, expires_at
        """
        code = auth_data.get("code")
        redirect_uri = auth_data.get("redirect_uri")
        
        if not code:
            raise AuthenticationError("No authorization code provided")
        
        client_id = os.getenv("WITHINGS_CLIENT_ID")
        client_secret = os.getenv("WITHINGS_CLIENT_SECRET")
        
        if not client_id or not client_secret:
            raise AuthenticationError("Withings API credentials not configured")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                WITHINGS_TOKEN_URL,
                data={
                    "action": "requesttoken",
                    "grant_type": "authorization_code",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
            )
            
            if response.status_code != 200:
                raise AuthenticationError(f"Token request failed: {response.text}")
            
            data = response.json()
            
            if data.get("status") != 0:
                error = data.get("error", "Unknown error")
                raise AuthenticationError(f"Withings error: {error}")
            
            body = data.get("body", {})
            expires_in = body.get("expires_in", 3600)
            
            return {
                "access_token": body.get("access_token"),
                "refresh_token": body.get("refresh_token"),
                "user_id": body.get("userid"),
                "expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
                "scope": body.get("scope"),
            }
    
    async def refresh_credentials(self) -> Dict[str, Any]:
        """
        Refresh expired access token using refresh token.
        """
        if not self.credentials or not self.credentials.get("refresh_token"):
            raise AuthenticationError("No refresh token available")
        
        client_id = os.getenv("WITHINGS_CLIENT_ID")
        client_secret = os.getenv("WITHINGS_CLIENT_SECRET")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                WITHINGS_TOKEN_URL,
                data={
                    "action": "requesttoken",
                    "grant_type": "refresh_token",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": self.credentials["refresh_token"],
                },
            )
            
            if response.status_code != 200:
                raise AuthenticationError(f"Token refresh failed: {response.text}")
            
            data = response.json()
            
            if data.get("status") != 0:
                raise AuthenticationError(f"Withings error: {data.get('error')}")
            
            body = data.get("body", {})
            expires_in = body.get("expires_in", 3600)
            
            return {
                "access_token": body.get("access_token"),
                "refresh_token": body.get("refresh_token"),
                "user_id": body.get("userid"),
                "expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
                "scope": body.get("scope"),
            }
    
    async def _get_headers(self) -> Dict[str, str]:
        """Get authenticated headers, refreshing if needed."""
        if not self.credentials:
            raise AuthenticationError("Not authenticated")
        
        # Check if token is expired
        expires_at = self.credentials.get("expires_at")
        if expires_at:
            expires_dt = datetime.fromisoformat(expires_at)
            if datetime.utcnow() >= expires_dt - timedelta(minutes=5):
                # Token is expired or about to expire, refresh it
                self.credentials = await self.refresh_credentials()
        
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
        }
    
    async def fetch_devices(self) -> List[DeviceInfo]:
        """
        Fetch list of devices from Withings account.
        """
        headers = await self._get_headers()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{WITHINGS_API_BASE}/v2/user",
                headers=headers,
                data={"action": "getdevice"},
            )
            
            if response.status_code != 200:
                raise SyncError(f"Failed to fetch devices: {response.text}")
            
            data = response.json()
            
            if data.get("status") != 0:
                raise SyncError(f"Withings error: {data.get('error')}")
            
            devices = []
            for device in data.get("body", {}).get("devices", []):
                device_id = device.get("deviceid")
                type_id = device.get("type")
                model_name = WITHINGS_DEVICE_MODELS.get(type_id, f"Unknown ({type_id})")
                
                devices.append(DeviceInfo(
                    device_id=str(device_id),
                    device_type=device.get("type_s", "unknown"),
                    device_name=model_name,
                    device_model=device.get("model", model_name),
                    last_seen_at=datetime.fromtimestamp(device.get("last_session_date", 0)) if device.get("last_session_date") else None,
                    extra_data={
                        "battery": device.get("battery"),
                        "hash_deviceid": device.get("hash_deviceid"),
                    },
                ))
            
            return devices
    
    async def sync_data(
        self,
        since: Optional[datetime] = None,
        device_ids: Optional[List[str]] = None
    ) -> SyncResult:
        """
        Sync measurements from Withings.
        
        Args:
            since: Only fetch data after this time (defaults to 30 days)
            device_ids: Optional list of device IDs to filter
            
        Returns:
            SyncResult with readings
        """
        headers = await self._get_headers()
        readings: List[VitalReading] = []
        devices_found: List[DeviceInfo] = []
        
        # Default to last 30 days if no since date
        if since is None:
            since = datetime.utcnow() - timedelta(days=30)
        
        start_date = int(since.timestamp())
        end_date = int(datetime.utcnow().timestamp())
        
        try:
            async with httpx.AsyncClient() as client:
                # Fetch measurements
                response = await client.post(
                    f"{WITHINGS_API_BASE}/measure",
                    headers=headers,
                    data={
                        "action": "getmeas",
                        "startdate": start_date,
                        "enddate": end_date,
                        "category": 1,  # Real measurements only
                    },
                )
                
                if response.status_code != 200:
                    raise SyncError(f"Failed to fetch measurements: {response.text}")
                
                data = response.json()
                
                if data.get("status") != 0:
                    raise SyncError(f"Withings error: {data.get('error')}")
                
                # Parse measurement groups
                for grp in data.get("body", {}).get("measuregrps", []):
                    grp_id = grp.get("grpid")
                    timestamp = datetime.fromtimestamp(grp.get("date", 0))
                    device_id = str(grp.get("deviceid", ""))
                    
                    # Skip if filtering by device and this isn't in the list
                    if device_ids and device_id not in device_ids:
                        continue
                    
                    for measure in grp.get("measures", []):
                        type_id = measure.get("type")
                        
                        if type_id not in WITHINGS_MEASURE_TYPES:
                            continue
                        
                        vital_type, unit = WITHINGS_MEASURE_TYPES[type_id]
                        
                        # Withings stores values as value * 10^unit
                        raw_value = measure.get("value", 0)
                        unit_power = measure.get("unit", 0)
                        value = raw_value * (10 ** unit_power)
                        
                        # Convert Celsius to Fahrenheit if needed
                        if vital_type == VitalType.TEMPERATURE.value:
                            value = value * 9 / 5 + 32
                            unit = VitalUnit.FAHRENHEIT.value
                        
                        readings.append(VitalReading(
                            vital_type=vital_type,
                            value=round(value, 2),
                            unit=unit,
                            timestamp=timestamp,
                            vital_group=str(grp_id),
                            device_id=device_id,
                            external_id=f"withings_{grp_id}_{type_id}",
                            raw_data={
                                "grpid": grp_id,
                                "type": type_id,
                                "raw_value": raw_value,
                                "raw_unit": unit_power,
                            },
                        ))
                
                # Fetch devices too
                devices_found = await self.fetch_devices()
                
                return SyncResult(
                    success=True,
                    readings_count=len(readings),
                    readings=readings,
                    devices_found=devices_found,
                    sync_timestamp=datetime.utcnow(),
                )
                
        except Exception as e:
            return SyncResult(
                success=False,
                readings_count=0,
                readings=[],
                error_message=str(e),
                sync_timestamp=datetime.utcnow(),
            )
