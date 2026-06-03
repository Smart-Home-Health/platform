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
Pydantic models for schedule-related API requests/responses
"""
from typing import List, Optional
from pydantic import BaseModel


class CompleteItemRequest(BaseModel):
    """Request model for completing a scheduled item (medication, nutrition, or care task)"""
    schedule_id: int
    scheduled_time: str  # ISO format datetime string
    patient_id: int
    user_id: Optional[int] = None
    notes: Optional[str] = None
    completed_at: Optional[str] = None  # ISO format - when actually completed (defaults to now)
    # Medication-specific
    dose_amount: Optional[float] = None
    dose_unit: Optional[str] = None
    # Nutrition-specific
    amount: Optional[float] = None
    amount_unit: Optional[str] = None
    item_name: Optional[str] = None
    # Set to True to bypass the >1h-early administration guard
    early_override: bool = False


class BulkCompleteRequest(BaseModel):
    """Request model for completing multiple scheduled items at once"""
    items: List[CompleteItemRequest]
