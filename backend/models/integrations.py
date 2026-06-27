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
    auth_fields: List[str] = []
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
    auth_type: Optional[str] = None
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
