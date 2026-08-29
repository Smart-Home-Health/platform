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
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

from nutrition_vocab import (
    BRISTOL_MIN,
    BRISTOL_MAX,
    BRISTOL_LABELS,
    LOCATION_TYPES as _LOCATION_TYPES,
    FEED_ROUTES as _FEED_ROUTES,
    ITEM_TYPES,
    MEAL_TYPES,
)


# =====================
# NUTRITION INTAKE MODELS (existing)
# =====================

# Pydantic models for nutrition moved from routes/nutrition.py
class NutritionIntakeCreate(BaseModel):
    care_task_log_id: Optional[int] = None
    # Rows written by one logging action (a tube feed and its water flush, or
    # the components of a preset) share this.
    event_group_id: Optional[str] = Field(None, max_length=36)
    item_id: Optional[int] = None
    item_name: str = Field(..., min_length=1, max_length=200)
    item_type: str = Field(..., pattern="^(food|liquid|supplement|tube_feed)$")
    amount: float = Field(..., gt=0)
    amount_unit: str = Field(..., min_length=1, max_length=50)
    # Tube-feed delivery. Ignored for other intake types.
    feed_route: Optional[str] = Field(None, pattern="^(bolus|pump|gravity)$")
    rate_ml_per_hr: Optional[float] = Field(None, ge=0)
    duration_minutes: Optional[float] = Field(None, ge=0)
    calories: Optional[float] = Field(None, ge=0)
    protein_grams: Optional[float] = Field(None, ge=0)
    carbs_grams: Optional[float] = Field(None, ge=0)
    fat_grams: Optional[float] = Field(None, ge=0)
    fiber_grams: Optional[float] = Field(None, ge=0)
    sodium_mg: Optional[float] = Field(None, ge=0)
    consumed_at: Optional[datetime] = None
    # Link back to the scheduled feed this intake fulfils. A linked intake
    # marks the occurrence complete on the schedule board.
    schedule_id: Optional[int] = None
    scheduled_time: Optional[datetime] = None
    meal_type: Optional[str] = Field(None, pattern="^(breakfast|lunch|dinner|snack|other|supplement)$")
    notes: Optional[str] = None
    recorded_by: Optional[int] = None


class NutritionIntakeItemPart(BaseModel):
    """One item of a multi-item intake event (a feed's formula, a juice...)."""
    item_id: Optional[int] = None
    item_name: str = Field(..., min_length=1, max_length=200)
    item_type: str = Field(..., pattern="^(food|liquid|supplement|tube_feed)$")
    amount: float = Field(..., gt=0)
    amount_unit: str = Field(..., min_length=1, max_length=50)
    feed_route: Optional[str] = Field(None, pattern="^(bolus|pump|gravity)$")
    rate_ml_per_hr: Optional[float] = Field(None, ge=0)
    duration_minutes: Optional[float] = Field(None, ge=0)
    # When absent and item_id is set, facts are scaled server-side from the
    # saved item's per-unit values.
    calories: Optional[float] = Field(None, ge=0)
    protein_grams: Optional[float] = Field(None, ge=0)
    carbs_grams: Optional[float] = Field(None, ge=0)
    fat_grams: Optional[float] = Field(None, ge=0)
    fiber_grams: Optional[float] = Field(None, ge=0)
    sodium_mg: Optional[float] = Field(None, ge=0)


class NutritionIntakeEventCreate(BaseModel):
    """One feed, written as N intake rows sharing an event_group_id."""
    patient_id: int
    consumed_at: Optional[datetime] = None
    meal_type: Optional[str] = Field(None, pattern="^(breakfast|lunch|dinner|snack|other|supplement)$")
    notes: Optional[str] = None
    care_task_log_id: Optional[int] = None
    recorded_by: Optional[int] = None
    # Optional link to the scheduled feed this event fulfils.
    schedule_id: Optional[int] = None
    scheduled_time: Optional[datetime] = None
    items: List[NutritionIntakeItemPart] = Field(..., min_length=1)


