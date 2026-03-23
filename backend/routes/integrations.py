"""
API routes for integration management.

Provides endpoints for:
- Listing available integrations
- Patient-specific integration setup (CRUD)
- OAuth callbacks
- Manual sync triggers
- Device discovery
"""
from datetime import datetime, timedelta
from typing import Optional, List
from uuid import uuid4
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session, joinedload

from dependencies import get_db, require_read_access
from routes.auth import require_full_auth, get_current_account_id
from schemas.patient import Patient
from schemas.integration import Integration as IntegrationModel, PatientIntegration, IntegrationDevice
from schemas.vital import Vital
from integrations import registry, get_integration, AuthenticationError, SyncError
from models.integrations import (
    IntegrationInfoResponse,
    IntegrationDBResponse,
    PatientIntegrationCreate,
    PatientIntegrationResponse,
    IntegrationDeviceResponse,
    SyncResultResponse,
)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


# In-memory OAuth state storage (use Redis in production)
_oauth_states: dict = {}


def _get_or_create_integration(db: Session, slug: str) -> IntegrationModel:
    """
    Get integration from DB or create it from registry.
    
    This ensures the Integration table has an entry for each registered integration.
    """
    integration = db.query(IntegrationModel).filter(IntegrationModel.slug == slug).first()
    
    if not integration:
        # Get from registry
        integration_class = get_integration(slug)
        if not integration_class:
            raise HTTPException(status_code=404, detail=f"Integration '{slug}' not found")
        
        now = datetime.utcnow()
        integration = IntegrationModel(
            name=integration_class.name,
            slug=integration_class.slug,
            description=integration_class.description,
            auth_type=integration_class.auth_type,
            config_schema=integration_class.get_config_schema(),
            supported_vitals=integration_class.supported_vitals,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        db.add(integration)
        db.commit()
        db.refresh(integration)
    
    return integration


# ============================================================================
# Integration Discovery Endpoints
# ============================================================================

@router.get("", response_model=List[IntegrationInfoResponse])
async def list_integrations(current_user=Depends(require_full_auth), _: bool = Depends(require_read_access)):
    """
    List all available integrations with their metadata.
    """
    return registry.list_all_info()


@router.get("/{slug}", response_model=IntegrationInfoResponse)
async def get_integration_info(
    slug: str,
    current_user=Depends(require_full_auth),
    _: bool = Depends(require_read_access)
):
    """
    Get details about a specific integration.
    """
    info = registry.get_integration_info(slug)
    if not info:
        raise HTTPException(status_code=404, detail="Integration not found")
    return info


# ============================================================================
# Patient Integration Management
# ============================================================================

@router.get("/patient/{patient_id}", response_model=List[PatientIntegrationResponse])
async def list_patient_integrations(
    patient_id: int,
    include_disabled: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access)
):
    """
    List all integrations configured for a patient.
    """
    
    query = db.query(PatientIntegration).options(
        joinedload(PatientIntegration.integration)
    ).filter(
        PatientIntegration.patient_id == patient_id,
        PatientIntegration.account_id == account_id,
    )
    
    if not include_disabled:
        query = query.filter(PatientIntegration.is_enabled == True)
    
    patient_integrations = query.all()
    
    # Enrich with integration info
    results = []
    for pi in patient_integrations:
        result = PatientIntegrationResponse(
            id=pi.id,
            patient_id=pi.patient_id,
            integration_id=pi.integration_id,
            integration_slug=pi.integration.slug if pi.integration else None,
            integration_name=pi.integration.name if pi.integration else None,
            is_enabled=pi.is_enabled,
            settings=pi.settings,
            last_sync_at=pi.last_sync_at,
            last_sync_status=pi.last_sync_status,
            last_sync_error=pi.last_sync_error,
            sync_count=pi.sync_count,
            created_at=pi.created_at,
        )
        results.append(result)
    
    return results


