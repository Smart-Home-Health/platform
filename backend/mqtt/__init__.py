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
# MQTT Package for Smart Home Health Hub
from .client import get_mqtt_client, MQTTManager
from .publisher import MQTTPublisher
from .discovery import send_mqtt_discovery
from .handlers import MQTTMessageHandlers, create_message_handlers
from .settings import get_mqtt_settings, is_mqtt_enabled, get_vital_topic_config
from .service import initialize_mqtt_service, shutdown_mqtt_service, get_mqtt_service

__all__ = [
    'get_mqtt_client', 
    'MQTTManager', 
    'MQTTPublisher', 
    'send_mqtt_discovery',
    'MQTTMessageHandlers',
    'create_message_handlers',
    'get_mqtt_settings',
    'is_mqtt_enabled',
    'get_vital_topic_config',
    'initialize_mqtt_service',
    'shutdown_mqtt_service',
    'get_mqtt_service'
]
