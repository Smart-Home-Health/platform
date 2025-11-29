"""
Settings management routes
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict, Any
from db import get_db
from crud.settings import get_all_settings, get_setting, save_setting, delete_setting

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


# Pydantic models for request validation
class SettingIn(BaseModel):
    value: Any
    data_type: str = "string"
    description: Optional[str] = None


class SettingUpdate(BaseModel):
    settings: Dict[str, Any]


@router.get("")
async def get_all_settings_endpoint(db: Session = Depends(get_db)):
    """Get all settings"""
    return get_all_settings(db)


@router.get("/{key}")
async def get_setting_api(key: str, default: Optional[str] = None, db: Session = Depends(get_db)):
    """Get a specific setting by key"""
    value = get_setting(db, key, default)
    if value is None and default is None:
        raise HTTPException(status_code=404, detail=f"Setting {key} not found")
    return {"key": key, "value": value}


@router.post("/{key}")
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
    
    return {"key": key, "value": setting.value, "status": "success"}


@router.post("")
async def update_multiple_settings(settings: SettingUpdate, db: Session = Depends(get_db)):
    """Update multiple settings at once"""
    results = {}
    gpio_enabled_changed = False
    gpio_enabled_new = None
    baud_rate_changed = False
    
    for key, value in settings.settings.items():
        if key == "gpio_enabled":
            gpio_enabled_changed = True
            gpio_enabled_new = value
        
        if key == "baud_rate":
            baud_rate_changed = True
            
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
    
    # Handle GPIO state changes
    if gpio_enabled_changed:
        if gpio_enabled_new in [True, "true", "True", 1, "1"]:
            try:
                # Use event system to start GPIO monitoring
                publish_event("gpio_control", {"action": "start"})
                logger.info("[settings] GPIO monitoring start requested")
            except Exception as e:
                logger.error(f"[settings] Failed to request GPIO monitoring start: {e}")
        else:
            try:
                # Use event system to stop GPIO monitoring
                publish_event("gpio_control", {"action": "stop"})
                logger.info("[settings] GPIO monitoring stop requested")
            except Exception as e:
                logger.error(f"[settings] Failed to request GPIO monitoring stop: {e}")
    
    # Handle baud rate changes - reconnect serial port
    if baud_rate_changed:
        try:
            from main import serial_module
            if serial_module:
                serial_module.reconnect()
                logger.info("[settings] Serial port reconnection triggered due to baud rate change")
        except Exception as e:
            logger.error(f"[settings] Failed to reconnect serial port: {e}")
    
    return results


@router.delete("/{key}")
async def delete_setting_endpoint(key: str, db: Session = Depends(get_db)):
    """Delete a setting"""
    success = delete_setting(db, key)
    if not success:
        raise HTTPException(status_code=404, detail=f"Setting {key} not found")
    
    # Publish settings change event to trigger WebSocket broadcast
    publish_event("settings_changed", {"deleted_key": key})
    
    return {"status": "success", "message": f"Setting {key} deleted"}
