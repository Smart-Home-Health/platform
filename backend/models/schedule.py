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


class BulkCompleteRequest(BaseModel):
    """Request model for completing multiple scheduled items at once"""
    items: List[CompleteItemRequest]
