# Smart Home Health Hub
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
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


# Pydantic models for providers moved from routes/providers.py
class ProviderBase(BaseModel):
    patient_id: int
    business_id: Optional[int] = None
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    title: Optional[str] = Field(None, max_length=50)
    specialty: Optional[str] = Field(None, max_length=100)
    provider_type: str = Field(..., min_length=1, max_length=50)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    fax: Optional[str] = Field(None, max_length=20)
    license_number: Optional[str] = Field(None, max_length=50)
    npi_number: Optional[str] = Field(None, max_length=20)
    department: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    is_primary: bool = False
    active: bool = True


class ProviderCreate(ProviderBase):
    pass


class ProviderUpdate(BaseModel):
    business_id: Optional[int] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    title: Optional[str] = Field(None, max_length=50)
    specialty: Optional[str] = Field(None, max_length=100)
    provider_type: Optional[str] = Field(None, min_length=1, max_length=50)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    fax: Optional[str] = Field(None, max_length=20)
    license_number: Optional[str] = Field(None, max_length=50)
    npi_number: Optional[str] = Field(None, max_length=20)
    department: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    is_primary: Optional[bool] = None
    active: Optional[bool] = None


class BusinessInfo(BaseModel):
    id: int
    name: str
    business_type: str
    phone: Optional[str] = None
    address_line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None

    class Config:
        from_attributes = True


class ProviderResponse(ProviderBase):
    id: int
    created_at: datetime
    updated_at: datetime
    business: Optional[BusinessInfo] = None

    class Config:
        from_attributes = True
