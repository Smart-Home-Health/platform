"""
Implants API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from db import get_db
from crud import implants as implant_crud
from models.implants import (
    ImplantCreate, 
    ImplantUpdate, 
    ImplantResponse,
    ImplantNoteCreate,
    ImplantNoteResponse,
    ImplantTypeOption,
    ImplantCategoryOption,
    ImplantStatusOption,
    MRISafetyOption
)
from routes.auth import get_current_user
from models.users import User

router = APIRouter(prefix="/api/implants", tags=["implants"])


# ============== Lookup Endpoints ==============

@router.get("/types", response_model=List[ImplantTypeOption])
async def get_implant_types():
    """Get list of implant types"""
    return implant_crud.IMPLANT_TYPES


@router.get("/categories", response_model=List[ImplantCategoryOption])
async def get_implant_categories(implant_type: Optional[str] = None):
    """Get list of implant categories, optionally filtered by type"""
    categories = implant_crud.IMPLANT_CATEGORIES
    if implant_type:
        categories = [c for c in categories if c['implant_type'] == implant_type]
    return categories


@router.get("/statuses", response_model=List[ImplantStatusOption])
async def get_implant_statuses():
    """Get list of implant statuses"""
    return implant_crud.IMPLANT_STATUSES


@router.get("/mri-safety-options")
async def get_mri_safety_options():
    """Get list of MRI safety options"""
    return implant_crud.MRI_SAFETY_OPTIONS


@router.get("/body-sides")
async def get_body_sides():
    """Get list of body side options"""
    return implant_crud.BODY_SIDES


# ============== Implant CRUD Endpoints ==============

@router.get("/patient/{patient_id}", response_model=List[dict])
async def get_patient_implants(
    patient_id: int,
    include_inactive: bool = Query(False),
    implant_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all implants for a patient"""
    implants = implant_crud.get_implants_by_patient(
        db, 
        patient_id, 
        include_inactive=include_inactive,
        implant_type=implant_type,
        status=status
    )
    return [implant_crud.format_implant_for_response(i) for i in implants]


@router.get("/{implant_id}", response_model=dict)
async def get_implant(
    implant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a single implant by ID with all details"""
    implant = implant_crud.get_implant(db, implant_id)
    if not implant:
        raise HTTPException(status_code=404, detail="Implant not found")
    return implant_crud.format_implant_for_response(implant, include_notes=True)


@router.post("", response_model=dict)
async def create_implant(
    implant_data: ImplantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new implant record"""
    implant = implant_crud.create_implant(
        db, 
        implant_data.model_dump(), 
        user_id=current_user.id
    )
    return implant_crud.format_implant_for_response(implant)


@router.put("/{implant_id}", response_model=dict)
async def update_implant(
    implant_id: int,
    update_data: ImplantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing implant"""
    # Only include non-None values
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    implant = implant_crud.update_implant(db, implant_id, update_dict)
    if not implant:
        raise HTTPException(status_code=404, detail="Implant not found")
    return implant_crud.format_implant_for_response(implant)


@router.delete("/{implant_id}")
async def delete_implant(
    implant_id: int,
    hard_delete: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an implant (soft delete by default)"""
    success = implant_crud.delete_implant(db, implant_id, soft_delete=not hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="Implant not found")
    return {"success": True}


# ============== Implant Notes Endpoints ==============

@router.get("/{implant_id}/notes", response_model=List[dict])
async def get_implant_notes(
    implant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all notes for an implant"""
    notes = implant_crud.get_implant_notes(db, implant_id)
    return [implant_crud.format_implant_note_for_response(n) for n in notes]


@router.post("/{implant_id}/notes", response_model=dict)
async def create_implant_note(
    implant_id: int,
    note_data: ImplantNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new note for an implant"""
    # Verify implant exists
    implant = implant_crud.get_implant(db, implant_id)
    if not implant:
        raise HTTPException(status_code=404, detail="Implant not found")
    
    note = implant_crud.create_implant_note(
        db,
        implant_id,
        note_data.model_dump(),
        user_id=current_user.id
    )
    return implant_crud.format_implant_note_for_response(note)


@router.delete("/notes/{note_id}")
async def delete_implant_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an implant note"""
    success = implant_crud.delete_implant_note(db, note_id)
    if not success:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"success": True}