class NutritionIntakeUpdate(BaseModel):
    item_id: Optional[int] = None
    item_name: Optional[str] = Field(None, min_length=1, max_length=200)
    item_type: Optional[str] = Field(None, pattern="^(food|liquid|supplement|tube_feed)$")
    amount: Optional[float] = Field(None, gt=0)
    amount_unit: Optional[str] = Field(None, min_length=1, max_length=50)
    feed_route: Optional[str] = Field(None, pattern="^(bolus|pump|gravity)$")
    rate_ml_per_hr: Optional[float] = Field(None, ge=0)
    duration_minutes: Optional[float] = Field(None, ge=0)
    calories: Optional[float] = Field(None, ge=0)
    protein_grams: Optional[float] = Field(None, ge=0)
    carbs_grams: Optional[float] = Field(None, ge=0)
    fat_grams: Optional[float] = Field(None, ge=0)
    fiber_grams: Optional[float] = Field(None, ge=0)
    sodium_mg: Optional[float] = Field(None, ge=0)
    consumed_at: Optional[datetime] = None
    meal_type: Optional[str] = Field(None, pattern="^(breakfast|lunch|dinner|snack|other|supplement)$")
    notes: Optional[str] = None
    recorded_by: Optional[int] = None


class NutritionIntakeResponse(BaseModel):
    id: int
    patient_id: int
    care_task_log_id: Optional[int]
    schedule_id: Optional[int] = None
    scheduled_time: Optional[datetime] = None
    event_group_id: Optional[str] = None
    item_id: Optional[int] = None
    item_name: str
    item_type: str
    amount: float
    amount_unit: str
    feed_route: Optional[str] = None
    rate_ml_per_hr: Optional[float] = None
    duration_minutes: Optional[float] = None
    calories: Optional[float]
    protein_grams: Optional[float]
    carbs_grams: Optional[float]
    fat_grams: Optional[float]
    fiber_grams: Optional[float]
    sodium_mg: Optional[float]
    consumed_at: datetime
    meal_type: Optional[str]
    notes: Optional[str]
    recorded_by: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NutritionIntakeEventResponse(BaseModel):
    event_group_id: str
    intakes: List[NutritionIntakeResponse]


# =====================
# NUTRITION GOAL MODELS
# =====================

class NutritionGoalCreate(BaseModel):
    """Create nutrition goals for a patient"""
    patient_id: int
    water_ml_target: Optional[float] = None
    total_fluid_ml_target: Optional[float] = None
    calories_target: Optional[float] = None
    calories_min: Optional[float] = None
    calories_max: Optional[float] = None
    protein_grams_target: Optional[float] = None
    carbs_grams_target: Optional[float] = None
    fat_grams_target: Optional[float] = None
    fiber_grams_target: Optional[float] = None
    sodium_mg_max: Optional[float] = None
    sugar_grams_max: Optional[float] = None
    potassium_mg_max: Optional[float] = None
    phosphorus_mg_max: Optional[float] = None
    urine_output_ml_min: Optional[float] = None
    bowel_movements_target: Optional[int] = None
    is_active: bool = True
    effective_date: datetime
    end_date: Optional[datetime] = None
    notes: Optional[str] = None


class NutritionGoalUpdate(BaseModel):
    """Update nutrition goals"""
    water_ml_target: Optional[float] = None
    total_fluid_ml_target: Optional[float] = None
    calories_target: Optional[float] = None
    calories_min: Optional[float] = None
    calories_max: Optional[float] = None
    protein_grams_target: Optional[float] = None
    carbs_grams_target: Optional[float] = None
    fat_grams_target: Optional[float] = None
    fiber_grams_target: Optional[float] = None
    sodium_mg_max: Optional[float] = None
    sugar_grams_max: Optional[float] = None
    potassium_mg_max: Optional[float] = None
    phosphorus_mg_max: Optional[float] = None
    urine_output_ml_min: Optional[float] = None
    bowel_movements_target: Optional[int] = None
    is_active: Optional[bool] = None
    effective_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    notes: Optional[str] = None


