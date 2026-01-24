"""
Pydantic models for diagnosis API request/response validation
"""
from typing import Optional, List
from datetime import datetime, date
from pydantic import BaseModel, Field


# --- Diagnosis Schemas ---

class DiagnosisBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    icd10_code: Optional[str] = Field(None, max_length=20)
    icd10_description: Optional[str] = Field(None, max_length=500)
    diagnosis_type: str = Field(default='primary', pattern='^(primary|secondary|comorbidity|differential)$')
    category: Optional[str] = Field(None, max_length=100)
    severity: Optional[str] = Field(None, pattern='^(mild|moderate|severe|critical)$')
    status: str = Field(default='active', pattern='^(active|resolved|chronic|in_remission|ruled_out)$')
    onset_date: Optional[date] = None
    diagnosis_date: Optional[date] = None
    resolved_date: Optional[date] = None
    diagnosing_provider_id: Optional[int] = None
    managing_provider_id: Optional[int] = None
    notes: Optional[str] = None
    treatment_plan: Optional[str] = None
    is_primary_diagnosis: bool = False


class DiagnosisCreate(DiagnosisBase):
    patient_id: int


class DiagnosisUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    icd10_code: Optional[str] = Field(None, max_length=20)
    icd10_description: Optional[str] = Field(None, max_length=500)
    diagnosis_type: Optional[str] = Field(None, pattern='^(primary|secondary|comorbidity|differential)$')
    category: Optional[str] = Field(None, max_length=100)
    severity: Optional[str] = Field(None, pattern='^(mild|moderate|severe|critical)$')
    status: Optional[str] = Field(None, pattern='^(active|resolved|chronic|in_remission|ruled_out)$')
    onset_date: Optional[date] = None
    diagnosis_date: Optional[date] = None
    resolved_date: Optional[date] = None
    diagnosing_provider_id: Optional[int] = None
    managing_provider_id: Optional[int] = None
    notes: Optional[str] = None
    treatment_plan: Optional[str] = None
    is_primary_diagnosis: Optional[bool] = None
    active: Optional[bool] = None


class DiagnosisNoteBase(BaseModel):
    note_type: str = Field(default='follow_up', pattern='^(follow_up|status_change|treatment_update|provider_note)$')
    content: str = Field(..., min_length=1)
    provider_id: Optional[int] = None


class DiagnosisNoteCreate(DiagnosisNoteBase):
    diagnosis_id: int


class DiagnosisNoteResponse(DiagnosisNoteBase):
    id: int
    diagnosis_id: int
    created_at: datetime
    created_by: Optional[int] = None
    provider_name: Optional[str] = None
    created_by_name: Optional[str] = None
    
    class Config:
        from_attributes = True


class ProviderSummary(BaseModel):
    id: int
    name: str
    specialty: Optional[str] = None
    provider_type: str
    
    class Config:
        from_attributes = True


class DiagnosisResponse(DiagnosisBase):
    id: int
    patient_id: int
    active: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int] = None
    diagnosing_provider: Optional[ProviderSummary] = None
    managing_provider: Optional[ProviderSummary] = None
    follow_up_notes: List[DiagnosisNoteResponse] = []
    notes_count: int = 0
    
    class Config:
        from_attributes = True


class DiagnosisListResponse(BaseModel):
    id: int
    patient_id: int
    name: str
    icd10_code: Optional[str] = None
    diagnosis_type: str
    category: Optional[str] = None
    severity: Optional[str] = None
    status: str
    diagnosis_date: Optional[date] = None
    is_primary_diagnosis: bool
    active: bool
    diagnosing_provider_name: Optional[str] = None
    managing_provider_name: Optional[str] = None
    notes_count: int = 0
    
    class Config:
        from_attributes = True


# Category options for frontend dropdown
DIAGNOSIS_CATEGORIES = [
    'cardiovascular',
    'respiratory',
    'neurological',
    'gastrointestinal',
    'musculoskeletal',
    'endocrine',
    'hematological',
    'immunological',
    'psychiatric',
    'dermatological',
    'renal',
    'infectious',
    'oncological',
    'genetic',
    'developmental',
    'other'
]
