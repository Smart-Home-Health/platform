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
from pydantic import BaseModel, Field


# Pydantic models for settings moved from routes/settings.py
class SettingIn(BaseModel):
    value: Any
    data_type: str = Field(default="string", pattern="^(string|int|float|bool|json)$")
    description: Optional[str] = None


class SettingUpdate(BaseModel):
    settings: Dict[str, Any] = Field(..., min_items=1)


class SettingResponse(BaseModel):
    key: str
    value: Any


class SettingDeleteResponse(BaseModel):
    status: str
    message: str


class SettingCreateResponse(BaseModel):
    key: str
    value: Any
    status: str


class AllSettingsResponse(BaseModel):
    """Response model for getting all settings"""
    settings: Dict[str, Any]