class NutritionGoalResponse(BaseModel):
    """Nutrition goal response"""
    id: int
    patient_id: int
    water_ml_target: Optional[float]
    total_fluid_ml_target: Optional[float]
    calories_target: Optional[float]
    calories_min: Optional[float]
    calories_max: Optional[float]
    protein_grams_target: Optional[float]
    carbs_grams_target: Optional[float]
    fat_grams_target: Optional[float]
    fiber_grams_target: Optional[float]
    sodium_mg_max: Optional[float]
    sugar_grams_max: Optional[float]
    potassium_mg_max: Optional[float]
    phosphorus_mg_max: Optional[float]
    urine_output_ml_min: Optional[float]
    bowel_movements_target: Optional[int]
    is_active: bool
    effective_date: datetime
    end_date: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# =====================
# NUTRITION OUTPUT MODELS
# =====================

OUTPUT_TYPES = ['urine', 'bowel', 'vomit', 'other']
CONSISTENCY_TYPES = ['solid', 'soft', 'loose', 'watery', 'diarrhea', 'constipated', 'pellets']
COLOR_TYPES = ['brown', 'dark_brown', 'light_brown', 'yellow', 'green', 'red', 'black', 'clay', 'other']
CLARITY_TYPES = ['clear', 'cloudy', 'dark', 'bloody']
DIAPER_WETNESS_TYPES = ['dry', 'wet', 'soaked']
# 'smear' was already being sent by the logging form; it just was not listed.
AMOUNT_UNITS = ['ml', 'oz', 'smear', 'small', 'medium', 'large']

# Re-exported from the vocab module so there is one owner of the mappings.
BRISTOL_SCALE = list(range(BRISTOL_MIN, BRISTOL_MAX + 1))
LOCATION_TYPES = list(_LOCATION_TYPES)
FEED_ROUTES = list(_FEED_ROUTES)


class NutritionOutputCreate(BaseModel):
    """Create output log entry"""
    patient_id: int
    care_task_log_id: Optional[int] = None
    output_type: str = Field(..., pattern="^(urine|bowel|vomit|other)$")
    # Rows written by one logging action share this. Generated server-side
    # when the event endpoint is used; accepted here so a caller can group
    # explicitly.
    event_group_id: Optional[str] = Field(None, max_length=36)
    location: Optional[str] = Field(None, pattern="^(restroom|diaper|catheter|accident)$")
    consistency: Optional[str] = None
    bristol_scale: Optional[int] = Field(None, ge=BRISTOL_MIN, le=BRISTOL_MAX)
    color: Optional[str] = None
    amount: Optional[float] = None
    amount_unit: Optional[str] = None
    clarity: Optional[str] = None
    is_diaper: bool = False
    diaper_wetness: Optional[str] = None
    diaper_soiled: Optional[bool] = None
    is_catheter: bool = False
    catheter_bag_emptied: Optional[bool] = None
    is_accident: bool = False
    occurred_at: datetime
    notes: Optional[str] = None
    recorded_by: Optional[int] = None
    has_blood: bool = False
    has_mucus: bool = False
    pain_reported: bool = False
    straining: bool = False


class NutritionOutputUpdate(BaseModel):
    """Update output log entry"""
    output_type: Optional[str] = None
    location: Optional[str] = Field(None, pattern="^(restroom|diaper|catheter|accident)$")
    consistency: Optional[str] = None
    bristol_scale: Optional[int] = Field(None, ge=BRISTOL_MIN, le=BRISTOL_MAX)
    color: Optional[str] = None
    amount: Optional[float] = None
    amount_unit: Optional[str] = None
    clarity: Optional[str] = None
    is_diaper: Optional[bool] = None
    diaper_wetness: Optional[str] = None
    diaper_soiled: Optional[bool] = None
    is_catheter: Optional[bool] = None
    catheter_bag_emptied: Optional[bool] = None
    is_accident: Optional[bool] = None
    occurred_at: Optional[datetime] = None
    notes: Optional[str] = None
    has_blood: Optional[bool] = None
    has_mucus: Optional[bool] = None
    pain_reported: Optional[bool] = None
    straining: Optional[bool] = None


