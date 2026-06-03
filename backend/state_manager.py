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
# state_manager.py
"""
Legacy state manager - maintaining only essential functions for backward compatibility.
Most functionality has been moved to the event-driven architecture in modules/.
"""

import logging
from contextlib import contextmanager
from typing import Optional

# Local imports
from db import get_db

logger = logging.getLogger("state_manager")

# Database session wrapper for legacy compatibility
@contextmanager
def get_db_session():
    """Context manager for database sessions - legacy compatibility.
    Rolls back on exception so the transaction is not left aborted for reuse.
    """
    db = next(get_db())
    try:
        yield db
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        db.close()


def get_current_patient_id() -> Optional[int]:
    """Get the patient_id for background/no-user-context work.

    Kept for API stability — internally resolves to the background-patient
    setting (see crud.patients.get_background_patient_id). At the time of
    writing this helper has no live callers; left in place so any future
    background path that imports it gets the right semantics.
    """
    try:
        with get_db_session() as db:
            from crud.patients import get_background_patient_id
            return get_background_patient_id(db)
    except Exception as e:
        logger.error(f"Error getting current patient ID: {e}")
        return None


def ensure_default_patient() -> Optional[int]:
    """Ensure a default patient exists and return its ID"""
    try:
        with get_db_session() as db:
            from crud.patients import get_or_create_default_patient
            patient = get_or_create_default_patient(db)
            return patient.id if patient else None
    except Exception as e:
        logger.error(f"Error ensuring default patient: {e}")
        return None


def get_serial_log():
    """Legacy: serial is handled by external shh-reader; return empty list."""
    return []


def is_serial_mode() -> bool:
    """Legacy: serial is handled by external shh-reader; return False."""
    return False


def broadcast_state():
    """
    Legacy broadcast function - now handled by WebSocket module.
    Kept for backward compatibility.
    """
    logger.warning("Legacy broadcast_state() called - this should use the event system")
    # Event-driven system handles this now
    pass


def publish_specific_vital_to_mqtt(vital_type, vital_data):
    """
    Legacy MQTT publishing function - now handled by MQTT module.
    Kept for backward compatibility.
    """
    logger.warning(f"Legacy MQTT publish called for {vital_type} - this should use the event system")
    # Event-driven system handles this now
    pass


def update_sensor(*updates, from_mqtt=False):
    """
    Legacy sensor update function - now handled by event-driven modules.
    Kept for backward compatibility.
    """
    logger.warning("Legacy update_sensor() called - this should use the event system")
    # Event-driven system handles this now
    pass


# Legacy WebSocket management (for routes that haven't been updated yet)
websocket_clients = set()

def register_websocket_client(ws):
    """Legacy WebSocket registration - use WebSocket module instead"""
    logger.warning("Legacy WebSocket registration - use WebSocket module instead")
    websocket_clients.add(ws)


def unregister_websocket_client(ws):
    """Legacy WebSocket unregistration - use WebSocket module instead"""
    logger.warning("Legacy WebSocket unregistration - use WebSocket module instead") 
    websocket_clients.discard(ws)