@router.post("/patient/{patient_id}", response_model=PatientIntegrationResponse)
async def create_patient_integration(
    patient_id: int,
    data: PatientIntegrationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id)
):
    """
    Set up a new integration for a patient.
    """
    
    # Verify patient exists and belongs to account
    patient = db.query(Patient).filter(
        Patient.id == patient_id,
        Patient.account_id == account_id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Get or create integration in DB
    integration = _get_or_create_integration(db, data.integration_slug)
    integration_class = get_integration(data.integration_slug)
    
    # Check for existing active integration
    existing = db.query(PatientIntegration).filter(
        PatientIntegration.patient_id == patient_id,
        PatientIntegration.integration_id == integration.id,
        PatientIntegration.is_enabled == True
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail="Integration already configured for this patient"
        )
    
    now = datetime.utcnow()
    
    # Create the integration record
    patient_integration = PatientIntegration(
        account_id=account_id,
        patient_id=patient_id,
        integration_id=integration.id,
        settings=data.settings,
        is_enabled=integration_class.auth_type == "none",  # Auto-activate if no auth needed
        created_at=now,
        updated_at=now,
    )
    
    db.add(patient_integration)
    db.commit()
    db.refresh(patient_integration)
    
    return PatientIntegrationResponse(
        id=patient_integration.id,
        patient_id=patient_integration.patient_id,
        integration_id=patient_integration.integration_id,
        integration_slug=integration.slug,
        integration_name=integration.name,
        is_enabled=patient_integration.is_enabled,
        settings=patient_integration.settings,
        last_sync_at=patient_integration.last_sync_at,
        last_sync_status=patient_integration.last_sync_status,
        last_sync_error=patient_integration.last_sync_error,
        sync_count=patient_integration.sync_count,
        created_at=patient_integration.created_at,
    )


@router.put("/patient/{patient_id}/{integration_id}", response_model=PatientIntegrationResponse)
async def update_patient_integration(
    patient_id: int,
    integration_id: int,
    settings: dict,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id)
):
    """
    Update settings for a patient's integration.
    """
    
    patient_integration = db.query(PatientIntegration).options(
        joinedload(PatientIntegration.integration)
    ).filter(
        PatientIntegration.id == integration_id,
        PatientIntegration.patient_id == patient_id,
        PatientIntegration.account_id == account_id,
    ).first()
    
    if not patient_integration:
        raise HTTPException(status_code=404, detail="Patient integration not found")
    
    patient_integration.settings = settings
    patient_integration.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(patient_integration)
    
    return PatientIntegrationResponse(
        id=patient_integration.id,
        patient_id=patient_integration.patient_id,
        integration_id=patient_integration.integration_id,
        integration_slug=patient_integration.integration.slug if patient_integration.integration else None,
        integration_name=patient_integration.integration.name if patient_integration.integration else None,
        is_enabled=patient_integration.is_enabled,
        settings=patient_integration.settings,
        last_sync_at=patient_integration.last_sync_at,
        last_sync_status=patient_integration.last_sync_status,
        last_sync_error=patient_integration.last_sync_error,
        sync_count=patient_integration.sync_count,
        created_at=patient_integration.created_at,
    )


@router.delete("/patient/{patient_id}/{integration_id}")
async def delete_patient_integration(
    patient_id: int,
    integration_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id)
):
    """
    Deactivate (soft delete) a patient's integration.
    """
    
    patient_integration = db.query(PatientIntegration).filter(
        PatientIntegration.id == integration_id,
        PatientIntegration.patient_id == patient_id,
        PatientIntegration.account_id == account_id,
    ).first()
    
    if not patient_integration:
        raise HTTPException(status_code=404, detail="Patient integration not found")
    
    patient_integration.is_enabled = False
    patient_integration.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {"status": "success", "message": "Integration deactivated"}


# ============================================================================
# OAuth Flow
# ============================================================================

@router.get("/patient/{patient_id}/{integration_id}/oauth/start")
async def start_oauth_flow(
    patient_id: int,
    integration_id: int,
    redirect_url: str = Query(..., description="URL to redirect after OAuth completes"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access)
):
    """
    Start OAuth flow for an integration.
    """
    
    patient_integration = db.query(PatientIntegration).options(
        joinedload(PatientIntegration.integration)
    ).filter(
        PatientIntegration.id == integration_id,
        PatientIntegration.patient_id == patient_id,
        PatientIntegration.account_id == account_id,
    ).first()
    
    if not patient_integration:
        raise HTTPException(status_code=404, detail="Patient integration not found")
    
    slug = patient_integration.integration.slug
    integration_class = get_integration(slug)
    if not integration_class:
        raise HTTPException(status_code=404, detail="Integration class not found")
    
    if integration_class.auth_type != "oauth2":
        raise HTTPException(status_code=400, detail="Integration does not use OAuth2")
    
    # Generate state token for CSRF protection
    state = str(uuid4())
    
    # Store state with metadata (expires in 10 minutes)
    _oauth_states[state] = {
        "patient_integration_id": integration_id,
        "redirect_url": redirect_url,
        "created_at": datetime.utcnow(),
    }
    
    # Build callback URL
    base_url = os.getenv("API_BASE_URL", str(request.base_url).rstrip("/"))
    callback_url = f"{base_url}/api/integrations/oauth/callback"
    
    # Get authorization URL
    auth_url = integration_class.get_oauth_url(state, callback_url)
    
    if not auth_url:
        raise HTTPException(
            status_code=500, 
            detail="Could not generate OAuth URL. Check API credentials."
        )
    
    return {
        "authorization_url": auth_url,
        "state": state,
    }


