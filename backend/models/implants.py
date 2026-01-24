"""
Implant Pydantic models for API validation
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


# ============== Implant Note Schemas ==============

class ImplantNoteBase(BaseModel):
    note_type: str = 'follow_up'  # follow_up, change, complication, maintenance, status_change, provider_note
    content: str
    was_changed: bool = False
    old_serial_number: Optional[str] = None
    new_serial_number: Optional[str] = None
    provider_id: Optional[int] = None


class ImplantNoteCreate(ImplantNoteBase):
    pass


class ImplantNoteResponse(ImplantNoteBase):
    id: int
    implant_id: int
    created_at: datetime
    created_by: Optional[int] = None
    provider_name: Optional[str] = None
    created_by_name: Optional[str] = None

    class Config:
        from_attributes = True


# ============== Implant Schemas ==============

class ImplantBase(BaseModel):
    name: str
    description: Optional[str] = None
    
    # Classification
    implant_type: str = 'medical'  # medical, cosmetic, body_modification, piercing, other
    category: Optional[str] = None
    subcategory: Optional[str] = None
    
    # Location
    body_location: str
    body_side: Optional[str] = None  # left, right, bilateral, midline, n/a
    
    # Device/Product details
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    size: Optional[str] = None
    material: Optional[str] = None
    
    # Dates
    implant_date: Optional[date] = None
    last_change_date: Optional[date] = None
    next_change_date: Optional[date] = None
    removal_date: Optional[date] = None
    expiration_date: Optional[date] = None
    
    # Providers
    implanting_provider_id: Optional[int] = None
    managing_provider_id: Optional[int] = None
    
    # Facility
    facility_name: Optional[str] = None
    facility_location: Optional[str] = None
    
    # Status
    status: str = 'active'  # active, removed, replaced, failed, pending
    
    # Notes
    notes: Optional[str] = None
    care_instructions: Optional[str] = None
    complications: Optional[str] = None
    
    # MRI safety
    mri_safe: Optional[str] = None  # safe, conditional, unsafe, unknown
    mri_notes: Optional[str] = None
    
    # Flags
    is_life_sustaining: bool = False
    requires_regular_change: bool = False
    change_frequency_days: Optional[int] = None
    
    active: bool = True


class ImplantCreate(ImplantBase):
    patient_id: int


class ImplantUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    implant_type: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    body_location: Optional[str] = None
    body_side: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    size: Optional[str] = None
    material: Optional[str] = None
    implant_date: Optional[date] = None
    last_change_date: Optional[date] = None
    next_change_date: Optional[date] = None
    removal_date: Optional[date] = None
    expiration_date: Optional[date] = None
    implanting_provider_id: Optional[int] = None
    managing_provider_id: Optional[int] = None
    facility_name: Optional[str] = None
    facility_location: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    care_instructions: Optional[str] = None
    complications: Optional[str] = None
    mri_safe: Optional[str] = None
    mri_notes: Optional[str] = None
    is_life_sustaining: Optional[bool] = None
    requires_regular_change: Optional[bool] = None
    change_frequency_days: Optional[int] = None
    active: Optional[bool] = None


class ImplantResponse(ImplantBase):
    id: int
    patient_id: int
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int] = None
    
    # Provider names for display
    implanting_provider_name: Optional[str] = None
    managing_provider_name: Optional[str] = None
    created_by_name: Optional[str] = None
    
    # Notes count
    notes_count: int = 0
    
    # Follow-up notes (optional, included in detail view)
    follow_up_notes: Optional[List[ImplantNoteResponse]] = None

    class Config:
        from_attributes = True


# ============== Lookup/Reference Schemas ==============

class ImplantTypeOption(BaseModel):
    value: str
    label: str
    description: str


class ImplantCategoryOption(BaseModel):
    value: str
    label: str
    implant_type: str  # Which type this category belongs to


class ImplantStatusOption(BaseModel):
    value: str
    label: str


class MRISafetyOption(BaseModel):
    value: str
    label: str
    description: str
