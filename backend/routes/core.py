# Smart Home Health Hub
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""
Core application routes - basic endpoints, websockets, limits
"""
import os
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from db import get_db
from crud.users import has_any_admin_user

logger = logging.getLogger("app")

router = APIRouter()

# Environment variables for limits
MIN_SPO2 = os.getenv("MIN_SPO2")
MAX_SPO2 = os.getenv("MAX_SPO2")
MIN_BPM = os.getenv("MIN_BPM")
MAX_BPM = os.getenv("MAX_BPM")


@router.websocket("/ws/sensors")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time sensor data using event-driven system."""
    try:
        # Get the WebSocket module from the main application
        from main import get_modules
        modules = get_modules()
        websocket_module = modules.get("websocket")
        
        if websocket_module:
            # Use the event-driven WebSocket module to handle the connection
            await websocket_module.handle_websocket_connection(websocket)
        else:
            # If module not available, close connection with error
            logger.error("WebSocket module not available - event-driven system required")
            await websocket.close(code=1011, reason="WebSocket module not available")
                
    except Exception as e:
        logger.error(f"Error in WebSocket endpoint: {e}")
        try:
            await websocket.close()
        except:
            pass


@router.get("/first-run")
def check_first_run_status(db: Session = Depends(get_db)):
    """
    Check if this is a first-run scenario (no admin users exist).
    Public endpoint used by frontend to determine if setup wizard is needed.
    """
    has_admin = has_any_admin_user(db)
    return {
        "is_first_run": not has_admin,
        "has_admin": has_admin,
        "message": "Admin user exists" if has_admin else "First run - admin setup required"
    }


@router.get("/limits")
def get_limits():
    return {
        "spo2": {"min": MIN_SPO2, "max": MAX_SPO2},
        "bpm": {"min": MIN_BPM, "max": MAX_BPM}
    }


# Test endpoint
@router.get("/api/test")
async def test_endpoint():
    return {"status": "success", "message": "API is working"}


# Dev endpoint to trigger websocket broadcast
@router.post("/api/dev/broadcast")
async def trigger_broadcast():
    """Trigger a websocket broadcast for development/testing purposes"""
    try:
        # Get the WebSocket module from the main application
        from main import get_modules
        modules = get_modules()
        websocket_module = modules.get("websocket")
        
        if websocket_module:
            # Use the event-driven system to broadcast
            await websocket_module.broadcast_full_state()
            return {"status": "success", "message": "Event-driven websocket broadcast triggered"}
        else:
            logger.warning("WebSocket module not available for broadcast")
            return {"status": "warning", "message": "WebSocket module not available - event-driven system required"}
    except Exception as e:
        logger.error(f"Error triggering broadcast: {e}")
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error triggering broadcast: {str(e)}"}
        )
