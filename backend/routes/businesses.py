from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from db import get_db
from crud.businesses import (
    get_business, get_businesses, get_businesses_by_type, create_business, 
    update_business, delete_business, activate_business, search_businesses, 
    get_business_types, add_business_type, remove_business_type
)
from models.businesses import (
    BusinessBase,
    BusinessCreate,
    BusinessUpdate,
    BusinessResponse,
)

router = APIRouter(prefix="/api/businesses", tags=["businesses"])


def _business_to_response(business) -> dict:
    """Convert a Business ORM object to a response dict with types array."""
    return {
        "id": business.id,
        "name": business.name,
        "business_types": business.types,  # Uses the @property
        "business_type": business.business_type,  # Legacy field
        "phone": business.phone,
        "email": business.email,
        "website": business.website,
        "address_line1": business.address_line1,
        "address_line2": business.address_line2,
        "city": business.city,
        "state": business.state,
        "zip_code": business.zip_code,
        "country": business.country,
        "description": business.description,
        "hours_of_operation": business.hours_of_operation,
        "emergency_contact": business.emergency_contact,
        "active": business.active,
        "created_at": business.created_at,
        "updated_at": business.updated_at,
    }


@router.get("", response_model=List[BusinessResponse])
def list_businesses(
    active_only: bool = Query(True, description="Filter to active businesses only"),
    business_type: Optional[str] = Query(None, description="Filter by business type"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get all businesses with optional filtering."""
    if business_type:
        businesses = get_businesses_by_type(db, business_type, active_only)
    else:
        businesses = get_businesses(db, skip=skip, limit=limit, active_only=active_only)
    return [_business_to_response(b) for b in businesses]


@router.get("/types", response_model=List[str])
def list_business_types(db: Session = Depends(get_db)):
    """Get all unique business types."""
    return get_business_types(db)


@router.get("/search", response_model=List[BusinessResponse])
def search_businesses_endpoint(
    q: str = Query(..., min_length=1, description="Search term"),
    active_only: bool = Query(True, description="Filter to active businesses only"),
    db: Session = Depends(get_db)
):
    """Search businesses by name, type, or city."""
    businesses = search_businesses(db, q, active_only)
    return [_business_to_response(b) for b in businesses]


@router.get("/{business_id}", response_model=BusinessResponse)
def get_business_by_id(business_id: int, db: Session = Depends(get_db)):
    """Get a specific business by ID."""
    business = get_business(db, business_id)
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return _business_to_response(business)


@router.post("", response_model=BusinessResponse)
def create_business_endpoint(business: BusinessCreate, db: Session = Depends(get_db)):
    """Create a new business."""
    try:
        new_business = create_business(db, business.model_dump())
        return _business_to_response(new_business)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error creating business: {str(e)}")


@router.put("/{business_id}", response_model=BusinessResponse)
def update_business_endpoint(
    business_id: int, 
    business: BusinessUpdate, 
    db: Session = Depends(get_db)
):
    """Update an existing business."""
    # Filter out None values
    update_data = {k: v for k, v in business.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    updated_business = update_business(db, business_id, update_data)
    if not updated_business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    return _business_to_response(updated_business)


@router.delete("/{business_id}")
def delete_business_endpoint(business_id: int, db: Session = Depends(get_db)):
    """Soft delete a business (sets active to False)."""
    success = delete_business(db, business_id)
    if not success:
        raise HTTPException(status_code=404, detail="Business not found")
    return {"message": "Business deactivated successfully"}


@router.post("/{business_id}/activate")
def activate_business_endpoint(business_id: int, db: Session = Depends(get_db)):
    """Reactivate a business."""
    success = activate_business(db, business_id)
    if not success:
        raise HTTPException(status_code=404, detail="Business not found")
    return {"message": "Business activated successfully"}


@router.post("/{business_id}/types/{type_name}")
def add_type_to_business(business_id: int, type_name: str, db: Session = Depends(get_db)):
    """Add a type to a business."""
    success = add_business_type(db, business_id, type_name)
    if not success:
        raise HTTPException(status_code=404, detail="Business not found")
    return {"message": f"Type '{type_name}' added successfully"}


@router.delete("/{business_id}/types/{type_name}")
def remove_type_from_business(business_id: int, type_name: str, db: Session = Depends(get_db)):
    """Remove a type from a business."""
    success = remove_business_type(db, business_id, type_name)
    if not success:
        raise HTTPException(status_code=404, detail="Business not found or type not assigned")
    return {"message": f"Type '{type_name}' removed successfully"}