class NutritionOutputResponse(BaseModel):
    """Output log response"""
    id: int
    patient_id: int
    care_task_log_id: Optional[int]
    output_type: str
    event_group_id: Optional[str] = None
    location: Optional[str] = None
    consistency: Optional[str]
    bristol_scale: Optional[int] = None
    color: Optional[str]
    amount: Optional[float]
    amount_unit: Optional[str]
    clarity: Optional[str]
    is_diaper: bool
    diaper_wetness: Optional[str]
    diaper_soiled: Optional[bool]
    is_catheter: bool
    catheter_bag_emptied: Optional[bool]
    is_accident: bool
    occurred_at: datetime
    notes: Optional[str]
    recorded_by: Optional[int]
    has_blood: bool
    has_mucus: bool
    pain_reported: bool
    straining: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# =====================
# NUTRITION SCHEDULE MODELS
# =====================

SCHEDULE_TYPES = ['meal', 'hydration', 'snack', 'supplement', 'diaper_check', 'bathroom_assist', 'catheter_care']


class NutritionScheduleComponentBase(BaseModel):
    """One item of a scheduled feed's default mix."""
    item_id: int
    amount: float = Field(..., gt=0)
    amount_unit: str = Field(..., min_length=1, max_length=50)
    feed_route: Optional[str] = Field(None, pattern="^(bolus|pump|gravity)$")
    rate_ml_per_hr: Optional[float] = Field(None, ge=0)
    duration_minutes: Optional[float] = Field(None, ge=0)
    # Post-feed water flush: not logged with the meal; completing the feed
    # spawns a follow-up due after the feed has run.
    is_flush: bool = False
    sort_order: int = 0


class NutritionScheduleComponentResponse(NutritionScheduleComponentBase):
    id: int
    # Denormalized from the saved item so the completion form can prefill
    # names and scaled facts without a second request.
    item_name: Optional[str] = None
    item_type: Optional[str] = None
    calories_per_unit: Optional[float] = None
    protein_per_unit: Optional[float] = None
    carbs_per_unit: Optional[float] = None
    fat_per_unit: Optional[float] = None
    fiber_per_unit: Optional[float] = None
    sodium_per_unit: Optional[float] = None

    class Config:
        from_attributes = True


class NutritionScheduleCreate(BaseModel):
    """Create nutrition schedule"""
    patient_id: int
    schedule_type: str = Field(..., pattern="^(meal|hydration|snack|supplement|diaper_check|bathroom_assist|catheter_care)$")
    name: str = Field(..., min_length=1, max_length=200)
    cron_expression: str = Field(..., min_length=1, max_length=100)
    default_item_name: Optional[str] = None
    default_amount: Optional[float] = None
    default_amount_unit: Optional[str] = None
    default_calories: Optional[float] = None
    # Multi-item feed mix; when set, completion expands one intake row per
    # component and the default_* fields above are ignored.
    components: Optional[List[NutritionScheduleComponentBase]] = None
    is_active: bool = True
    create_care_task: bool = True
    reminder_minutes_before: Optional[int] = 15
    instructions: Optional[str] = None
    notes: Optional[str] = None


class NutritionScheduleUpdate(BaseModel):
    """Update nutrition schedule"""
    schedule_type: Optional[str] = None
    name: Optional[str] = None
    cron_expression: Optional[str] = None
    default_item_name: Optional[str] = None
    default_amount: Optional[float] = None
    default_amount_unit: Optional[str] = None
    default_calories: Optional[float] = None
    # When present, replaces the whole component list ([] clears it).
    components: Optional[List[NutritionScheduleComponentBase]] = None
    is_active: Optional[bool] = None
    create_care_task: Optional[bool] = None
    reminder_minutes_before: Optional[int] = None
    instructions: Optional[str] = None
    notes: Optional[str] = None


class NutritionScheduleResponse(BaseModel):
    """Nutrition schedule response"""
    id: int
    patient_id: int
    schedule_type: str
    name: str
    cron_expression: str
    default_item_name: Optional[str]
    default_amount: Optional[float]
    default_amount_unit: Optional[str]
    default_calories: Optional[float]
    components: List[NutritionScheduleComponentResponse] = []
    is_active: bool
    create_care_task: bool
    reminder_minutes_before: Optional[int]
    instructions: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# =====================
