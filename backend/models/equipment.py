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
from typing import Optional
from datetime import datetime, date
from pydantic import BaseModel, Field


# Pydantic models for equipment
class EquipmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=0)
    scheduled_replacement: bool = True
    last_changed: Optional[date] = None
    useful_days: Optional[int] = Field(None, gt=0)
    patient_id: Optional[int] = None


class EquipmentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    quantity: Optional[int] = Field(None, ge=0)
    scheduled_replacement: Optional[bool] = None
    last_changed: Optional[date] = None
    useful_days: Optional[int] = Field(None, gt=0)


class EquipmentResponse(BaseModel):
    id: int
    name: str
    quantity: int
    scheduled_replacement: bool
    last_changed: Optional[date]
    useful_days: Optional[int]
    next_change_due: Optional[date]
    days_until_due: Optional[int]
    is_overdue: bool = False
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class EquipmentChangeLog(BaseModel):
    changed_at: datetime = Field(...)


class EquipmentQuantityChange(BaseModel):
    amount: int = Field(default=1, ge=1)


class EquipmentChangeHistoryResponse(BaseModel):
    id: int
    equipment_id: int
    changed_at: date
    created_at: datetime
    
    class Config:
        from_attributes = True


class EquipmentCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None


class EquipmentCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None


class EquipmentCategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
