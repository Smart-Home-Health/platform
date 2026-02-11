from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from schemas.patient import Patient
from typing import Optional, List
from datetime import datetime
from crud.settings import get_setting, save_setting


def get_patient(db: Session, patient_id: int) -> Optional[Patient]:
    """Get patient by ID"""
    return db.query(Patient).filter(Patient.id == patient_id).first()


def get_patient_by_mrn(db: Session, medical_record_number: str) -> Optional[Patient]:
    """Get patient by medical record number"""
    return db.query(Patient).filter(Patient.medical_record_number == medical_record_number).first()


def get_patients(db: Session, active_only: bool = True, skip: int = 0, limit: int = 100) -> List[Patient]:
    """Get list of patients"""
    query = db.query(Patient)
    if active_only:
        query = query.filter(Patient.is_active == True)
    return query.offset(skip).limit(limit).all()


def get_active_patient(db: Session) -> Optional[Patient]:
    """Get the currently active patient for single-patient workflows"""
    return db.query(Patient).filter(Patient.is_active == True).first()


def create_patient(db: Session, patient_data: dict) -> Patient:
    """Create a new patient"""
    db_patient = Patient(
        first_name=patient_data["first_name"],
        last_name=patient_data["last_name"],
        date_of_birth=patient_data.get("date_of_birth"),
        medical_record_number=patient_data.get("medical_record_number"),
        is_active=patient_data.get("is_active", True),
        notes=patient_data.get("notes"),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient


def update_patient(db: Session, patient_id: int, patient_data: dict) -> Optional[Patient]:
    """Update patient information"""
    db_patient = get_patient(db, patient_id)
    if not db_patient:
        return None
    
    for key, value in patient_data.items():
        if hasattr(db_patient, key):
            setattr(db_patient, key, value)
    
    db_patient.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_patient)
    return db_patient


def deactivate_patient(db: Session, patient_id: int) -> Optional[Patient]:
    """Deactivate a patient (soft delete)"""
    return update_patient(db, patient_id, {"is_active": False})


def activate_patient(db: Session, patient_id: int) -> Optional[Patient]:
    """Activate a patient"""
    return update_patient(db, patient_id, {"is_active": True})


def validate_patient_access(db: Session, patient_id: int) -> bool:
    """Validate that patient exists and is accessible"""
    patient = get_patient(db, patient_id)
    return patient is not None and patient.is_active


def create_default_patient(db: Session) -> Optional[Patient]:
    """Get the default patient - no longer auto-creates Patient1.
    Default patient is now created during first-run setup with the user's name.
    Returns existing active patient or None if no patient exists yet.
    """
    return get_active_patient(db)


def get_or_create_default_patient(db: Session) -> Optional[Patient]:
    """Get active patient. No longer auto-creates a default.
    Default patient is created during first-run setup.
    Returns None if no patient exists (e.g., before first-run completes).
    """
    return get_active_patient(db)


def get_current_patient(db: Session) -> Optional[Patient]:
    """Get the currently selected patient for dashboard tracking"""
    # Get current patient ID from settings
    current_id = get_setting(db, "current_patient_id")
    
    if current_id is not None:
        try:
            patient = get_patient(db, int(current_id))
            if patient and patient.is_active:
                return patient
        except (ValueError, TypeError):
            pass  # Invalid patient ID in settings
    
    # Fallback: get the first active patient (ordered by ID)
    fallback_patient = db.query(Patient).filter(Patient.is_active == True).order_by(Patient.id).first()
    
    # If we found a fallback and it's different from what was in settings, update settings
    if fallback_patient and (current_id is None or str(fallback_patient.id) != str(current_id)):
        save_setting(db, "current_patient_id", fallback_patient.id, data_type="integer")
    
    return fallback_patient


def set_current_patient(db: Session, patient_id: int) -> bool:
    """Set the current patient for dashboard tracking"""
    # Validate patient exists and is active
    patient = get_patient(db, patient_id)
    if not patient or not patient.is_active:
        return False
    
    # Save the current patient ID in settings
    result = save_setting(
        db, 
        "current_patient_id", 
        patient_id,  # Pass as integer, save_setting will convert to string
        data_type="integer",
        description="ID of the currently selected patient for dashboard tracking"
    )
    
    return result
