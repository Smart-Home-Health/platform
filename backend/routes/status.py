# Smart Home Health
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
# routes/status.py
"""
Status routes - provide information about module status and health
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import logging

logger = logging.getLogger("routes.status")

router = APIRouter(prefix="/api/status", tags=["status"])

@router.get("/modules")
async def get_module_status() -> Dict[str, Any]:
    """Get status of all system modules."""
    try:
        from main import get_modules
        modules = get_modules()
        
        status = {
            "event_bus": {
                "available": modules["event_bus"] is not None,
                "type": "EventBus"
            }
        }
        
        # Serial module status
        if modules["serial"]:
            status["serial"] = modules["serial"].get_status()
        else:
            status["serial"] = {"available": False, "error": "Module not initialized"}
        
        # GPIO module status  
        if modules["gpio"]:
            status["gpio"] = modules["gpio"].get_status()
        else:
            status["gpio"] = {"available": False, "error": "Module not initialized"}
        
        # WebSocket module status
        if modules["websocket"]:
            status["websocket"] = modules["websocket"].get_status()
        else:
            status["websocket"] = {"available": False, "error": "Module not initialized"}
        
        # MQTT module status
        if modules["mqtt"]:
            status["mqtt"] = modules["mqtt"].get_status()
        else:
            status["mqtt"] = {"available": False, "error": "Module not initialized"}
        
        # State module status
        if modules["state"]:
            status["state"] = modules["state"].get_status()
        else:
            status["state"] = {"available": False, "error": "Module not initialized"}
        
        return {
            "success": True,
            "modules": status
        }
        
    except Exception as e:
        logger.error(f"Error getting module status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """Simple health check endpoint."""
    return {
        "status": "healthy",
        "system": "event_driven_backend"
    }
