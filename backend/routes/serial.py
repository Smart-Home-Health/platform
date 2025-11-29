"""
Serial device communication routes
"""
import os
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from db import get_db
from crud.settings import get_setting
from state_manager import get_serial_log, is_serial_mode

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/serial", tags=["serial"])


@router.get("/log")
async def get_serial_log_endpoint():
    """Return the last raw serial lines for preview."""
    try:
        return {"lines": get_serial_log()}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.get("/status")
async def get_serial_status(db: Session = Depends(get_db)):
    """Return serial reader status and configured baud rate."""
    try:
        configured_baud = get_setting(db, "baud_rate", os.getenv("BAUD_RATE", 19200))
        try:
            configured_baud = int(configured_baud)
        except Exception:
            pass
        return {
            "serial_active": is_serial_mode(),
            "baud_rate": configured_baud
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/reconnect")
async def reconnect_serial():
    """Reconnect the serial port (useful after changing baud rate)."""
    try:
        from main import serial_module
        if serial_module:
            serial_module.reconnect()
            return {"status": "success", "message": "Serial port will reconnect with updated settings"}
        else:
            return JSONResponse(status_code=503, content={"error": "Serial module not available"})
    except Exception as e:
        logger.error(f"Error reconnecting serial: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
