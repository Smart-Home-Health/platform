from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime, timezone
from schemas.business import Business, BusinessTypeAssignment


def get_business(db: Session, business_id: int) -> Optional[Business]:
    """Get a business by ID."""
    return db.query(Business).filter(Business.id == business_id).first()


def get_businesses(db: Session, skip: int = 0, limit: int = 100, active_only: bool = True) -> List[Business]:
    """Get all businesses with pagination."""
    query = db.query(Business)
    if active_only:
        query = query.filter(Business.active == True)
    return query.order_by(Business.name).offset(skip).limit(limit).all()


def get_businesses_by_type(db: Session, business_type: str, active_only: bool = True) -> List[Business]:
    """Get businesses that have a specific type."""
    query = db.query(Business).join(BusinessTypeAssignment).filter(
        BusinessTypeAssignment.type_name == business_type
    )
    if active_only:
        query = query.filter(Business.active == True)
    return query.order_by(Business.name).all()


def _set_business_types(db: Session, business: Business, types: List[str]):
    """Helper to set business types - clears existing and adds new ones."""
    # Clear existing type assignments
    db.query(BusinessTypeAssignment).filter(
        BusinessTypeAssignment.business_id == business.id
    ).delete()
    
    # Add new type assignments
    for type_name in types:
        if type_name:  # Skip empty strings
            assignment = BusinessTypeAssignment(
                business_id=business.id,
                type_name=type_name.lower().strip()
            )
            db.add(assignment)
    
    # Also update legacy field with first type for backwards compatibility
    if types:
        business.business_type = types[0].lower().strip()
    else:
        business.business_type = None


def create_business(db: Session, business_data: dict) -> Business:
    """Create a new business."""
    # Extract types before creating business
    types = business_data.pop('business_types', [])
    
    business_data['created_at'] = datetime.now(timezone.utc)
    business_data['updated_at'] = datetime.now(timezone.utc)
    
    # Set legacy field for backwards compatibility
    if types:
        business_data['business_type'] = types[0].lower().strip() if types else None
    
    business = Business(**business_data)
    db.add(business)
    db.flush()  # Get the ID before adding type assignments
    
    # Add type assignments
    for type_name in types:
        if type_name:
            assignment = BusinessTypeAssignment(
                business_id=business.id,
                type_name=type_name.lower().strip()
            )
            db.add(assignment)
    
    db.commit()
    db.refresh(business)
    return business


def update_business(db: Session, business_id: int, business_data: dict) -> Optional[Business]:
    """Update an existing business."""
    business = get_business(db, business_id)
    if not business:
        return None
    
    # Handle types separately
    types = business_data.pop('business_types', None)
    
    business_data['updated_at'] = datetime.now(timezone.utc)
    
    for key, value in business_data.items():
        if hasattr(business, key):
            setattr(business, key, value)
    
    # Update types if provided
    if types is not None:
        _set_business_types(db, business, types)
    
    db.commit()
    db.refresh(business)
    return business


def delete_business(db: Session, business_id: int) -> bool:
    """Soft delete a business by setting active to False."""
    business = get_business(db, business_id)
    if not business:
        return False
    
    business.active = False
    business.updated_at = datetime.now(timezone.utc)
    db.commit()
    return True


def activate_business(db: Session, business_id: int) -> bool:
    """Reactivate a business."""
    business = get_business(db, business_id)
    if not business:
        return False
    
    business.active = True
    business.updated_at = datetime.now(timezone.utc)
    db.commit()
    return True


def search_businesses(db: Session, search_term: str, active_only: bool = True) -> List[Business]:
    """Search businesses by name, type, or city."""
    # Search in main business fields
    query = db.query(Business).outerjoin(BusinessTypeAssignment).filter(
        (Business.name.ilike(f"%{search_term}%")) |
        (BusinessTypeAssignment.type_name.ilike(f"%{search_term}%")) |
        (Business.city.ilike(f"%{search_term}%"))
    )
    if active_only:
        query = query.filter(Business.active == True)
    return query.distinct().order_by(Business.name).all()


def get_business_types(db: Session) -> List[str]:
    """Get all unique business types."""
    result = db.query(BusinessTypeAssignment.type_name).join(Business).filter(
        Business.active == True
    ).distinct().all()
    return sorted([row[0] for row in result if row[0]])


def add_business_type(db: Session, business_id: int, type_name: str) -> bool:
    """Add a type to a business."""
    business = get_business(db, business_id)
    if not business:
        return False
    
    # Check if type already exists
    existing = db.query(BusinessTypeAssignment).filter(
        BusinessTypeAssignment.business_id == business_id,
        BusinessTypeAssignment.type_name == type_name.lower().strip()
    ).first()
    
    if existing:
        return True  # Already has this type
    
    assignment = BusinessTypeAssignment(
        business_id=business_id,
        type_name=type_name.lower().strip()
    )
    db.add(assignment)
    business.updated_at = datetime.now(timezone.utc)
    db.commit()
    return True


def remove_business_type(db: Session, business_id: int, type_name: str) -> bool:
    """Remove a type from a business."""
    business = get_business(db, business_id)
    if not business:
        return False
    
    deleted = db.query(BusinessTypeAssignment).filter(
        BusinessTypeAssignment.business_id == business_id,
        BusinessTypeAssignment.type_name == type_name.lower().strip()
    ).delete()
    
    if deleted:
        business.updated_at = datetime.now(timezone.utc)
        db.commit()
    
    return deleted > 0
