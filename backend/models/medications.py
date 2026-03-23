from typing import Optional
from datetime import datetime, date
from pydantic import BaseModel, Field


# Pydantic models for medications
class MedicationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    concentration: str = Field(..., min_length=1, max_length=100)
    quantity: float = Field(..., gt=0)
    quantity_unit: str = Field(..., min_length=1, max_length=50)
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
    quantity: float = Field(..., gt=0)
    quantity_unit: str = Field(..., min_length=1, max_length=50)
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
    quantity: Optional[float] = Field(None, gt=0)
    quantity_unit: Optional[str] = Field(None, min_length=1, max_length=50)
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
