from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from db import get_db
from dependencies import require_read_access, get_current_account_id
from crud.patients import (
    get_patient, get_patients, create_patient, update_patient, 
    deactivate_patient, activate_patient, get_active_patient,
    create_default_patient, get_current_patient, set_current_patient,
    get_or_create_default_patient
)
from models.patients import (
    PatientBase,
    PatientCreate,
    PatientUpdate,
    PatientResponse,
)

router = APIRouter(prefix="/api/patients", tags=["patients"])

@router.get("", response_model=List[PatientResponse])
def list_patients(
    active_only: bool = Query(True, description="Filter to active patients only"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Get list of patients. Allowed in restricted mode so user can select a patient to perform care."""
    patients = get_patients(db, active_only=active_only, skip=skip, limit=limit)
    return patients

@router.get("/active", response_model=Optional[PatientResponse])
def get_current_active_patient(db: Session = Depends(get_db)):
    """Get the currently active patient. Allowed in restricted mode for care flow."""
    patient = get_active_patient(db)
    return patient

@router.get("/current", response_model=PatientResponse)
def get_current_or_default_patient(db: Session = Depends(get_db)):
    """Get current active patient or create default if none exists"""
    patient = get_current_patient(db)
    if not patient:
        raise HTTPException(status_code=404, detail="No patients found")
    return patient

@router.post("", response_model=PatientResponse)
def create_new_patient(
    patient: PatientCreate,
    db: Session = Depends(get_db),
    account_id: int = Depends(get_current_account_id),
):
    """Create a new patient"""
    # Check if MRN already exists
    if patient.medical_record_number:
        from crud.patients import get_patient_by_mrn
        existing = get_patient_by_mrn(db, patient.medical_record_number)
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Medical record number already exists"
            )

    patient_data = patient.model_dump()
    patient_data["account_id"] = account_id
    return create_patient(db, patient_data)

@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient_by_id(patient_id: int, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get patient by ID"""
    patient = get_patient(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient

@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient_by_id(
    patient_id: int, 
    patient_update: PatientUpdate, 
    db: Session = Depends(get_db)
):
    """Update patient information"""
    # Check if patient exists
    existing_patient = get_patient(db, patient_id)
    if not existing_patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check if MRN already exists for another patient
    if patient_update.medical_record_number:
        from crud.patients import get_patient_by_mrn
        existing_mrn = get_patient_by_mrn(db, patient_update.medical_record_number)
        if existing_mrn and existing_mrn.id != patient_id:
            raise HTTPException(
                status_code=400, 
                detail="Medical record number already exists"
            )
    
    # Filter out None values
    update_data = {k: v for k, v in patient_update.model_dump().items() if v is not None}
    
    updated_patient = update_patient(db, patient_id, update_data)
    if not updated_patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    return updated_patient

@router.delete("/{patient_id}")
def deactivate_patient_by_id(patient_id: int, db: Session = Depends(get_db)):
    """Deactivate a patient (soft delete)"""
    patient = deactivate_patient(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    return {"message": "Patient deactivated successfully"}

@router.post("/{patient_id}/activate")
def activate_patient_by_id(patient_id: int, db: Session = Depends(get_db)):
    """Activate a patient"""
    patient = activate_patient(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    return {"message": "Patient activated successfully"}

@router.post("/{patient_id}/set-current")
def set_current_patient_by_id(patient_id: int, db: Session = Depends(get_db)):
    """Set a patient as the current patient for dashboard tracking"""
    success = set_current_patient(db, patient_id)
    if not success:
        raise HTTPException(
            status_code=404, 
            detail="Patient not found or not active"
        )
    
    return {"message": "Current patient updated successfully"}

@router.post("/initialize", response_model=PatientResponse)
def initialize_default_patient(db: Session = Depends(get_db)):
    """Get default patient - use first-run setup to create patients.
    This endpoint is deprecated. Patients are now created during first-run setup.
    """
    patient = get_active_patient(db)
    if not patient:
        raise HTTPException(
            status_code=404, 
            detail="No patients exist. Complete first-run setup to create a patient."
        )
    
    return patient
