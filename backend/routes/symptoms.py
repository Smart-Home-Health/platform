"""
Symptoms API routes
"""
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db import get_db
from crud.symptoms import (
    create_symptom, 
    get_symptom_by_id, 
    get_symptoms_by_patient,
    get_symptoms_paginated,
    get_distinct_symptom_types,
    update_symptom,
    resolve_symptom,
    delete_symptom,
    COMMON_SYMPTOM_TYPES,
    COMMON_BODY_LOCATIONS
)

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/symptoms", tags=["symptoms"])


# --- Pydantic Models ---

class SymptomCreate(BaseModel):
    symptom_type: str
    patient_id: Optional[int] = None
    severity: Optional[int] = None
    location: Optional[str] = None
    duration: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    timestamp: Optional[str] = None  # ISO format string


class SymptomUpdate(BaseModel):
    symptom_type: Optional[str] = None
    severity: Optional[int] = None
    location: Optional[str] = None
    duration: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    is_resolved: Optional[bool] = None


class SymptomResponse(BaseModel):
    id: int
    patient_id: int
    timestamp: datetime
    symptom_type: str
    severity: Optional[int]
    location: Optional[str]
    duration: Optional[str]
    description: Optional[str]
    notes: Optional[str]
    is_resolved: bool
    resolved_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


# --- Routes ---

@router.get("/types")
def get_symptom_types(db: Session = Depends(get_db)):
    """
    Get available symptom types.
    Returns both common types and any custom types from the database.
    """
    db_types = get_distinct_symptom_types(db)
    # Combine common types with any custom types from DB
    all_types = list(set(COMMON_SYMPTOM_TYPES + db_types))
    all_types.sort()
    return all_types


@router.get("/locations")
def get_body_locations():
    """Get available body locations for symptom logging."""
    return COMMON_BODY_LOCATIONS


@router.get("", response_model=dict)
def list_symptoms(
    patient_id: Optional[int] = Query(None, description="Filter by patient ID"),
    symptom_type: Optional[str] = Query(None, description="Filter by symptom type"),
    include_resolved: bool = Query(True, description="Include resolved symptoms"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db)
):
    """
    Get paginated list of symptoms with optional filtering.
    """
    result = get_symptoms_paginated(
        db,
        patient_id=patient_id,
        page=page,
        page_size=page_size,
        symptom_type=symptom_type,
        include_resolved=include_resolved
    )
    
    # Convert SQLAlchemy objects to dictionaries
    items = []
    for symptom in result["items"]:
        items.append({
            "id": symptom.id,
            "patient_id": symptom.patient_id,
            "timestamp": symptom.timestamp.isoformat() if symptom.timestamp else None,
            "symptom_type": symptom.symptom_type,
            "severity": symptom.severity,
            "location": symptom.location,
            "duration": symptom.duration,
            "description": symptom.description,
            "notes": symptom.notes,
            "is_resolved": symptom.is_resolved,
            "resolved_at": symptom.resolved_at.isoformat() if symptom.resolved_at else None,
            "created_at": symptom.created_at.isoformat() if symptom.created_at else None
        })
    
    return {
        "items": items,
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "total_pages": result["total_pages"]
    }


@router.get("/patient/{patient_id}")
def get_patient_symptoms(
    patient_id: int,
    limit: int = Query(100, ge=1, le=500),
    include_resolved: bool = Query(True),
    db: Session = Depends(get_db)
):
    """Get symptoms for a specific patient."""
    symptoms = get_symptoms_by_patient(db, patient_id, limit, include_resolved)
    
    return [{
        "id": s.id,
        "patient_id": s.patient_id,
        "timestamp": s.timestamp.isoformat() if s.timestamp else None,
        "symptom_type": s.symptom_type,
        "severity": s.severity,
        "location": s.location,
        "duration": s.duration,
        "description": s.description,
        "notes": s.notes,
        "is_resolved": s.is_resolved,
        "resolved_at": s.resolved_at.isoformat() if s.resolved_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None
    } for s in symptoms]


