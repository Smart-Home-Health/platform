from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from models.providers import (
    ProviderBase,
    ProviderCreate,
    ProviderUpdate,
    BusinessInfo,
    ProviderResponse,
)

from db import get_db
from crud.providers import (
    get_provider, get_providers_by_patient, get_providers_by_type, 
    get_primary_provider, create_provider, update_provider, delete_provider, 
    activate_provider, search_providers, get_provider_types, set_primary_provider
)
from crud.businesses import get_business

router = APIRouter(prefix="/api/providers", tags=["providers"])

@router.get("/patient/{patient_id}", response_model=List[ProviderResponse])
def list_providers_for_patient(
    patient_id: int,
    active_only: bool = Query(True, description="Filter to active providers only"),
    provider_type: Optional[str] = Query(None, description="Filter by provider type"),
    db: Session = Depends(get_db)
):
    """Get all providers for a specific patient."""
    if provider_type:
        return get_providers_by_type(db, patient_id, provider_type, active_only)
    return get_providers_by_patient(db, patient_id, active_only)

@router.get("/patient/{patient_id}/types", response_model=List[str])
def list_provider_types_for_patient(patient_id: int, db: Session = Depends(get_db)):
    """Get all provider types for a specific patient."""
    return get_provider_types(db, patient_id)

@router.get("/patient/{patient_id}/primary/{provider_type}", response_model=Optional[ProviderResponse])
def get_primary_provider_for_patient(
    patient_id: int, 
    provider_type: str, 
    db: Session = Depends(get_db)
):
    """Get the primary provider of a specific type for a patient."""
    return get_primary_provider(db, patient_id, provider_type)

@router.get("/patient/{patient_id}/search", response_model=List[ProviderResponse])
def search_providers_for_patient(
    patient_id: int,
    q: str = Query(..., min_length=1, description="Search term"),
    active_only: bool = Query(True, description="Filter to active providers only"),
    db: Session = Depends(get_db)
):
    """Search providers for a patient by name, specialty, or type."""
    return search_providers(db, patient_id, q, active_only)

@router.get("/types", response_model=List[str])
def list_all_provider_types(db: Session = Depends(get_db)):
    """Get all unique provider types across all patients."""
    return get_provider_types(db)

@router.get("/{provider_id}", response_model=ProviderResponse)
def get_provider_by_id(provider_id: int, db: Session = Depends(get_db)):
    """Get a specific provider by ID."""
    provider = get_provider(db, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider

@router.post("", response_model=ProviderResponse)
def create_provider_endpoint(provider: ProviderCreate, db: Session = Depends(get_db)):
    """Create a new provider."""
    # Validate business_id if provided
    if provider.business_id:
        business = get_business(db, provider.business_id)
        if not business:
            raise HTTPException(status_code=400, detail="Invalid business_id")
    
    try:
        return create_provider(db, provider.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error creating provider: {str(e)}")

@router.put("/{provider_id}", response_model=ProviderResponse)
def update_provider_endpoint(
    provider_id: int, 
    provider: ProviderUpdate, 
    db: Session = Depends(get_db)
):
    """Update an existing provider."""
    # Filter out None values
    update_data = {k: v for k, v in provider.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    # Validate business_id if provided
    if 'business_id' in update_data and update_data['business_id']:
        business = get_business(db, update_data['business_id'])
        if not business:
            raise HTTPException(status_code=400, detail="Invalid business_id")
    
    updated_provider = update_provider(db, provider_id, update_data)
    if not updated_provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    return updated_provider

@router.delete("/{provider_id}")
def delete_provider_endpoint(provider_id: int, db: Session = Depends(get_db)):
    """Soft delete a provider (sets active to False)."""
    success = delete_provider(db, provider_id)
    if not success:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"message": "Provider deactivated successfully"}

@router.post("/{provider_id}/activate")
def activate_provider_endpoint(provider_id: int, db: Session = Depends(get_db)):
    """Reactivate a provider."""
    success = activate_provider(db, provider_id)
    if not success:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"message": "Provider activated successfully"}

@router.post("/{provider_id}/set-primary")
def set_primary_provider_endpoint(provider_id: int, db: Session = Depends(get_db)):
    """Set a provider as primary for their type and patient."""
    success = set_primary_provider(db, provider_id)
    if not success:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"message": "Provider set as primary successfully"}
