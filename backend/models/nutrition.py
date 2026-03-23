from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


# =====================
# NUTRITION INTAKE MODELS (existing)
# =====================

# Pydantic models for nutrition moved from routes/nutrition.py
class NutritionIntakeCreate(BaseModel):
    care_task_log_id: Optional[int] = None
    item_name: str = Field(..., min_length=1, max_length=200)
    item_type: str = Field(..., pattern="^(food|liquid|supplement)$")
    amount: float = Field(..., gt=0)
    amount_unit: str = Field(..., min_length=1, max_length=50)
    calories: Optional[float] = Field(None, ge=0)
    protein_grams: Optional[float] = Field(None, ge=0)
    carbs_grams: Optional[float] = Field(None, ge=0)
    fat_grams: Optional[float] = Field(None, ge=0)
    fiber_grams: Optional[float] = Field(None, ge=0)
    sodium_mg: Optional[float] = Field(None, ge=0)
    consumed_at: Optional[datetime] = None
    meal_type: Optional[str] = Field(None, pattern="^(breakfast|lunch|dinner|snack|supplement)$")
    notes: Optional[str] = None
    recorded_by: Optional[str] = None


class NutritionIntakeUpdate(BaseModel):
    item_name: Optional[str] = Field(None, min_length=1, max_length=200)
    item_type: Optional[str] = Field(None, pattern="^(food|liquid|supplement)$")
    amount: Optional[float] = Field(None, gt=0)
    amount_unit: Optional[str] = Field(None, min_length=1, max_length=50)
    calories: Optional[float] = Field(None, ge=0)
    protein_grams: Optional[float] = Field(None, ge=0)
    carbs_grams: Optional[float] = Field(None, ge=0)
    fat_grams: Optional[float] = Field(None, ge=0)
    fiber_grams: Optional[float] = Field(None, ge=0)
    sodium_mg: Optional[float] = Field(None, ge=0)
    consumed_at: Optional[datetime] = None
    meal_type: Optional[str] = Field(None, pattern="^(breakfast|lunch|dinner|snack|supplement)$")
    notes: Optional[str] = None
    recorded_by: Optional[str] = None


class NutritionIntakeResponse(BaseModel):
    id: int
    patient_id: int
    care_task_log_id: Optional[int]
    item_name: str
    item_type: str
    amount: float
    amount_unit: str
    calories: Optional[float]
    protein_grams: Optional[float]
    carbs_grams: Optional[float]
    fat_grams: Optional[float]
    fiber_grams: Optional[float]
    sodium_mg: Optional[float]
    consumed_at: datetime
    meal_type: Optional[str]
    notes: Optional[str]
    recorded_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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
AMOUNT_UNITS = ['ml', 'oz', 'small', 'medium', 'large']


class NutritionOutputCreate(BaseModel):
    """Create output log entry"""
    patient_id: int
    care_task_log_id: Optional[int] = None
    output_type: str = Field(..., pattern="^(urine|bowel|vomit|other)$")
    consistency: Optional[str] = None
    color: Optional[str] = None
    amount: Optional[float] = None
    amount_unit: Optional[str] = None
    clarity: Optional[str] = None
    is_diaper: bool = False
    diaper_wetness: Optional[str] = None
    diaper_soiled: Optional[bool] = None
    is_catheter: bool = False
    catheter_bag_emptied: Optional[bool] = None
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
    consistency: Optional[str] = None
    color: Optional[str] = None
    amount: Optional[float] = None
    amount_unit: Optional[str] = None
    clarity: Optional[str] = None
    is_diaper: Optional[bool] = None
    diaper_wetness: Optional[str] = None
    diaper_soiled: Optional[bool] = None
    is_catheter: Optional[bool] = None
    catheter_bag_emptied: Optional[bool] = None
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
    consistency: Optional[str]
    color: Optional[str]
    amount: Optional[float]
    amount_unit: Optional[str]
    clarity: Optional[str]
    is_diaper: bool
    diaper_wetness: Optional[str]
    diaper_soiled: Optional[bool]
    is_catheter: bool
    catheter_bag_emptied: Optional[bool]
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