@router.get("/{symptom_id}")
def get_symptom(symptom_id: int, db: Session = Depends(get_db)):
    """Get a specific symptom by ID."""
    symptom = get_symptom_by_id(db, symptom_id)
    if not symptom:
        raise HTTPException(status_code=404, detail="Symptom not found")
    
    return {
        "id": symptom.id,
        "patient_id": symptom.patient_id,
        "timestamp": symptom.timestamp.isoformat() if symptom.timestamp else None,
        "symptom_type": symptom.symptom_type,
        "severity": symptom.severity,
        "location": symptom.location,
        "duration": symptom.duration,
        "description": symptom.description,
        "notes": symptom.notes,
        "is_resolved": symptom.is_resolved,
        "resolved_at": symptom.resolved_at.isoformat() if symptom.resolved_at else None,
        "created_at": symptom.created_at.isoformat() if symptom.created_at else None
    }


@router.post("", status_code=201)
def create_new_symptom(symptom_data: SymptomCreate, db: Session = Depends(get_db)):
    """Create a new symptom record."""
    try:
        # Parse timestamp if provided
        timestamp = None
        if symptom_data.timestamp:
            try:
                timestamp = datetime.fromisoformat(symptom_data.timestamp.replace('Z', '+00:00'))
            except ValueError:
                pass
        
        symptom = create_symptom(
            db,
            symptom_type=symptom_data.symptom_type,
            patient_id=symptom_data.patient_id,
            severity=symptom_data.severity,
            location=symptom_data.location,
            duration=symptom_data.duration,
            description=symptom_data.description,
            notes=symptom_data.notes,
            timestamp=timestamp
        )
        
        return {
            "status": "success",
            "message": "Symptom created successfully",
            "id": symptom.id,
            "symptom": {
                "id": symptom.id,
                "patient_id": symptom.patient_id,
                "timestamp": symptom.timestamp.isoformat() if symptom.timestamp else None,
                "symptom_type": symptom.symptom_type,
                "severity": symptom.severity,
                "location": symptom.location,
                "duration": symptom.duration,
                "description": symptom.description,
                "notes": symptom.notes,
                "is_resolved": symptom.is_resolved
            }
        }
    except Exception as e:
        logger.error(f"Error creating symptom: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{symptom_id}")
def update_symptom_record(
    symptom_id: int, 
    symptom_data: SymptomUpdate, 
    db: Session = Depends(get_db)
):
    """Update an existing symptom record."""
    try:
        update_data = symptom_data.model_dump(exclude_unset=True)
        symptom = update_symptom(db, symptom_id, **update_data)
        
        if not symptom:
            raise HTTPException(status_code=404, detail="Symptom not found")
        
        return {
            "status": "success",
            "message": "Symptom updated successfully",
            "symptom": {
                "id": symptom.id,
                "patient_id": symptom.patient_id,
                "timestamp": symptom.timestamp.isoformat() if symptom.timestamp else None,
                "symptom_type": symptom.symptom_type,
                "severity": symptom.severity,
                "location": symptom.location,
                "duration": symptom.duration,
                "description": symptom.description,
                "notes": symptom.notes,
                "is_resolved": symptom.is_resolved,
                "resolved_at": symptom.resolved_at.isoformat() if symptom.resolved_at else None
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating symptom {symptom_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{symptom_id}/resolve")
def resolve_symptom_record(symptom_id: int, db: Session = Depends(get_db)):
    """Mark a symptom as resolved."""
    symptom = resolve_symptom(db, symptom_id)
    
    if not symptom:
        raise HTTPException(status_code=404, detail="Symptom not found")
    
    return {
        "status": "success",
        "message": "Symptom marked as resolved",
        "resolved_at": symptom.resolved_at.isoformat() if symptom.resolved_at else None
    }


@router.delete("/{symptom_id}")
def delete_symptom_record(symptom_id: int, db: Session = Depends(get_db)):
    """Delete a symptom record."""
    success = delete_symptom(db, symptom_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Symptom not found")
    
    return {"status": "success", "message": "Symptom deleted successfully"}
