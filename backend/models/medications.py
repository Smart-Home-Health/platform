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
from datetime import datetime, date
from pydantic import BaseModel, Field


# Pydantic models for medications
class MedicationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    concentration: str = Field(..., min_length=1, max_length=100)
    # ge=0: 0 on hand is legitimate (e.g. recording a finished/depleted med, or
    # one whose stock is tracked elsewhere). Quantity is on-hand inventory, not a dose.
    quantity: float = Field(..., ge=0)
    quantity_unit: str = Field(..., min_length=1, max_length=50)
    low_stock_threshold: Optional[float] = Field(None, ge=0)  # None = no low-stock alerting
    instructions: str
    start_date: date
    end_date: Optional[date] = None
    as_needed: bool = False
    notes: Optional[str] = None
    patient_id: Optional[int] = None
    prescriber_id: Optional[int] = None
    pharmacy_id: Optional[int] = None


class MedicationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    concentration: str = Field(..., min_length=1, max_length=100)
    # ge=0: 0 on hand is legitimate (e.g. recording a finished/depleted med, or
    # one whose stock is tracked elsewhere). Quantity is on-hand inventory, not a dose.
    quantity: float = Field(..., ge=0)
    quantity_unit: str = Field(..., min_length=1, max_length=50)
    low_stock_threshold: Optional[float] = Field(None, ge=0)  # None = no low-stock alerting
    # 'quantity' = threshold is a raw on-hand amount; 'days' = days of supply
    # left, projected from the med's active schedules
    low_stock_threshold_type: str = Field('quantity', pattern='^(quantity|days)$')
    instructions: str
    start_date: date
    end_date: Optional[date] = None
    as_needed: bool = False
    notes: Optional[str] = None
    is_patient_specific: bool = False
    admin_patient_id: Optional[int] = None
    prescriber_id: Optional[int] = None
    pharmacy_id: Optional[int] = None


class MedicationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    concentration: Optional[str] = Field(None, min_length=1, max_length=100)
    # ge=0 (not gt=0): an existing medication legitimately reaches 0 on hand when
    # a course is finished. Editing it (e.g. marking inactive) must not be blocked
    # by the create-time "must have stock" rule — the edit form resends quantity.
    quantity: Optional[float] = Field(None, ge=0)
    quantity_unit: Optional[str] = Field(None, min_length=1, max_length=50)
    low_stock_threshold: Optional[float] = Field(None, ge=0)
    low_stock_threshold_type: Optional[str] = Field(None, pattern='^(quantity|days)$')
    instructions: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    as_needed: Optional[bool] = None
    notes: Optional[str] = None
    active: Optional[bool] = None
    patient_id: Optional[int] = None
    prescriber_id: Optional[int] = None
    pharmacy_id: Optional[int] = None


class MedicationResponse(BaseModel):
    id: int
    patient_id: Optional[int]
    name: str
    concentration: str
    quantity: float
    quantity_unit: str
    low_stock_threshold: Optional[float] = None
    instructions: str
    start_date: date
    end_date: Optional[date]
    as_needed: bool
    notes: Optional[str]
    active: bool
    prescriber_id: Optional[int]
    pharmacy_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    is_global: bool = False
    
    class Config:
        from_attributes = True


class MedicationScheduleCreate(BaseModel):
    cron_expression: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1, max_length=255)
    dose_amount: float = Field(..., gt=0)
    active: bool = True
    notes: Optional[str] = None
    patient_id: Optional[int] = None
    type: str = Field(default="med", pattern="^med$")


class MedicationScheduleUpdate(BaseModel):
    cron_expression: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = Field(None, min_length=1, max_length=255)
    dose_amount: Optional[float] = Field(None, gt=0)
    active: Optional[bool] = None
    notes: Optional[str] = None
    patient_id: Optional[int] = None


class MedicationScheduleResponse(BaseModel):
    id: int
    medication_id: int
    patient_id: Optional[int]
    cron_expression: str
    description: str
    dose_amount: float
    active: bool
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class MedicationAdminister(BaseModel):
    dose_amount: float = Field(..., ge=0)  # Allow 0 for skipped doses
    schedule_id: Optional[int] = None
    scheduled_time: Optional[datetime] = None
    notes: Optional[str] = None
    patient_id: Optional[int] = None  # When set, used for patient-specific meds instead of current_patient_id
    early_override: bool = False  # Set to True to bypass the >1h-early administration guard
    administered_at: Optional[datetime] = None  # Caller-supplied admin timestamp; defaults to now


class ProviderInfo(BaseModel):
    id: int
    name: str
    specialty: Optional[str]
    type: str


class PharmacyInfo(BaseModel):
    id: int
    name: str
    phone: Optional[str]
    address: Optional[str]