@router.get("/oauth/callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    OAuth callback endpoint.
    
    This is called by the OAuth provider after user authorization.
    """
    # Check for errors from provider
    if error:
        return RedirectResponse(url=f"/care/integrations?error={error}")
    
    # Validate state
    state_data = _oauth_states.pop(state, None)
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    
    # Verify state hasn't expired
    if datetime.utcnow() - state_data["created_at"] > timedelta(minutes=10):
        raise HTTPException(status_code=400, detail="OAuth state expired")
    
    # Get patient integration
    patient_integration = db.query(PatientIntegration).options(
        joinedload(PatientIntegration.integration)
    ).filter(
        PatientIntegration.id == state_data["patient_integration_id"]
    ).first()
    
    if not patient_integration:
        raise HTTPException(status_code=404, detail="Patient integration not found")
    
    slug = patient_integration.integration.slug
    integration_class = get_integration(slug)
    if not integration_class:
        raise HTTPException(status_code=404, detail="Integration class not found")
    
    # Build callback URL for token exchange
    base_url = os.getenv("API_BASE_URL", "http://localhost:8000")
    callback_url = f"{base_url}/api/integrations/oauth/callback"
    
    try:
        # Create integration instance and authenticate
        integration = integration_class()
        credentials = await integration.authenticate({
            "code": code,
            "redirect_uri": callback_url,
        })
        
        # Store credentials (should be encrypted in production)
        patient_integration.credentials = credentials
        patient_integration.is_enabled = True
        patient_integration.updated_at = datetime.utcnow()
        
        db.commit()
        
        # Redirect to frontend success page
        redirect_url = state_data.get("redirect_url", "/care/integrations")
        return RedirectResponse(url=f"{redirect_url}?success=true")
        
    except AuthenticationError as e:
        redirect_url = state_data.get("redirect_url", "/care/integrations")
        return RedirectResponse(url=f"{redirect_url}?error={str(e)}")


# ============================================================================
# Sync Operations
# ============================================================================

@router.post("/patient/{patient_id}/{integration_id}/sync", response_model=SyncResultResponse)
async def sync_integration(
    patient_id: int,
    integration_id: int,
    since: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id)
):
    """
    Trigger manual sync for an integration.
    """
    
    patient_integration = db.query(PatientIntegration).options(
        joinedload(PatientIntegration.integration)
    ).filter(
        PatientIntegration.id == integration_id,
        PatientIntegration.patient_id == patient_id,
        PatientIntegration.account_id == account_id,
        PatientIntegration.is_enabled == True
    ).first()
    
    if not patient_integration:
        raise HTTPException(status_code=404, detail="Active patient integration not found")
    
    slug = patient_integration.integration.slug
    integration_class = get_integration(slug)
    if not integration_class:
        raise HTTPException(status_code=404, detail="Integration class not found")
    
    # Create integration instance with credentials
    integration = integration_class(patient_integration)
    
    try:
        # Use last sync time if no since parameter
        if not since and patient_integration.last_sync_at:
            since = patient_integration.last_sync_at
        
        # Perform sync
        result = await integration.sync_data(since=since)
        
        if result.success:
            # Store new readings
            readings_stored = 0
            for reading in result.readings:
                # Check for duplicate via external_id
                if reading.external_id:
                    existing = db.query(Vital).filter(
                        Vital.external_id == reading.external_id
                    ).first()
                    if existing:
                        continue
                
                now = datetime.utcnow()
                vital = Vital(
                    account_id=account_id,
                    patient_id=patient_id,
                    vital_type=reading.vital_type,
                    vital_group=reading.vital_group,
                    value=reading.value,
                    unit=reading.unit,
                    source=slug,
                    device_id=reading.device_id,
                    external_id=reading.external_id,
                    raw_data=reading.raw_data,
                    notes=reading.notes,
                    timestamp=reading.timestamp,
                    created_at=now,
                )
                db.add(vital)
                readings_stored += 1
            
            # Update sync timestamp
            patient_integration.last_sync_at = datetime.utcnow()
            patient_integration.last_sync_status = "success"
            patient_integration.last_sync_error = None
            patient_integration.sync_count = (patient_integration.sync_count or 0) + 1
            patient_integration.updated_at = datetime.utcnow()
            
            # Update or create devices
            for device_info in result.devices_found:
                device = db.query(IntegrationDevice).filter(
                    IntegrationDevice.patient_integration_id == integration_id,
                    IntegrationDevice.device_id == device_info.device_id
                ).first()
                
                now = datetime.utcnow()
                if device:
                    device.last_seen_at = device_info.last_seen_at
                    device.device_name = device_info.device_name
                    device.device_model = device_info.device_model
                    device.updated_at = now
                else:
                    device = IntegrationDevice(
                        patient_integration_id=integration_id,
                        device_id=device_info.device_id,
                        device_type=device_info.device_type,
                        device_name=device_info.device_name,
                        device_model=device_info.device_model,
                        last_seen_at=device_info.last_seen_at,
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(device)
            
            db.commit()
            
            return SyncResultResponse(
                success=True,
                readings_count=readings_stored,
                sync_timestamp=result.sync_timestamp,
            )
        else:
            patient_integration.last_sync_status = "failed"
            patient_integration.last_sync_error = result.error_message
            patient_integration.updated_at = datetime.utcnow()
            db.commit()
            
            return SyncResultResponse(
                success=False,
                readings_count=0,
                error_message=result.error_message,
                sync_timestamp=result.sync_timestamp,
            )
            
    except (AuthenticationError, SyncError) as e:
        patient_integration.last_sync_status = "failed"
        patient_integration.last_sync_error = str(e)
        patient_integration.updated_at = datetime.utcnow()
        db.commit()
        
        return SyncResultResponse(
            success=False,
            readings_count=0,
            error_message=str(e),
            sync_timestamp=datetime.utcnow(),
        )


# ============================================================================
# Device Management
# ============================================================================

@router.get("/patient/{patient_id}/{integration_id}/devices", response_model=List[IntegrationDeviceResponse])
async def list_integration_devices(
    patient_id: int,
    integration_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    _: bool = Depends(require_read_access)
):
    """
    List devices discovered for an integration.
    """
    
    # Verify integration exists and belongs to patient/account
    patient_integration = db.query(PatientIntegration).filter(
        PatientIntegration.id == integration_id,
        PatientIntegration.patient_id == patient_id,
        PatientIntegration.account_id == account_id,
    ).first()
    
    if not patient_integration:
        raise HTTPException(status_code=404, detail="Patient integration not found")
    
    devices = db.query(IntegrationDevice).filter(
        IntegrationDevice.patient_integration_id == integration_id
    ).all()
    
    return devices


@router.post("/patient/{patient_id}/{integration_id}/discover")
async def discover_devices(
    patient_id: int,
    integration_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id)
):
    """
    Trigger device discovery for an integration.
    """
    
    patient_integration = db.query(PatientIntegration).options(
        joinedload(PatientIntegration.integration)
    ).filter(
        PatientIntegration.id == integration_id,
        PatientIntegration.patient_id == patient_id,
        PatientIntegration.account_id == account_id,
        PatientIntegration.is_enabled == True
    ).first()
    
    if not patient_integration:
        raise HTTPException(status_code=404, detail="Active patient integration not found")
    
    slug = patient_integration.integration.slug
    integration_class = get_integration(slug)
    if not integration_class:
        raise HTTPException(status_code=404, detail="Integration class not found")
    
    integration = integration_class(patient_integration)
    
    try:
        devices = await integration.fetch_devices()
        
        devices_added = 0
        now = datetime.utcnow()
        for device_info in devices:
            existing = db.query(IntegrationDevice).filter(
                IntegrationDevice.patient_integration_id == integration_id,
                IntegrationDevice.device_id == device_info.device_id
            ).first()
            
            if existing:
                existing.last_seen_at = device_info.last_seen_at
                existing.device_name = device_info.device_name
                existing.device_model = device_info.device_model
                existing.updated_at = now
            else:
                device = IntegrationDevice(
                    patient_integration_id=integration_id,
                    device_id=device_info.device_id,
                    device_type=device_info.device_type,
                    device_name=device_info.device_name,
                    device_model=device_info.device_model,
                    last_seen_at=device_info.last_seen_at,
                    created_at=now,
                    updated_at=now,
                )
                db.add(device)
                devices_added += 1
        
        db.commit()
        
        return {
            "success": True,
            "devices_found": len(devices),
            "devices_added": devices_added,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
