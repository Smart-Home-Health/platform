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
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


# Pydantic models for patients moved from routes/patients.py
class PatientBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., max_length=100)
    date_of_birth: Optional[datetime] = None
    medical_record_number: Optional[str] = Field(None, max_length=50)
    is_active: bool = True
    notes: Optional[str] = None
    # Room the patient is cared for in (HA area / environment location name).
    care_area: Optional[str] = Field(None, max_length=100)
    # HA login this record represents (32-hex HA user id). Set when creating
    # a patient from the HA user directory; one patient per HA login.
    ha_user_id: Optional[str] = Field(None, min_length=32, max_length=32)


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    date_of_birth: Optional[datetime] = None
    medical_record_number: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    care_area: Optional[str] = Field(None, max_length=100)
    ha_user_id: Optional[str] = Field(None, min_length=32, max_length=32)


class PatientResponse(PatientBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
