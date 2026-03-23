"""
Pydantic models for integration API request/response validation.
"""
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


class IntegrationInfoResponse(BaseModel):
    """Response for integration info from registry"""
    slug: str
    name: str
    description: str
    auth_type: str
    supported_vitals: List[str]
    config_schema: dict


class IntegrationDBResponse(BaseModel):
    """Response for database-stored integration"""
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    auth_type: str
    config_schema: Optional[dict] = None
    supported_vitals: Optional[List[str]] = None
    is_active: bool
    
    class Config:
        from_attributes = True


class PatientIntegrationCreate(BaseModel):
    """Request to create a patient integration"""
    integration_slug: str
    settings: dict = Field(default_factory=dict)


class PatientIntegrationResponse(BaseModel):
    """Response for patient integration"""
    id: int
    patient_id: int
    integration_id: int
    integration_slug: Optional[str] = None
    integration_name: Optional[str] = None
    is_enabled: bool
    settings: Optional[dict] = None
    last_sync_at: Optional[datetime] = None
    last_sync_status: Optional[str] = None
    last_sync_error: Optional[str] = None
    sync_count: int = 0
    created_at: datetime
    
    class Config:
        from_attributes = True


class IntegrationDeviceResponse(BaseModel):
    """Response for integration device"""
    id: int
    patient_integration_id: int
    device_id: str
    device_type: str
    device_name: Optional[str] = None
    device_model: Optional[str] = None
    is_enabled: bool = True
    last_seen_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class SyncResultResponse(BaseModel):
    """Response for sync operation result"""
    success: bool
    readings_count: int
    error_message: Optional[str] = None
    sync_timestamp: datetime
