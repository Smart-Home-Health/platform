"""
Settings management routes
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from db import get_db
from dependencies import require_read_access
from crud.settings import get_all_settings, get_setting, save_setting, delete_setting
from models.settings import (
    SettingIn,
    SettingUpdate,
    SettingResponse,
    SettingDeleteResponse,
    SettingCreateResponse,
)

logger = logging.getLogger("app")

def publish_event(event_type: str, data: dict):
    """Helper function to publish events to the event bus"""
    try:
        from main import get_modules
        modules = get_modules()
        event_bus = modules.get("event_bus")
        if event_bus:
            import asyncio
            # Create a simple event dict since we don't need full event classes for settings
            event = {"type": event_type, "data": data}
            asyncio.create_task(event_bus.publish(event, topic=event_type))
    except Exception as e:
        logger.error(f"Failed to publish event {event_type}: {e}")

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_all_settings_endpoint(db: Session = Depends(get_db)):
    """Get all settings"""
    return get_all_settings(db)


@router.get("/{key}", response_model=SettingResponse)
async def get_setting_api(key: str, default: Optional[str] = None, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get a specific setting by key"""
    value = get_setting(db, key, default)
    if value is None and default is None:
        raise HTTPException(status_code=404, detail=f"Setting {key} not found")
    return SettingResponse(key=key, value=value)


@router.post("/{key}", response_model=SettingCreateResponse)
async def set_setting(key: str, setting: SettingIn, db: Session = Depends(get_db)):
    """Set a specific setting"""
    success = save_setting(
        db,
        key=key,
        value=setting.value,
        data_type=setting.data_type,
        description=setting.description
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save setting")
    
    # Publish settings change event to trigger WebSocket broadcast
    publish_event("settings_changed", {"key": key, "value": setting.value})
    
    return SettingCreateResponse(key=key, value=setting.value, status="success")


@router.post("")
async def update_multiple_settings(settings: SettingUpdate, db: Session = Depends(get_db)):
    """Update multiple settings at once"""
    results = {}
    
    for key, value in settings.settings.items():
        if isinstance(value, dict) and "value" in value:
            # Handle objects with value, data_type, description
            success = save_setting(
                db, 
                key, 
                value["value"], 
                value.get("data_type", "string"), 
                value.get("description", "")
            )
        else:
            # Handle simple key-value pairs
            success = save_setting(db, key, value)
            
        results[key] = "success" if success else "failed"
    
    # Publish settings change event to trigger WebSocket broadcast
    publish_event("settings_changed", {"results": results})
    
    return results


@router.delete("/{key}", response_model=SettingDeleteResponse)
async def delete_setting_endpoint(key: str, db: Session = Depends(get_db)):
    """Delete a setting"""
    success = delete_setting(db, key)
    if not success:
        raise HTTPException(status_code=404, detail=f"Setting {key} not found")
    
    # Publish settings change event to trigger WebSocket broadcast
    publish_event("settings_changed", {"deleted_key": key})
    
    return SettingDeleteResponse(status="success", message=f"Setting {key} deleted")
