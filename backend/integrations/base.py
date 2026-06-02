"""
Base classes and interfaces for smart device integrations.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum


class IntegrationError(Exception):
    """Base exception for integration errors"""
    pass


class AuthenticationError(IntegrationError):
    """Raised when authentication fails or tokens are invalid"""
    pass


class SyncError(IntegrationError):
    """Raised when data synchronization fails"""
    pass


class VitalType(str, Enum):
    """Standardized vital type identifiers"""
    HEART_RATE = "heart_rate"
    SPO2 = "spo2"
    BLOOD_PRESSURE_SYSTOLIC = "blood_pressure_systolic"
    BLOOD_PRESSURE_DIASTOLIC = "blood_pressure_diastolic"
    BLOOD_PRESSURE_MAP = "blood_pressure_map"
    TEMPERATURE = "temperature"
    WEIGHT = "weight"
    BODY_FAT = "body_fat"
    MUSCLE_MASS = "muscle_mass"
    BONE_MASS = "bone_mass"
    WATER_PERCENTAGE = "water_percentage"
    BMI = "bmi"
    BLOOD_GLUCOSE = "blood_glucose"
    STEPS = "steps"
    SLEEP_DURATION = "sleep_duration"
    SLEEP_DEEP = "sleep_deep"
    SLEEP_LIGHT = "sleep_light"
    SLEEP_REM = "sleep_rem"
    SLEEP_AWAKE = "sleep_awake"
    RESPIRATORY_RATE = "respiratory_rate"
    PERFUSION_INDEX = "perfusion_index"


class VitalUnit(str, Enum):
    """Standardized measurement units"""
    BPM = "bpm"
    PERCENT = "%"
    MMHG = "mmHg"
    FAHRENHEIT = "°F"
    CELSIUS = "°C"
    KG = "kg"
    LBS = "lbs"
    MG_DL = "mg/dL"
    MMOL_L = "mmol/L"
    STEPS = "steps"
    MINUTES = "min"
    HOURS = "hrs"
    BREATHS_PER_MIN = "breaths/min"


@dataclass
class VitalReading:
    """
    Standardized vital reading output from integrations.
    
    All integrations must convert their vendor-specific data into this format.
    This ensures consistent storage and processing regardless of source.
    """
    vital_type: str  # Use VitalType enum values
    value: float
    unit: str  # Use VitalUnit enum values
    timestamp: datetime
    
    # Optional fields
    vital_group: Optional[str] = None  # For grouping related readings (e.g., BP systolic/diastolic)
    device_id: Optional[str] = None  # Vendor's device identifier
    external_id: Optional[str] = None  # Vendor's measurement ID for deduplication
    raw_data: Optional[Dict[str, Any]] = None  # Original payload for debugging
    notes: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database insertion"""
        return {
            'vital_type': self.vital_type,
            'value': self.value,
            'unit': self.unit,
            'timestamp': self.timestamp,
            'vital_group': self.vital_group,
            'device_id': self.device_id,
            'external_id': self.external_id,
            'raw_data': self.raw_data,
            'notes': self.notes,
        }


@dataclass
class DeviceInfo:
    """Information about a device from an integration"""
    device_id: str
    device_type: str
    device_name: Optional[str] = None
    device_model: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    extra_data: Optional[Dict[str, Any]] = None


@dataclass 
class SyncResult:
    """Result of a sync operation"""
    success: bool
    readings_count: int = 0
    readings: List[VitalReading] = field(default_factory=list)
    devices_found: List[DeviceInfo] = field(default_factory=list)
    error_message: Optional[str] = None
    sync_timestamp: datetime = field(default_factory=datetime.utcnow)


