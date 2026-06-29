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
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


# Pydantic models for monitoring
class AlertAcknowledge(BaseModel):
    oxygen_used: Optional[float] = Field(None, ge=0)
    oxygen_highest: Optional[float] = Field(None, ge=0)
    oxygen_unit: Optional[str] = Field(None, max_length=20)


class MonitoringAlertResponse(BaseModel):
    id: int
    alert_type: str
    alert_message: str
    severity: str
    acknowledged: bool
    acknowledged_at: Optional[datetime]
    oxygen_used: bool
    oxygen_highest: Optional[float]
    oxygen_unit: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class PulseOxReading(BaseModel):
    id: int
    timestamp: datetime
    spo2: Optional[float]
    bpm: Optional[float]
    perfusion: Optional[float]
    
    class Config:
        from_attributes = True


class PulseOxDataResponse(BaseModel):
    date: str
    readings: list[PulseOxReading]
    count: int


class DateValidation(BaseModel):
    date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$')


class MonitoringDataQuery(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    limit: int = Field(default=1000, ge=1, le=10000)
