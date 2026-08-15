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
Pydantic request/response models for /api/integrations/home_assistant.
"""
from typing import Optional

from pydantic import BaseModel, Field


class HAConfigUpdate(BaseModel):
    enabled: bool = False
    # "auto" prefers the Supervisor proxy when running as the HA add-on;
    # "external" forces the base_url + token path.
    mode: str = Field("auto", pattern="^(auto|external)$")
    base_url: Optional[str] = Field(None, max_length=255)
    # None = keep the currently saved token (so the masked value round-trips).
    token: Optional[str] = None


class HAMappingCreate(BaseModel):
    entity_id: str = Field(..., min_length=1, max_length=255)
    friendly_name: Optional[str] = Field(None, max_length=255)
    device_class: Optional[str] = Field(None, max_length=50)
    source_unit: Optional[str] = Field(None, max_length=50)
    target_kind: str = Field(..., pattern="^(vital|environment)$")
    patient_id: Optional[int] = None
    vital_type: Optional[str] = Field(None, max_length=50)
    vital_group: Optional[str] = Field(None, max_length=50)
    metric: Optional[str] = Field(None, max_length=50)
    scope: Optional[str] = Field(None, max_length=20)
    location: Optional[str] = Field(None, max_length=100)
    enabled: bool = True
    min_interval_seconds: int = Field(0, ge=0, le=86400)


class HAMappingUpdate(BaseModel):
    friendly_name: Optional[str] = Field(None, max_length=255)
    device_class: Optional[str] = Field(None, max_length=50)
    source_unit: Optional[str] = Field(None, max_length=50)
    target_kind: Optional[str] = Field(None, pattern="^(vital|environment)$")
    patient_id: Optional[int] = None
    vital_type: Optional[str] = Field(None, max_length=50)
    vital_group: Optional[str] = Field(None, max_length=50)
    metric: Optional[str] = Field(None, max_length=50)
    scope: Optional[str] = Field(None, max_length=20)
    location: Optional[str] = Field(None, max_length=100)
    enabled: Optional[bool] = None
    min_interval_seconds: Optional[int] = Field(None, ge=0, le=86400)
