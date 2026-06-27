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
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, validator


# Pydantic models for MQTT
class MQTTTopicConfig(BaseModel):
    enabled: bool = True
    broadcast_topic: Optional[str] = None
    listen_topic: Optional[str] = None
    # For nutrition topics which have multiple sub-topics
    water_broadcast_topic: Optional[str] = None
    water_listen_topic: Optional[str] = None
    calories_broadcast_topic: Optional[str] = None
    calories_listen_topic: Optional[str] = None


class MQTTSettings(BaseModel):
    mqtt_enabled: Optional[bool] = None
    mqtt_broker: Optional[str] = Field(None, max_length=255)
    mqtt_port: Optional[int] = Field(None, ge=1, le=65535)
    mqtt_username: Optional[str] = Field(None, max_length=255)
    mqtt_password: Optional[str] = Field(None, max_length=255)
    mqtt_client_id: Optional[str] = Field(None, max_length=255)
    mqtt_discovery_enabled: Optional[bool] = None
    mqtt_base_topic: Optional[str] = Field(None, max_length=255)
    topics: Optional[Dict[str, MQTTTopicConfig]] = None


class MQTTConnectionTest(BaseModel):
    mqtt_broker: str = Field(..., min_length=1, max_length=255)
    mqtt_port: int = Field(default=1883, ge=1, le=65535)
    mqtt_client_id: str = Field(default="test_client", max_length=255)
    mqtt_username: Optional[str] = Field(None, max_length=255)
    mqtt_password: Optional[str] = Field(None, max_length=255)
    
    @validator('mqtt_broker')
    def validate_broker(cls, v):
        if not v or not v.strip():
            raise ValueError('MQTT broker address cannot be empty')
        return v.strip()


class MQTTDiscoveryRequest(BaseModel):
    patient_id: Optional[int] = Field(default=None, description="If set, run discovery for this patient only; otherwise all enabled patients")


class MQTTPatientConfigUpdate(BaseModel):
    """Admin: enable MQTT for a patient and set section permissions (get/set/both/off)"""
    enabled: bool = True
    sections: Optional[Dict[str, str]] = Field(default_factory=dict)  # section -> "get"|"set"|"both"|"off"


class MQTTPatientConfigResponse(BaseModel):
    """Per-patient MQTT config for admin list"""
    patient_id: int
    patient_name: Optional[str] = None
    enabled: bool
    sections: Dict[str, str] = Field(default_factory=dict)
    integration_id: Optional[int] = None  # PatientIntegration.id when exists


class MQTTSettingsResponse(BaseModel):
    """Response for GET /api/mqtt/settings - types match get_setting() stored values."""
    mqtt_enabled: Optional[bool] = None
    mqtt_broker: Optional[str] = None
    mqtt_port: Optional[int] = None
    mqtt_username: Optional[str] = None
    mqtt_password: Optional[str] = None
    mqtt_client_id: Optional[str] = None
    mqtt_discovery_enabled: Optional[bool] = None
    mqtt_base_topic: Optional[str] = None
    topics: Dict[str, Any] = {}
