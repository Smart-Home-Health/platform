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
    changed_at: date = Field(...)


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
