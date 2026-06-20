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
MQTT Service - High-level MQTT initialization and lifecycle management
"""
import logging
from typing import Optional, Tuple, Callable
from .client import MQTTManager
from .publisher import MQTTPublisher
from .handlers import create_message_handlers
from .discovery import send_mqtt_discovery
from .settings import get_mqtt_settings
from crud.settings import get_setting
from db import get_db

logger = logging.getLogger('mqtt.service')

class MQTTService:
    """High-level MQTT service management"""
    
    def __init__(self):
        self.mqtt_manager: Optional[MQTTManager] = None
        self.mqtt_publisher: Optional[MQTTPublisher] = None
        self.mqtt_client = None
        
    def initialize(self, loop, update_sensor_callback: Callable) -> Tuple[Optional[MQTTManager], Optional[MQTTPublisher]]:
        """
        Initialize MQTT system with all components
        
        Args:
            loop: asyncio event loop
            update_sensor_callback: Function to call for sensor updates
            
        Returns:
            Tuple of (mqtt_manager, mqtt_publisher) or (None, None) if disabled
        """
        logger.info("[mqtt.service] Initializing MQTT system")
        
        # Initialize MQTT components
        self.mqtt_manager = MQTTManager(loop)
        self.mqtt_publisher = MQTTPublisher()
        
        # Create message handlers for incoming MQTT messages
        message_handlers = create_message_handlers(update_sensor_callback)
        for vital_type, handler in message_handlers.items():
            self.mqtt_manager.set_message_handler(vital_type, handler)
        
        # Create and connect MQTT client if enabled
        self.mqtt_client = self.mqtt_manager.create_client()
        
        if self.mqtt_client:  # Only proceed if MQTT is enabled and configured
            try:
                # Connect to MQTT broker
                if self.mqtt_manager.connect():
                    logger.info("[mqtt.service] Connected to MQTT broker")
                    
                    # Set up the publisher with the client
                    self.mqtt_publisher.set_client(self.mqtt_client)
                    
                    # Send MQTT discovery if enabled
                    self._send_discovery_if_enabled()
                    
                    # Set availability to online
                    self._publish_availability_status("online")
                    
                    return self.mqtt_manager, self.mqtt_publisher
                else:
                    logger.error("[mqtt.service] Failed to connect to MQTT broker")
                    return None, None
            except Exception as e:
                logger.error(f"[mqtt.service] Failed to initialize MQTT: {e}")
                return None, None
        else:
            logger.info("[mqtt.service] MQTT is disabled or not configured")
            return None, None
            
    def shutdown(self):
        """Shutdown MQTT service gracefully"""
        if self.mqtt_client:
            try:
                # Set availability to offline
                self._publish_availability_status("offline")
                
                # Properly disconnect using the manager
                if self.mqtt_manager:
                    self.mqtt_manager.disconnect()
                else:
                    self.mqtt_client.disconnect()
                    
                logger.info("[mqtt.service] MQTT service shutdown complete")
            except Exception as e:
                logger.error(f"[mqtt.service] Failed to shutdown MQTT service: {e}")
        else:
            logger.info("[mqtt.service] No MQTT client to disconnect")
            
    def _send_discovery_if_enabled(self):
        """Send MQTT discovery messages if enabled in settings"""
        db = next(get_db())
        try:
            discovery_enabled = get_setting(db, 'mqtt_discovery_enabled', True)

            if discovery_enabled:
                send_mqtt_discovery(self.mqtt_client)
                logger.info("[mqtt.service] MQTT discovery messages sent")
        finally:
            db.close()
            
    def _publish_availability_status(self, status: str):
        """Publish availability status (online/offline) to MQTT"""
        try:
            mqtt_settings = get_mqtt_settings()
            base_topic = mqtt_settings.get('base_topic', 'shh')
            self.mqtt_client.publish(f"{base_topic}/availability", status, retain=True)
            logger.info(f"[mqtt.service] Published {status} status to {base_topic}/availability")
        except Exception as e:
            logger.error(f"[mqtt.service] Failed to publish availability status: {e}")

# Global service instance
_mqtt_service = None

def get_mqtt_service() -> MQTTService:
    """Get the global MQTT service instance"""
    global _mqtt_service
    if _mqtt_service is None:
        _mqtt_service = MQTTService()
    return _mqtt_service

def initialize_mqtt_service(loop, update_sensor_callback: Callable) -> Tuple[Optional[MQTTManager], Optional[MQTTPublisher]]:
    """
    Initialize the global MQTT service
    
    Args:
        loop: asyncio event loop
        update_sensor_callback: Function to call for sensor updates
        
    Returns:
        Tuple of (mqtt_manager, mqtt_publisher) or (None, None) if disabled
    """
    service = get_mqtt_service()
    return service.initialize(loop, update_sensor_callback)

def shutdown_mqtt_service():
    """Shutdown the global MQTT service"""
    global _mqtt_service
    if _mqtt_service:
        _mqtt_service.shutdown()
        _mqtt_service = None
