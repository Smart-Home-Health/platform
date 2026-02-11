"""
Symptom CRUD operations
"""
import logging
import pytz
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from schemas.symptom import Symptom
from crud.patients import get_or_create_default_patient

logger = logging.getLogger('crud')


def create_symptom(
    db: Session, 
    symptom_type: str,
    patient_id: Optional[int] = None,
    severity: Optional[int] = None,
    location: Optional[str] = None,
    duration: Optional[str] = None,
    description: Optional[str] = None,
    notes: Optional[str] = None,
    timestamp: Optional[datetime] = None
) -> Symptom:
    """
    Create a new symptom record.
    
    Args:
        db: Database session
        symptom_type: Type of symptom (e.g., 'pain', 'nausea', 'fatigue')
        patient_id: Patient ID (uses default patient if not provided)
        severity: Severity on 1-10 scale
        location: Body location if applicable
        duration: Duration of symptom
        description: Detailed description
        notes: Additional notes
        timestamp: When the symptom occurred/was reported
    
    Returns:
        Created Symptom object
    """
    now = datetime.now(timezone.utc)
    ts = timestamp or now
    
    # Get patient_id if not provided
    if patient_id is None:
        patient = get_or_create_default_patient(db)
        if not patient:
            raise ValueError("No patient exists. Complete first-run setup first.")
        patient_id = patient.id
    
    # Ensure timestamp is timezone-aware
    if ts and hasattr(ts, 'tzinfo') and ts.tzinfo is None:
        eastern = pytz.timezone('US/Eastern')
        ts = eastern.localize(ts).astimezone(timezone.utc)
    elif isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except:
            ts = now
    
    symptom = Symptom(
        patient_id=patient_id,
        timestamp=ts,
        symptom_type=symptom_type,
        severity=severity,
        location=location,
        duration=duration,
        description=description,
        notes=notes,
        is_resolved=False,
        created_at=now
    )
    
    db.add(symptom)
    db.commit()
    db.refresh(symptom)
    
    logger.info(f"Symptom created for patient {patient_id}: {symptom_type} (severity: {severity})")
    return symptom


def get_symptom_by_id(db: Session, symptom_id: int) -> Optional[Symptom]:
    """Get a symptom by ID."""
    return db.query(Symptom).filter(Symptom.id == symptom_id).first()


def get_symptoms_by_patient(
    db: Session, 
    patient_id: int, 
    limit: int = 100,
    include_resolved: bool = True
) -> List[Symptom]:
    """
    Get symptoms for a specific patient.
    
    Args:
        db: Database session
        patient_id: Patient ID
        limit: Maximum number of records to return
        include_resolved: Whether to include resolved symptoms
    
    Returns:
        List of Symptom objects
    """
    query = db.query(Symptom).filter(Symptom.patient_id == patient_id)
    
    if not include_resolved:
        query = query.filter(Symptom.is_resolved == False)
    
    return query.order_by(desc(Symptom.timestamp)).limit(limit).all()


def get_symptoms_paginated(
    db: Session,
    patient_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
    symptom_type: Optional[str] = None,
    include_resolved: bool = True
) -> dict:
    """
    Get paginated symptoms with filtering.
    
    Args:
        db: Database session
        patient_id: Optional patient filter
        page: Page number (1-indexed)
        page_size: Number of records per page
        symptom_type: Optional symptom type filter
        include_resolved: Whether to include resolved symptoms
    
    Returns:
        Dictionary with items, total, page, page_size, and total_pages
    """
    query = db.query(Symptom)
    
    if patient_id:
        query = query.filter(Symptom.patient_id == patient_id)
    
    if symptom_type:
        query = query.filter(Symptom.symptom_type == symptom_type)
    
    if not include_resolved:
        query = query.filter(Symptom.is_resolved == False)
    
    total = query.count()
    total_pages = (total + page_size - 1) // page_size
    
    offset = (page - 1) * page_size
    items = query.order_by(desc(Symptom.timestamp)).offset(offset).limit(page_size).all()
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


def get_distinct_symptom_types(db: Session) -> List[str]:
    """Get a distinct list of symptom types from the database."""
    results = db.query(Symptom.symptom_type).distinct().all()
    return [r[0] for r in results if r[0]]


def update_symptom(
    db: Session,
    symptom_id: int,
    **kwargs
) -> Optional[Symptom]:
    """
    Update a symptom record.
    
    Args:
        db: Database session
        symptom_id: Symptom ID to update
        **kwargs: Fields to update
    
    Returns:
        Updated Symptom object or None if not found
    """
    symptom = get_symptom_by_id(db, symptom_id)
    if not symptom:
        return None
    
    # Update allowed fields
    allowed_fields = ['symptom_type', 'severity', 'location', 'duration', 
                      'description', 'notes', 'is_resolved', 'resolved_at']
    
    for key, value in kwargs.items():
        if key in allowed_fields and value is not None:
            setattr(symptom, key, value)
    
    db.commit()
    db.refresh(symptom)
    
    logger.info(f"Symptom {symptom_id} updated")
    return symptom


def resolve_symptom(db: Session, symptom_id: int) -> Optional[Symptom]:
    """
    Mark a symptom as resolved.
    
    Args:
        db: Database session
        symptom_id: Symptom ID to resolve
    
    Returns:
        Updated Symptom object or None if not found
    """
    symptom = get_symptom_by_id(db, symptom_id)
    if not symptom:
        return None
    
    symptom.is_resolved = True
    symptom.resolved_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(symptom)
    
    logger.info(f"Symptom {symptom_id} marked as resolved")
    return symptom


def delete_symptom(db: Session, symptom_id: int) -> bool:
    """
    Delete a symptom record.
    
    Args:
        db: Database session
        symptom_id: Symptom ID to delete
    
    Returns:
        True if deleted, False if not found
    """
    symptom = get_symptom_by_id(db, symptom_id)
    if not symptom:
        return False
    
    db.delete(symptom)
    db.commit()
    
    logger.info(f"Symptom {symptom_id} deleted")
    return True


# Common symptom types for UI suggestions
COMMON_SYMPTOM_TYPES = [
    "pain",
    "headache",
    "nausea",
    "vomiting",
    "fatigue",
    "dizziness",
    "shortness_of_breath",
    "cough",
    "fever",
    "chills",
    "swelling",
    "rash",
    "itching",
    "numbness",
    "tingling",
    "weakness",
    "anxiety",
    "confusion",
    "insomnia",
    "appetite_loss",
    "constipation",
    "diarrhea",
    "chest_pain",
    "palpitations",
    "joint_pain",
    "muscle_pain",
    "blurred_vision",
    "hearing_changes",
    "other"
]

# Common body locations for UI suggestions
COMMON_BODY_LOCATIONS = [
    "head",
    "face",
    "neck",
    "chest",
    "upper_back",
    "lower_back",
    "abdomen",
    "pelvis",
    "left_arm",
    "right_arm",
    "left_hand",
    "right_hand",
    "left_leg",
    "right_leg",
    "left_foot",
    "right_foot",
    "whole_body",
    "other"
]