# DAILY SUMMARY MODELS
# =====================

class NutritionDailySummary(BaseModel):
    """Daily nutrition summary for dashboard"""
    date: str
    patient_id: int
    
    # Intake totals
    total_water_ml: float
    total_calories: float
    total_protein_grams: float
    total_carbs_grams: float
    total_fat_grams: float
    total_sodium_mg: float
    
    # Output totals
    total_urine_ml: float
    bowel_movement_count: int
    
    # Goals comparison
    water_goal: Optional[float]
    water_percent: Optional[float]
    calories_goal: Optional[float]
    calories_percent: Optional[float]
    
    # Schedules
    schedules_completed: int
    schedules_total: int


# =====================
# NUTRITION ITEM LIBRARY MODELS
# =====================

class NutritionItemBase(BaseModel):
    """Shared fields for a saved, reusable nutrition item.

    Nutrition values are per ONE `default_amount_unit` so the logging sheet can
    scale them to whatever amount was actually given.
    """
    name: str = Field(..., min_length=1, max_length=200)
    item_type: str = Field(..., pattern="^(food|liquid|supplement|tube_feed)$")
    brand: Optional[str] = Field(None, max_length=200)
    default_amount: Optional[float] = Field(None, gt=0)
    default_amount_unit: Optional[str] = Field(None, max_length=50)
    calories_per_unit: Optional[float] = Field(None, ge=0)
    protein_per_unit: Optional[float] = Field(None, ge=0)
    carbs_per_unit: Optional[float] = Field(None, ge=0)
    fat_per_unit: Optional[float] = Field(None, ge=0)
    fiber_per_unit: Optional[float] = Field(None, ge=0)
    sodium_per_unit: Optional[float] = Field(None, ge=0)
    barcode: Optional[str] = Field(None, max_length=64)


class NutritionItemCreate(NutritionItemBase):
    # Null means the item is shared across every patient on the account.
    patient_id: Optional[int] = None


class NutritionItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    item_type: Optional[str] = Field(None, pattern="^(food|liquid|supplement|tube_feed)$")
    brand: Optional[str] = Field(None, max_length=200)
    default_amount: Optional[float] = Field(None, gt=0)
    default_amount_unit: Optional[str] = Field(None, max_length=50)
    calories_per_unit: Optional[float] = Field(None, ge=0)
    protein_per_unit: Optional[float] = Field(None, ge=0)
    carbs_per_unit: Optional[float] = Field(None, ge=0)
    fat_per_unit: Optional[float] = Field(None, ge=0)
    fiber_per_unit: Optional[float] = Field(None, ge=0)
    sodium_per_unit: Optional[float] = Field(None, ge=0)
    barcode: Optional[str] = Field(None, max_length=64)
    is_active: Optional[bool] = None


class NutritionItemResponse(NutritionItemBase):
    id: int
    patient_id: Optional[int]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NutritionFlushFollowupResponse(BaseModel):
    """A post-feed flush follow-up, as the board and endpoints hand it out."""
    id: int
    patient_id: int
    schedule_id: Optional[int]
    feed_scheduled_time: Optional[datetime] = None
    source_event_group_id: str
    item_id: Optional[int] = None
    item_name: str
    amount: float
    amount_unit: str
    due_at: datetime
    status: str
    completed_intake_group_id: Optional[str] = None
    completed_at: Optional[datetime] = None
    completed_by: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FlushCompleteRequest(BaseModel):
    """Run the flush — logs the water as a liquid intake."""
    amount: Optional[float] = Field(None, gt=0)
    amount_unit: Optional[str] = Field(None, min_length=1, max_length=50)
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    user_id: Optional[int] = None


class FlushSkipRequest(BaseModel):
    """Skip the flush — an explicit "not needed", kept distinct from forgot."""
    notes: Optional[str] = None
    user_id: Optional[int] = None