class BaseIntegration(ABC):
    """
    Abstract base class for all smart device integrations.
    
    Each vendor integration (Withings, iHealth, etc.) must inherit from this
    class and implement all abstract methods. This ensures a consistent
    interface for authentication, device discovery, and data synchronization.
    
    Usage:
        class WithingsIntegration(BaseIntegration):
            slug = "withings"
            name = "Withings"
            auth_type = "oauth2"
            
            async def authenticate(self, credentials):
                # OAuth2 flow
                ...
    """
    
    # Class attributes - override in subclasses
    slug: str = ""  # URL-safe identifier
    name: str = ""  # Display name
    description: str = ""
    auth_type: str = "oauth2"  # oauth2, api_key, local, none
    supported_vitals: List[str] = []  # List of VitalType values this integration provides
    # Subset of config_schema property keys that are credentials (sent to
    # authenticate()) rather than user-editable settings. The UI uses this to
    # split the add-integration form, and the /connect endpoint reads it to
    # know which payload keys to hand to authenticate().
    auth_fields: List[str] = []
    # Set True if the integration accepts file/archive uploads (e.g. vent log exports).
    # When True the integration must implement import_file().
    supports_import: bool = False
    
    def __init__(self, patient_integration=None):
        """
        Initialize integration with optional patient-specific configuration.
        
        Args:
            patient_integration: PatientIntegration model instance with credentials
        """
        self.patient_integration = patient_integration
        self.credentials = patient_integration.credentials if patient_integration else None
        self.settings = patient_integration.settings if patient_integration else {}
    
    @classmethod
    @abstractmethod
    def get_config_schema(cls) -> Dict[str, Any]:
        """
        Return JSON Schema for the configuration form.
        
        This schema is used by the frontend to dynamically generate
        the setup form for this integration.
        
        Returns:
            JSON Schema dict describing required configuration fields
        """
        pass
    
    @classmethod
    def get_oauth_url(cls, state: str, redirect_uri: str) -> Optional[str]:
        """
        Generate OAuth authorization URL for OAuth2 integrations.
        
        Args:
            state: CSRF protection state parameter
            redirect_uri: Callback URL after authorization
            
        Returns:
            Authorization URL or None if not OAuth2
        """
        return None
    
    @abstractmethod
    async def authenticate(self, auth_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Authenticate with the integration service.
        
        For OAuth2: Exchange authorization code for tokens
        For API Key: Validate the API key
        For Local: Verify device connectivity
        
        Args:
            auth_data: Authentication data (code for OAuth2, api_key for API key, etc.)
            
        Returns:
            Credentials dict to store (tokens, expiry, etc.)
            
        Raises:
            AuthenticationError: If authentication fails
        """
        pass
    
    @abstractmethod
    async def refresh_credentials(self) -> Dict[str, Any]:
        """
        Refresh expired credentials (e.g., OAuth2 token refresh).
        
        Returns:
            Updated credentials dict
            
        Raises:
            AuthenticationError: If refresh fails
        """
        pass
    
    @abstractmethod
    async def fetch_devices(self) -> List[DeviceInfo]:
        """
        Discover devices associated with this integration.
        
        Returns:
            List of DeviceInfo objects for discovered devices
        """
        pass
    
    @abstractmethod
    async def sync_data(
        self, 
        since: Optional[datetime] = None,
        device_ids: Optional[List[str]] = None
    ) -> SyncResult:
        """
        Synchronize data from the integration.
        
        Args:
            since: Only fetch data newer than this timestamp
            device_ids: Optional list of specific device IDs to sync
            
        Returns:
            SyncResult with readings and status
        """
        pass
    
    async def test_connection(self) -> bool:
        """
        Test if the integration connection is working.

        Returns:
            True if connection is healthy
        """
        try:
            await self.fetch_devices()
            return True
        except Exception:
            return False

    def import_file(self, *, import_id: str, archive_path: str, extracted_dir: str,
                    db=None, patient_integration=None, vent_import=None) -> Dict[str, Any]:
        """
        Parse an uploaded archive for this integration. Runs in a background
        thread; concrete integrations override this when supports_import=True.

        Args (keyword-only):
            import_id: UUID assigned by the upload route.
            archive_path: Absolute path to the persisted tar/tar.gz on disk.
            extracted_dir: Absolute path of the already-extracted directory.
            db: SQLAlchemy Session the worker owns (commit when needed).
            patient_integration: The active PatientIntegration row. Read
                `settings` for vendor config; writes are persisted by the
                parser when applicable (e.g. clock calibration anchoring).
            vent_import: The VentImport row being parsed. Mutate
                `parser_summary` to surface progress; status transitions are
                handled by the caller.

        Returns:
            Dict stored in `vent_imports.parser_summary` (counts, file
            ranges, etc.).
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} does not support file imports"
        )
