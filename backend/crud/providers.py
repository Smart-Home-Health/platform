from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, and_
from typing import List, Optional
from datetime import datetime, timezone
from schemas.provider import Provider
from schemas.business import Business

def get_provider(db: Session, provider_id: int) -> Optional[Provider]:
    """Get a provider by ID with business information."""
    return db.query(Provider).options(joinedload(Provider.business)).filter(Provider.id == provider_id).first()

def get_providers_by_patient(db: Session, patient_id: int, active_only: bool = True) -> List[Provider]:
    """Get all providers for a specific patient."""
    query = db.query(Provider).options(joinedload(Provider.business)).filter(Provider.patient_id == patient_id)
    if active_only:
        query = query.filter(Provider.active == True)
    return query.order_by(Provider.provider_type, Provider.last_name, Provider.first_name).all()

def get_providers_by_type(db: Session, patient_id: int, provider_type: str, active_only: bool = True) -> List[Provider]:
    """Get providers by patient and type."""
    query = db.query(Provider).options(joinedload(Provider.business)).filter(
        and_(Provider.patient_id == patient_id, Provider.provider_type == provider_type)
    )
    if active_only:
        query = query.filter(Provider.active == True)
    return query.order_by(Provider.last_name, Provider.first_name).all()

def get_primary_provider(db: Session, patient_id: int, provider_type: str) -> Optional[Provider]:
    """Get the primary provider of a specific type for a patient."""
    return db.query(Provider).options(joinedload(Provider.business)).filter(
        and_(
            Provider.patient_id == patient_id,
            Provider.provider_type == provider_type,
            Provider.is_primary == True,
            Provider.active == True
        )
    ).first()

def create_provider(db: Session, provider_data: dict) -> Provider:
    """Create a new provider."""
    provider_data['created_at'] = datetime.now(timezone.utc)
    provider_data['updated_at'] = datetime.now(timezone.utc)
    
    # If this is being set as primary, unset other primary providers of same type for same patient
    if provider_data.get('is_primary', False):
        db.query(Provider).filter(
            and_(
                Provider.patient_id == provider_data['patient_id'],
                Provider.provider_type == provider_data['provider_type'],
                Provider.is_primary == True
            )
        ).update({'is_primary': False, 'updated_at': datetime.now(timezone.utc)})
    
    provider = Provider(**provider_data)
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider

def update_provider(db: Session, provider_id: int, provider_data: dict) -> Optional[Provider]:
    """Update an existing provider."""
    provider = get_provider(db, provider_id)
    if not provider:
        return None
    
    provider_data['updated_at'] = datetime.now(timezone.utc)
    
    # If this is being set as primary, unset other primary providers of same type for same patient
    if provider_data.get('is_primary', False) and not provider.is_primary:
        db.query(Provider).filter(
            and_(
                Provider.patient_id == provider.patient_id,
                Provider.provider_type == provider_data.get('provider_type', provider.provider_type),
                Provider.is_primary == True,
                Provider.id != provider_id
            )
        ).update({'is_primary': False, 'updated_at': datetime.now(timezone.utc)})
    
    for key, value in provider_data.items():
        if hasattr(provider, key):
            setattr(provider, key, value)
    
    db.commit()
    db.refresh(provider)
    return provider

def delete_provider(db: Session, provider_id: int) -> bool:
    """Soft delete a provider by setting active to False."""
    provider = get_provider(db, provider_id)
    if not provider:
        return False
    
    provider.active = False
    provider.updated_at = datetime.now(timezone.utc)
    db.commit()
    return True

def activate_provider(db: Session, provider_id: int) -> bool:
    """Reactivate a provider."""
    provider = get_provider(db, provider_id)
    if not provider:
        return False
    
    provider.active = True
    provider.updated_at = datetime.now(timezone.utc)
    db.commit()
    return True

def search_providers(db: Session, patient_id: int, search_term: str, active_only: bool = True) -> List[Provider]:
    """Search providers for a patient by name, specialty, or type."""
    query = db.query(Provider).options(joinedload(Provider.business)).filter(
        and_(
            Provider.patient_id == patient_id,
            (
                (Provider.first_name.ilike(f"%{search_term}%")) |
                (Provider.last_name.ilike(f"%{search_term}%")) |
                (Provider.specialty.ilike(f"%{search_term}%")) |
                (Provider.provider_type.ilike(f"%{search_term}%"))
            )
        )
    )
    if active_only:
        query = query.filter(Provider.active == True)
    return query.order_by(Provider.last_name, Provider.first_name).all()

def get_provider_types(db: Session, patient_id: int = None) -> List[str]:
    """Get all unique provider types, optionally filtered by patient."""
    query = db.query(Provider.provider_type).filter(Provider.active == True)
    if patient_id:
        query = query.filter(Provider.patient_id == patient_id)
    result = query.distinct().all()
    return [row[0] for row in result if row[0]]

def set_primary_provider(db: Session, provider_id: int) -> bool:
    """Set a provider as primary for their type and patient."""
    provider = get_provider(db, provider_id)
    if not provider:
        return False
    
    # Unset other primary providers of same type for same patient
    db.query(Provider).filter(
        and_(
            Provider.patient_id == provider.patient_id,
            Provider.provider_type == provider.provider_type,
            Provider.is_primary == True,
            Provider.id != provider_id
        )
    ).update({'is_primary': False, 'updated_at': datetime.now(timezone.utc)})
    
    # Set this provider as primary
    provider.is_primary = True
    provider.updated_at = datetime.now(timezone.utc)
    db.commit()
    return True