class NutritionBarcodeLookupResponse(BaseModel):
    """Result of a barcode scan.

    source 'library'       -> item is a saved nutrition item, ready to log.
    source 'openfoodfacts' -> suggestion holds NutritionItemCreate-shaped
                              fields for a new item the caregiver can save.
    source 'none'          -> nothing found (or lookup offline); enter manually.
    """
    source: str = Field(..., pattern="^(library|openfoodfacts|none)$")
    barcode: str
    item: Optional[NutritionItemResponse] = None
    suggestion: Optional[dict] = None


# =====================
# NUTRITION PRESET MODELS
# =====================

class NutritionPresetComponentBase(BaseModel):
    """One intake row that a preset expands into."""
    item_id: int
    amount: float = Field(..., gt=0)
    amount_unit: str = Field(..., min_length=1, max_length=50)
    feed_route: Optional[str] = Field(None, pattern="^(bolus|pump|gravity)$")
    rate_ml_per_hr: Optional[float] = Field(None, ge=0)
    duration_minutes: Optional[float] = Field(None, ge=0)
    sort_order: int = 0


class NutritionPresetComponentResponse(NutritionPresetComponentBase):
    id: int
    # Denormalized for display so the picker does not need a second request.
    item_name: Optional[str] = None
    item_type: Optional[str] = None

    class Config:
        from_attributes = True


class NutritionPresetCreate(BaseModel):
    """A named, reusable combination of intake components."""
    patient_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    meal_type: Optional[str] = Field(None, pattern="^(breakfast|lunch|dinner|snack|other)$")
    components: List[NutritionPresetComponentBase] = Field(..., min_length=1)


class NutritionPresetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    meal_type: Optional[str] = Field(None, pattern="^(breakfast|lunch|dinner|snack|other)$")
    is_active: Optional[bool] = None
    # When present, replaces the whole component list.
    components: Optional[List[NutritionPresetComponentBase]] = Field(None, min_length=1)


class NutritionPresetResponse(BaseModel):
    id: int
    patient_id: Optional[int]
    name: str
    description: Optional[str]
    meal_type: Optional[str]
    is_active: bool
    components: List[NutritionPresetComponentResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NutritionPresetApply(BaseModel):
    """Log every component of a preset as its own intake row."""
    patient_id: int
    consumed_at: Optional[datetime] = None
    meal_type: Optional[str] = Field(None, pattern="^(breakfast|lunch|dinner|snack|other)$")
    notes: Optional[str] = None
    care_task_log_id: Optional[int] = None


# =====================
# OUTPUT EVENT MODEL
# =====================

class NutritionOutputUrinePart(BaseModel):
    """Urine half of a bathroom event."""
    amount: Optional[float] = Field(None, ge=0)
    amount_unit: Optional[str] = Field(None, max_length=20)
    clarity: Optional[str] = None
    diaper_wetness: Optional[str] = None
    catheter_bag_emptied: Optional[bool] = None


class NutritionOutputStoolPart(BaseModel):
    """Stool half of a bathroom event."""
    bristol_scale: Optional[int] = Field(None, ge=BRISTOL_MIN, le=BRISTOL_MAX)
    consistency: Optional[str] = None
    color: Optional[str] = None
    amount: Optional[float] = Field(None, ge=0)
    # Qualitative by default: 'smear' | 'small' | 'medium' | 'large'.
    amount_unit: Optional[str] = Field(None, max_length=20)


class NutritionOutputEventCreate(BaseModel):
    """One bathroom event, written as its 1-2 constituent rows in one go.

    Minimum valid log is time + location + at least one of urine/stool.
    Everything else is optional.
    """
    patient_id: int
    location: str = Field(..., pattern="^(restroom|diaper|catheter|accident)$")
    occurred_at: datetime
    care_task_log_id: Optional[int] = None
    notes: Optional[str] = None
    recorded_by: Optional[int] = None
    # Concerns are recorded as flags on every row of the event. They are
    # observations, not interpretations -- nothing here diagnoses anything.
    has_blood: bool = False
    has_mucus: bool = False
    pain_reported: bool = False
    straining: bool = False
    urine: Optional[NutritionOutputUrinePart] = None
    stool: Optional[NutritionOutputStoolPart] = None


class NutritionOutputEventResponse(BaseModel):
    event_group_id: str
    outputs: List[NutritionOutputResponse]
