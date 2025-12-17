from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime, timezone
from schemas.business import Business

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
    """Get businesses by type."""
    query = db.query(Business).filter(Business.business_type == business_type)
    if active_only:
        query = query.filter(Business.active == True)
    return query.order_by(Business.name).all()

def create_business(db: Session, business_data: dict) -> Business:
    """Create a new business."""
    business_data['created_at'] = datetime.now(timezone.utc)
    business_data['updated_at'] = datetime.now(timezone.utc)
    
    business = Business(**business_data)
    db.add(business)
    db.commit()
    db.refresh(business)
    return business

def update_business(db: Session, business_id: int, business_data: dict) -> Optional[Business]:
    """Update an existing business."""
    business = get_business(db, business_id)
    if not business:
        return None
    
    business_data['updated_at'] = datetime.now(timezone.utc)
    
    for key, value in business_data.items():
        if hasattr(business, key):
            setattr(business, key, value)
    
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
    """Search businesses by name or type."""
    query = db.query(Business).filter(
        (Business.name.ilike(f"%{search_term}%")) |
        (Business.business_type.ilike(f"%{search_term}%")) |
        (Business.city.ilike(f"%{search_term}%"))
    )
    if active_only:
        query = query.filter(Business.active == True)
    return query.order_by(Business.name).all()

def get_business_types(db: Session) -> List[str]:
    """Get all unique business types."""
    result = db.query(Business.business_type).filter(Business.active == True).distinct().all()
    return [row[0] for row in result if row[0]]
