"""
Diagnosis management routes
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from db import get_db
from models.diagnoses import (
    DiagnosisCreate,
    DiagnosisUpdate,
    DiagnosisNoteCreate,
)
from crud.diagnoses import (
    get_diagnosis, get_diagnoses_by_patient, create_diagnosis, update_diagnosis,
    delete_diagnosis, activate_diagnosis, set_primary_diagnosis,
    get_diagnosis_types, get_diagnosis_statuses, get_diagnosis_categories, get_severity_levels,
    get_diagnosis_notes, create_diagnosis_note, delete_diagnosis_note, get_note_types,
    format_diagnosis_for_response, format_diagnosis_for_list
)
from routes.auth import get_current_user
from models.users import User

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/diagnoses", tags=["diagnoses"])


# --- Lookup endpoints ---

@router.get("/types")
async def get_types():
    """Get available diagnosis types."""
    return get_diagnosis_types()


@router.get("/statuses")
async def get_statuses():
    """Get available diagnosis statuses."""
    return get_diagnosis_statuses()


@router.get("/categories")
async def get_categories():
    """Get available diagnosis categories."""
    return get_diagnosis_categories()


@router.get("/severity-levels")
async def get_severities():
    """Get available severity levels."""
    return get_severity_levels()


@router.get("/note-types")
async def get_available_note_types():
    """Get available note types."""
    return get_note_types()


# --- Diagnosis CRUD endpoints ---

@router.get("/patient/{patient_id}")
async def get_patient_diagnoses(
    patient_id: int,
    active_only: bool = Query(True, description="Only return active diagnoses"),
    status: Optional[str] = Query(None, description="Filter by status"),
    diagnosis_type: Optional[str] = Query(None, description="Filter by diagnosis type"),
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db)
):
    """Get all diagnoses for a patient with optional filters."""
    try:
        diagnoses = get_diagnoses_by_patient(
            db, patient_id, active_only, status, diagnosis_type, category
        )
        return [format_diagnosis_for_list(d) for d in diagnoses]
    except Exception as e:
        logger.error(f"Error fetching diagnoses for patient {patient_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{diagnosis_id}")
async def get_diagnosis_detail(
    diagnosis_id: int,
    db: Session = Depends(get_db)
):
    """Get a diagnosis by ID with all details."""
    diagnosis = get_diagnosis(db, diagnosis_id)
    if not diagnosis:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    return format_diagnosis_for_response(diagnosis)


@router.post("")
async def create_new_diagnosis(
    data: DiagnosisCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new diagnosis."""
    try:
        diagnosis_data = data.model_dump(exclude_none=True)
        diagnosis = create_diagnosis(db, diagnosis_data, current_user.id if current_user else None)
        return format_diagnosis_for_response(diagnosis)
    except Exception as e:
        logger.error(f"Error creating diagnosis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{diagnosis_id}")
async def update_existing_diagnosis(
    diagnosis_id: int,
    data: DiagnosisUpdate,
    db: Session = Depends(get_db)
):
    """Update an existing diagnosis."""
    try:
        diagnosis_data = data.model_dump(exclude_none=True)
        diagnosis = update_diagnosis(db, diagnosis_id, diagnosis_data)
        if not diagnosis:
            raise HTTPException(status_code=404, detail="Diagnosis not found")
        return format_diagnosis_for_response(diagnosis)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating diagnosis {diagnosis_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{diagnosis_id}")
async def deactivate_diagnosis(
    diagnosis_id: int,
    db: Session = Depends(get_db)
):
    """Soft delete (deactivate) a diagnosis."""
    success = delete_diagnosis(db, diagnosis_id)
    if not success:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    return {"status": "success", "message": "Diagnosis deactivated"}


@router.post("/{diagnosis_id}/activate")
async def reactivate_diagnosis(
    diagnosis_id: int,
    db: Session = Depends(get_db)
):
    """Reactivate a deactivated diagnosis."""
    success = activate_diagnosis(db, diagnosis_id)
    if not success:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    return {"status": "success", "message": "Diagnosis reactivated"}


@router.post("/{diagnosis_id}/set-primary")
async def set_as_primary_diagnosis(
    diagnosis_id: int,
    db: Session = Depends(get_db)
):
    """Set a diagnosis as the primary diagnosis for the patient."""
    diagnosis = set_primary_diagnosis(db, diagnosis_id)
    if not diagnosis:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    return format_diagnosis_for_response(diagnosis)


# --- Diagnosis Notes endpoints ---

@router.get("/{diagnosis_id}/notes")
async def get_notes_for_diagnosis(
    diagnosis_id: int,
    db: Session = Depends(get_db)
):
    """Get all notes for a diagnosis."""
    diagnosis = get_diagnosis(db, diagnosis_id)
    if not diagnosis:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    
    notes = get_diagnosis_notes(db, diagnosis_id)
    result = []
    for note in notes:
        provider_name = None
        if note.provider:
            provider_name = f"{note.provider.title or ''} {note.provider.first_name} {note.provider.last_name}".strip()
        
        created_by_name = None
        if note.created_by_user:
            created_by_name = note.created_by_user.username
        
        result.append({
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
    return result


@router.post("/{diagnosis_id}/notes")
async def add_note_to_diagnosis(
    diagnosis_id: int,
    data: DiagnosisNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a follow-up note to a diagnosis."""
    diagnosis = get_diagnosis(db, diagnosis_id)
    if not diagnosis:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    
    try:
        note_data = data.model_dump(exclude_none=True)
        note_data['diagnosis_id'] = diagnosis_id
        note = create_diagnosis_note(db, note_data, current_user.id if current_user else None)
        
        provider_name = None
        if note.provider:
            provider_name = f"{note.provider.title or ''} {note.provider.first_name} {note.provider.last_name}".strip()
        
        return {
            'id': note.id,
            'diagnosis_id': note.diagnosis_id,
            'note_type': note.note_type,
            'content': note.content,
            'provider_id': note.provider_id,
            'provider_name': provider_name,
            'created_at': note.created_at.isoformat() if note.created_at else None,
            'created_by': note.created_by,
            'created_by_name': current_user.username if current_user else None
        }
    except Exception as e:
        logger.error(f"Error adding note to diagnosis {diagnosis_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/notes/{note_id}")
async def remove_diagnosis_note(
    note_id: int,
    db: Session = Depends(get_db)
):
    """Delete a diagnosis note."""
    success = delete_diagnosis_note(db, note_id)
    if not success:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"status": "success", "message": "Note deleted"}
