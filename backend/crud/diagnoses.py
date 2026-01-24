"""
Diagnosis CRUD operations
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from schemas.diagnosis import Diagnosis, DiagnosisNote
from schemas.provider import Provider

logger = logging.getLogger('crud')


# --- Diagnosis CRUD ---

def get_diagnosis(db: Session, diagnosis_id: int) -> Optional[Diagnosis]:
    """Get a diagnosis by ID with all relationships loaded."""
    return db.query(Diagnosis).options(
        joinedload(Diagnosis.diagnosing_provider),
        joinedload(Diagnosis.managing_provider),
        joinedload(Diagnosis.follow_up_notes)
    ).filter(Diagnosis.id == diagnosis_id).first()


def get_diagnoses_by_patient(
    db: Session, 
    patient_id: int, 
    active_only: bool = True,
    status: Optional[str] = None,
    diagnosis_type: Optional[str] = None,
    category: Optional[str] = None
) -> List[Diagnosis]:
    """Get all diagnoses for a specific patient with optional filters."""
    query = db.query(Diagnosis).options(
        joinedload(Diagnosis.diagnosing_provider),
        joinedload(Diagnosis.managing_provider)
    ).filter(Diagnosis.patient_id == patient_id)
    
    if active_only:
        query = query.filter(Diagnosis.active == True)
    
    if status:
        query = query.filter(Diagnosis.status == status)
    
    if diagnosis_type:
        query = query.filter(Diagnosis.diagnosis_type == diagnosis_type)
    
    if category:
        query = query.filter(Diagnosis.category == category)
    
    return query.order_by(
        Diagnosis.is_primary_diagnosis.desc(),
        Diagnosis.diagnosis_type,
        Diagnosis.name
    ).all()


def create_diagnosis(db: Session, diagnosis_data: dict, user_id: Optional[int] = None) -> Diagnosis:
    """Create a new diagnosis."""
    now = datetime.now(timezone.utc)
    
    # If this is being set as primary, unset other primary diagnoses for same patient
    if diagnosis_data.get('is_primary_diagnosis', False):
        db.query(Diagnosis).filter(
            and_(
                Diagnosis.patient_id == diagnosis_data['patient_id'],
                Diagnosis.is_primary_diagnosis == True
            )
        ).update({'is_primary_diagnosis': False, 'updated_at': now})
    
    diagnosis = Diagnosis(
        **diagnosis_data,
        active=True,
        created_at=now,
        updated_at=now,
        created_by=user_id
    )
    db.add(diagnosis)
    db.commit()
    db.refresh(diagnosis)
    logger.info(f"Diagnosis created: {diagnosis.name} for patient {diagnosis.patient_id}")
    return diagnosis


def update_diagnosis(db: Session, diagnosis_id: int, diagnosis_data: dict) -> Optional[Diagnosis]:
    """Update an existing diagnosis."""
    diagnosis = get_diagnosis(db, diagnosis_id)
    if not diagnosis:
        return None
    
    now = datetime.now(timezone.utc)
    
    # If this is being set as primary, unset other primary diagnoses for same patient
    if diagnosis_data.get('is_primary_diagnosis', False) and not diagnosis.is_primary_diagnosis:
        db.query(Diagnosis).filter(
            and_(
                Diagnosis.patient_id == diagnosis.patient_id,
                Diagnosis.is_primary_diagnosis == True,
                Diagnosis.id != diagnosis_id
            )
        ).update({'is_primary_diagnosis': False, 'updated_at': now})
    
    for key, value in diagnosis_data.items():
        if hasattr(diagnosis, key) and value is not None:
            setattr(diagnosis, key, value)
    
    diagnosis.updated_at = now
    db.commit()
    db.refresh(diagnosis)
    logger.info(f"Diagnosis updated: {diagnosis.name}")
    return diagnosis


def delete_diagnosis(db: Session, diagnosis_id: int) -> bool:
    """Soft delete a diagnosis by setting active to False."""
    diagnosis = get_diagnosis(db, diagnosis_id)
    if not diagnosis:
        return False
    
    diagnosis.active = False
    diagnosis.updated_at = datetime.now(timezone.utc)
    db.commit()
    logger.info(f"Diagnosis deactivated: {diagnosis.name}")
    return True


def activate_diagnosis(db: Session, diagnosis_id: int) -> bool:
    """Reactivate a diagnosis."""
    diagnosis = get_diagnosis(db, diagnosis_id)
    if not diagnosis:
        return False
    
    diagnosis.active = True
    diagnosis.updated_at = datetime.now(timezone.utc)
    db.commit()
    logger.info(f"Diagnosis reactivated: {diagnosis.name}")
    return True


def set_primary_diagnosis(db: Session, diagnosis_id: int) -> Optional[Diagnosis]:
    """Set a diagnosis as the primary diagnosis for the patient."""
    diagnosis = get_diagnosis(db, diagnosis_id)
    if not diagnosis:
        return None
    
    now = datetime.now(timezone.utc)
    
    # Unset other primary diagnoses for same patient
    db.query(Diagnosis).filter(
        and_(
            Diagnosis.patient_id == diagnosis.patient_id,
            Diagnosis.is_primary_diagnosis == True,
            Diagnosis.id != diagnosis_id
        )
    ).update({'is_primary_diagnosis': False, 'updated_at': now})
    
    diagnosis.is_primary_diagnosis = True
    diagnosis.updated_at = now
    db.commit()
    db.refresh(diagnosis)
    logger.info(f"Diagnosis set as primary: {diagnosis.name}")
    return diagnosis


def get_diagnosis_types() -> List[str]:
    """Get available diagnosis types."""
    return ['primary', 'secondary', 'comorbidity', 'differential']


def get_diagnosis_statuses() -> List[str]:
    """Get available diagnosis statuses."""
    return ['active', 'resolved', 'chronic', 'in_remission', 'ruled_out']


def get_diagnosis_categories() -> List[str]:
    """Get available diagnosis categories."""
    return [
        'cardiovascular', 'respiratory', 'neurological', 'gastrointestinal',
        'musculoskeletal', 'endocrine', 'hematological', 'immunological',
        'psychiatric', 'dermatological', 'renal', 'infectious', 'oncological',
        'genetic', 'developmental', 'other'
    ]


def get_severity_levels() -> List[str]:
    """Get available severity levels."""
    return ['mild', 'moderate', 'severe', 'critical']


# --- Diagnosis Note CRUD ---

def get_diagnosis_notes(db: Session, diagnosis_id: int) -> List[DiagnosisNote]:
    """Get all notes for a diagnosis."""
    return db.query(DiagnosisNote).options(
        joinedload(DiagnosisNote.provider),
        joinedload(DiagnosisNote.created_by_user)
    ).filter(
        DiagnosisNote.diagnosis_id == diagnosis_id
    ).order_by(DiagnosisNote.created_at.desc()).all()


def create_diagnosis_note(db: Session, note_data: dict, user_id: Optional[int] = None) -> DiagnosisNote:
    """Create a new diagnosis note."""
    now = datetime.now(timezone.utc)
    
    note = DiagnosisNote(
        **note_data,
        created_at=now,
        created_by=user_id
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    logger.info(f"Diagnosis note created for diagnosis {note.diagnosis_id}")
    return note


def delete_diagnosis_note(db: Session, note_id: int) -> bool:
    """Delete a diagnosis note permanently."""
    note = db.query(DiagnosisNote).filter(DiagnosisNote.id == note_id).first()
    if not note:
        return False
    
    db.delete(note)
    db.commit()
    logger.info(f"Diagnosis note deleted: {note_id}")
    return True


def get_note_types() -> List[str]:
    """Get available note types."""
    return ['follow_up', 'status_change', 'treatment_update', 'provider_note']


def format_diagnosis_for_response(diagnosis: Diagnosis) -> dict:
    """Format a diagnosis object for API response."""
    diagnosing_provider = None
    if diagnosis.diagnosing_provider:
        diagnosing_provider = {
            'id': diagnosis.diagnosing_provider.id,
            'name': f"{diagnosis.diagnosing_provider.title or ''} {diagnosis.diagnosing_provider.first_name} {diagnosis.diagnosing_provider.last_name}".strip(),
            'specialty': diagnosis.diagnosing_provider.specialty,
            'provider_type': diagnosis.diagnosing_provider.provider_type
        }
    
    managing_provider = None
    if diagnosis.managing_provider:
        managing_provider = {
            'id': diagnosis.managing_provider.id,
            'name': f"{diagnosis.managing_provider.title or ''} {diagnosis.managing_provider.first_name} {diagnosis.managing_provider.last_name}".strip(),
            'specialty': diagnosis.managing_provider.specialty,
            'provider_type': diagnosis.managing_provider.provider_type
        }
    
    notes = []
    for note in diagnosis.follow_up_notes:
        provider_name = None
        if note.provider:
            provider_name = f"{note.provider.title or ''} {note.provider.first_name} {note.provider.last_name}".strip()
        
        created_by_name = None
        if note.created_by_user:
            created_by_name = note.created_by_user.username
        
        notes.append({
            'id': note.id,
            'diagnosis_id': note.diagnosis_id,
            'note_type': note.note_type,
            'content': note.content,
            'provider_id': note.provider_id,
            'provider_name': provider_name,
            'created_at': note.created_at.isoformat() if note.created_at else None,
            'created_by': note.created_by,
            'created_by_name': created_by_name
        })
    
    return {
        'id': diagnosis.id,
        'patient_id': diagnosis.patient_id,
        'name': diagnosis.name,
        'icd10_code': diagnosis.icd10_code,
        'icd10_description': diagnosis.icd10_description,
        'diagnosis_type': diagnosis.diagnosis_type,
        'category': diagnosis.category,
        'severity': diagnosis.severity,
        'status': diagnosis.status,
        'onset_date': diagnosis.onset_date.isoformat() if diagnosis.onset_date else None,
        'diagnosis_date': diagnosis.diagnosis_date.isoformat() if diagnosis.diagnosis_date else None,
        'resolved_date': diagnosis.resolved_date.isoformat() if diagnosis.resolved_date else None,
        'diagnosing_provider_id': diagnosis.diagnosing_provider_id,
        'managing_provider_id': diagnosis.managing_provider_id,
        'diagnosing_provider': diagnosing_provider,
        'managing_provider': managing_provider,
        'notes': diagnosis.notes,
        'treatment_plan': diagnosis.treatment_plan,
        'is_primary_diagnosis': diagnosis.is_primary_diagnosis,
        'active': diagnosis.active,
        'created_at': diagnosis.created_at.isoformat() if diagnosis.created_at else None,
        'updated_at': diagnosis.updated_at.isoformat() if diagnosis.updated_at else None,
        'created_by': diagnosis.created_by,
        'follow_up_notes': notes,
        'notes_count': len(notes)
    }


def format_diagnosis_for_list(diagnosis: Diagnosis) -> dict:
    """Format a diagnosis object for list response (lighter weight)."""
    diagnosing_provider_name = None
    if diagnosis.diagnosing_provider:
        diagnosing_provider_name = f"{diagnosis.diagnosing_provider.title or ''} {diagnosis.diagnosing_provider.first_name} {diagnosis.diagnosing_provider.last_name}".strip()
    
    managing_provider_name = None
    if diagnosis.managing_provider:
        managing_provider_name = f"{diagnosis.managing_provider.title or ''} {diagnosis.managing_provider.first_name} {diagnosis.managing_provider.last_name}".strip()
    
    return {
        'id': diagnosis.id,
        'patient_id': diagnosis.patient_id,
        'name': diagnosis.name,
        'icd10_code': diagnosis.icd10_code,
        'diagnosis_type': diagnosis.diagnosis_type,
        'category': diagnosis.category,
        'severity': diagnosis.severity,
        'status': diagnosis.status,
        'diagnosis_date': diagnosis.diagnosis_date.isoformat() if diagnosis.diagnosis_date else None,
        'is_primary_diagnosis': diagnosis.is_primary_diagnosis,
        'active': diagnosis.active,
        'diagnosing_provider_name': diagnosing_provider_name,
        'managing_provider_name': managing_provider_name,
        'notes_count': len(diagnosis.follow_up_notes) if hasattr(diagnosis, 'follow_up_notes') else 0
    }
