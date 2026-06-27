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


# Pydantic models for care tasks
class CareTaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category_id: int = Field(..., gt=0)
    description: Optional[str] = None
    active: bool = True
    patient_id: Optional[int] = None


class CareTaskUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category_id: Optional[int] = Field(None, gt=0)
    description: Optional[str] = None
    active: Optional[bool] = None
    patient_id: Optional[int] = None


class CareTaskResponse(BaseModel):
    id: int
    patient_id: Optional[int]
    name: str
    category_id: int
    category_name: Optional[str]
    description: Optional[str]
    active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CareTaskScheduleCreate(BaseModel):
    cron_expression: str = Field(..., min_length=1)
    description: Optional[str] = Field(None, max_length=500)
    active: bool = True
    notes: Optional[str] = None
    patient_id: Optional[int] = None


class CareTaskScheduleUpdate(BaseModel):
    cron_expression: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = Field(None, max_length=500)
    active: Optional[bool] = None
    notes: Optional[str] = None
    patient_id: Optional[int] = None


class CareTaskScheduleResponse(BaseModel):
    id: int
    care_task_id: int
    patient_id: Optional[int]
    cron_expression: str
    description: Optional[str]
    active: bool
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CareTaskScheduleComplete(BaseModel):
    scheduled_time: Optional[datetime] = None
    notes: Optional[str] = None
    # Set to True to bypass the >1h-early administration guard
    early_override: bool = False


class CareTaskAdHocComplete(BaseModel):
    """Body for marking a care task done outside of a schedule (PRN)."""
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    patient_id: Optional[int] = None


class CareTaskCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    color: str = Field(default="#3B82F6", pattern="^#[0-9A-Fa-f]{6}$")


class CareTaskCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")


class CareTaskCategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: str
    is_default: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CronValidation(BaseModel):
    cron_expression: str = Field(..., min_length=1)


class CareTaskLogResponse(BaseModel):
    id: int
    care_task_id: int
    schedule_id: Optional[int]
    patient_id: Optional[int]
    completion_status: str
    scheduled_time: Optional[datetime]
    completed_at: datetime
    notes: Optional[str]
    completed_by: Optional[str]
    
    class Config:
        from_attributes = True
