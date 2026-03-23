"""
MQTT Client and Manager - Handles MQTT connections and message handling
"""
import json
import logging
import paho.mqtt.client as mqtt
from typing import Optional, Callable, Dict, Any, Tuple
from .settings import get_mqtt_settings, get_enabled_topics, get_patients_with_mqtt_enabled, get_patient_set_topic

logger = logging.getLogger('mqtt.client')

class MQTTManager:
    """Manages MQTT client lifecycle and message handling"""
    
    def __init__(self, loop=None):
        self.loop = loop
        self.client: Optional[mqtt.Client] = None
        self.settings: Dict[str, Any] = {}
        self.message_handlers: Dict[str, Callable] = {}
        self._patient_set_handler: Optional[Callable] = None
        self._is_connected = False
        
    def is_connected(self) -> bool:
        """Check if MQTT client is connected"""
        return self._is_connected
        
    def set_message_handler(self, vital_type: str, handler: Callable):
        """Register a message handler for a specific vital type"""
        self.message_handlers[vital_type] = handler

    def set_patient_set_handler(self, handler: Callable):
        """Register handler for per-patient set topic: handler(patient_id, payload, topic, raw_data)"""
        self._patient_set_handler = handler
        
    def create_client(self) -> Optional[mqtt.Client]:
        """Create and configure MQTT client with database settings"""
        self.settings = get_mqtt_settings()
        
        # Don't create client if MQTT is disabled
        if not self.settings['enabled'] or not self.settings['broker']:
            logger.info("MQTT disabled or no broker configured")
            return None
            
        self.client = mqtt.Client(client_id=self.settings['client_id'])

        if self.settings['username'] and self.settings['password']:
            self.client.username_pw_set(self.settings['username'], self.settings['password'])

        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        
        # Set Last Will and Testament for availability
        base_topic = self.settings.get('base_topic', 'shh')
        availability_topic = f"{base_topic}/availability"
        self.client.will_set(availability_topic, payload="offline", qos=1, retain=True)
        
        return self.client
        
    def connect(self) -> bool:
        """Connect to MQTT broker"""
        if not self.client or not self.settings.get('broker'):
            logger.error("No MQTT client or broker configured")
            return False
            
        try:
            self.client.connect(self.settings['broker'], self.settings['port'], 60)
            self.client.loop_start()
            logger.info(f"Connecting to MQTT broker at {self.settings['broker']}:{self.settings['port']}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to MQTT broker: {e}")
            return False
            
    def disconnect(self):
        """Disconnect from MQTT broker"""
        if self.client:
            # Publish availability as 'offline' before disconnecting
            base_topic = self.settings.get('base_topic', 'shh')
            availability_topic = f"{base_topic}/availability"
            self.client.publish(availability_topic, payload="offline", qos=1, retain=True)
            
            self.client.loop_stop()
            self.client.disconnect()
            logger.info("Disconnected from MQTT broker")
            
    def _on_connect(self, client, userdata, flags, rc):
        """Handle MQTT connection"""
        if rc == 0:
            self._is_connected = True
            logger.info(f"Connected to MQTT Broker at {self.settings['broker']}:{self.settings['port']}")
            
            # Publish availability as 'online'
            base_topic = self.settings.get('base_topic', 'shh')
            availability_topic = f"{base_topic}/availability"
            client.publish(availability_topic, payload="online", qos=1, retain=True)
            logger.info(f"Published availability 'online' to {availability_topic}")
            
            # Subscribe to per-patient set topics (one wildcard for all patients)
            base_topic = self.settings.get('base_topic', 'shh')
            patient_set_wildcard = f"{base_topic}/patient/+/set"
            client.subscribe(patient_set_wildcard)
            logger.info(f"Subscribed to {patient_set_wildcard}")
            # Legacy: subscribe to enabled listen topics from global config
            enabled_topics = get_enabled_topics(self.settings)
            for topic_name, topic_path in enabled_topics.items():
                if topic_path and 'listen' in topic_name:
                    client.subscribe(topic_path)
                    logger.info(f"Subscribed to {topic_path}")
        else:
            self._is_connected = False
            logger.error(f"Failed to connect to MQTT Broker, code {rc}")

    def _on_disconnect(self, client, userdata, rc):
        """Handle MQTT disconnection"""
        self._is_connected = False
        if rc != 0:
            logger.warning("Unexpected MQTT disconnection")
        else:
            logger.info("MQTT client disconnected")

    def _on_message(self, client, userdata, msg):
        """Handle incoming MQTT messages"""
        raw_data = msg.payload.decode()
        logger.info(f"MQTT Message received on {msg.topic}: {raw_data}")

        # Per-patient set topic: .../patient/{id}/set
        patient_id = self._parse_patient_set_topic(msg.topic)
        if patient_id is not None and self._patient_set_handler:
            try:
                payload = json.loads(raw_data)
                if payload.get('origin') == self.settings['client_id']:
                    return
                self._patient_set_handler(patient_id, payload, msg.topic, raw_data)
            except json.JSONDecodeError:
                logger.error(f"Failed to decode JSON: {msg.payload}")
            except Exception as e:
                logger.error(f"Error processing patient set message: {e}")
            return

        # Legacy: find which vital this topic belongs to
        matching_vital = self._find_matching_vital(msg.topic)
        if matching_vital and matching_vital in self.message_handlers:
            try:
                payload = json.loads(raw_data)
                if payload.get('origin') == self.settings['client_id']:
                    return
                self.message_handlers[matching_vital](matching_vital, payload, msg.topic, raw_data)
            except json.JSONDecodeError:
                logger.error(f"Failed to decode JSON: {msg.payload}")
            except Exception as e:
                logger.error(f"Error processing message on {msg.topic}: {e}")
        else:
            logger.warning(f"Received message for unknown or unhandled topic: {msg.topic}")
            
    def _parse_patient_set_topic(self, topic: str) -> Optional[int]:
        """If topic is {base}/patient/{id}/set return id else None"""
        base = self.settings.get('base_topic', 'shh')
        prefix = f"{base}/patient/"
        suffix = "/set"
        if not topic.startswith(prefix) or not topic.endswith(suffix):
            return None
        mid = topic[len(prefix):-len(suffix)]
        try:
            return int(mid)
        except ValueError:
            return None

    def _find_matching_vital(self, topic: str) -> Optional[str]:
        """Find which vital type matches the given topic"""
        for vital_name, config in self.settings.get('topics', {}).items():
            if not config.get('enabled', False):
                continue
                
            if vital_name == 'nutrition':
                if (topic == config.get('water_listen_topic') or 
                    topic == config.get('calories_listen_topic')):
                    return vital_name
            else:
                if topic == config.get('listen_topic'):
                    return vital_name
                    
        return None

def get_mqtt_client(loop=None, message_handlers: Optional[Dict[str, Callable]] = None) -> Optional[mqtt.Client]:
    """
    Create and configure MQTT client with database settings (legacy function)
    
    Args:
        loop: asyncio event loop
        message_handlers: Dict of vital_type -> handler function
        
    Returns:
        Configured MQTT client or None if disabled
    """
    manager = MQTTManager(loop)
    
    # Register message handlers if provided
    if message_handlers:
        for vital_type, handler in message_handlers.items():
            manager.set_message_handler(vital_type, handler)
    
    client = manager.create_client()
    if client:
        manager.connect()
        
    return client
