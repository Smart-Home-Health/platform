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
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime, date
from typing import List, Optional
import logging
from db import get_db
from dependencies import require_read_access, require_permission
from sqlalchemy.exc import IntegrityError
from crud.nutrition_library import (
    list_nutrition_items, create_nutrition_item, update_nutrition_item, delete_nutrition_item,
    list_nutrition_presets, create_nutrition_preset, update_nutrition_preset,
    delete_nutrition_preset, apply_nutrition_preset, get_recent_intake_items,
)
from nutrition_vocab import MEAL_TYPES
from crud.nutrition import (
    create_nutrition_intake, 
    get_nutrition_intake_by_id,
    get_patient_nutrition_intake,
    get_daily_nutrition_intake,
    get_nutrition_summary,
    update_nutrition_intake,
    delete_nutrition_intake,
    get_nutrition_intake_for_care_task
)
from crud.patients import get_active_patient
from crud.scheduling import get_due_and_upcoming_nutrition_count
from utils.datetime_utils import resolve_tz_for_patient
from models.nutrition import (
    NutritionIntakeCreate,
    NutritionIntakeUpdate,
    NutritionIntakeResponse,
    NutritionItemCreate,
    NutritionItemUpdate,
    NutritionItemResponse,
    NutritionPresetCreate,
    NutritionPresetUpdate,
    NutritionPresetResponse,
    NutritionPresetApply,
)

logger = logging.getLogger("app")
router = APIRouter(prefix="/api", tags=["nutrition"])


@router.get("/nutrition/due/count")
async def get_nutrition_due_count_endpoint(patient_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Count of due/upcoming nutrition items, scoped to a patient for the
    per-patient dashboard badge. Ungated like the equipment due-count so the
    badge stays visible in restricted (locked) mode."""
    return {"count": get_due_and_upcoming_nutrition_count(db, patient_id=patient_id)}

# Simple endpoint for frontend compatibility
@router.post("/nutrition", response_model=NutritionIntakeResponse, dependencies=[Depends(require_permission("nutrition.create"))])
async def create_nutrition_simple(
    intake_data: NutritionIntakeCreate,
    db: Session = Depends(get_db)
):
    """Create a new nutrition intake record (simple endpoint)"""
    try:
        logger.info(f"Received nutrition intake request: {intake_data.model_dump()}")
        
        # Get the active patient
        active_patient = get_active_patient(db)
        if not active_patient:
            logger.error("No active patient found when creating nutrition intake")
            raise HTTPException(status_code=400, detail="No active patient found")
        
        logger.info(f"Using active patient: {active_patient.id} ({active_patient.first_name} {active_patient.last_name})")
        
        # Convert consumed_at to datetime if it's a string
        data_dict = intake_data.model_dump()
        if 'consumed_at' in data_dict and isinstance(data_dict['consumed_at'], str):
            try:
                data_dict['consumed_at'] = datetime.fromisoformat(data_dict['consumed_at'].replace('Z', '+00:00'))
                logger.info(f"Converted consumed_at to datetime: {data_dict['consumed_at']}")
            except ValueError as e:
                logger.warning(f"Failed to parse consumed_at '{data_dict['consumed_at']}', using current time: {e}")
                # If parsing fails, use current time
                data_dict['consumed_at'] = datetime.utcnow()
        
        logger.info(f"Creating nutrition intake with data: {data_dict}")
        intake = create_nutrition_intake(
            db=db, 
            intake_data=data_dict, 
            patient_id=active_patient.id
        )
        logger.info(f"Successfully created nutrition intake record with ID: {intake.id}")
        return intake
    except ValueError as e:
        logger.error(f"Validation error creating nutrition intake: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        logger.error(f"Nutrition creation error: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to create nutrition intake record: {str(e)}")

@router.post("/nutrition-intake", response_model=NutritionIntakeResponse, dependencies=[Depends(require_permission("nutrition.create"))])
async def create_nutrition_intake_endpoint(
    intake_data: NutritionIntakeCreate,
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Create a new nutrition intake record"""
    try:
        intake = create_nutrition_intake(
            db=db, 
            intake_data=intake_data.model_dump(), 
            patient_id=patient_id
        )
        return intake
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create nutrition intake record")

@router.get("/nutrition-intake/{intake_id}", response_model=NutritionIntakeResponse)
async def get_nutrition_intake_endpoint(
    intake_id: int,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get a specific nutrition intake record"""
    intake = get_nutrition_intake_by_id(db, intake_id)
    if not intake:
        raise HTTPException(status_code=404, detail="Nutrition intake record not found")
    return intake

@router.get("/patients/{patient_id}/nutrition-intake", response_model=List[NutritionIntakeResponse])
async def get_patient_nutrition_intake_endpoint(
    patient_id: int,
    limit: int = 50,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    schedule_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get nutrition intake records for a patient, optionally bounded by a
    consumed_at date range and/or narrowed to one nutrition schedule."""
    intake_records = get_patient_nutrition_intake(
        db, patient_id, limit, start_date, end_date, schedule_id=schedule_id)
    return intake_records

@router.get("/patients/{patient_id}/nutrition-intake/daily")
async def get_daily_nutrition_intake_endpoint(
    patient_id: int,
    target_date: Optional[date] = None,
    tz_offset_minutes: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get nutrition intake records for a specific day.

    Day boundaries derive from the patient's account timezone
    (Account.timezone). `tz_offset_minutes` is a deprecated legacy fallback.
    """
    tz = resolve_tz_for_patient(db, patient_id)
    intake_records = get_daily_nutrition_intake(db, patient_id, target_date, tz_offset_minutes=tz_offset_minutes, tz=tz)
    return {
        "date": target_date or date.today(),
        "intake_records": intake_records
    }

@router.get("/patients/{patient_id}/nutrition-summary")
async def get_nutrition_summary_endpoint(
    patient_id: int,
    target_date: Optional[date] = None,
    tz_offset_minutes: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get daily nutrition summary with totals. Day boundaries derive from the
    patient's account timezone; tz_offset_minutes is a legacy fallback."""
    tz = resolve_tz_for_patient(db, patient_id)
    summary = get_nutrition_summary(db, patient_id, target_date, tz_offset_minutes=tz_offset_minutes, tz=tz)
    return {
        "date": target_date or date.today(),
        "summary": summary
    }

@router.get("/nutrition-intake/active-patient")
async def get_active_patient_nutrition_endpoint(
    limit: int = 50,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get nutrition intake records for the active patient"""
    active_patient = get_active_patient(db)
    if not active_patient:
        raise HTTPException(status_code=404, detail="No active patient found")
    
    intake_records = get_patient_nutrition_intake(db, active_patient.id, limit)
    return {
        "patient": active_patient,
        "intake_records": intake_records
    }

@router.get("/nutrition-summary/active-patient")
async def get_active_patient_nutrition_summary_endpoint(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get nutrition summary for the active patient"""
    active_patient = get_active_patient(db)
    if not active_patient:
        raise HTTPException(status_code=404, detail="No active patient found")
    
    tz = resolve_tz_for_patient(db, active_patient.id)
    summary = get_nutrition_summary(db, active_patient.id, target_date, tz=tz)
    return {
        "patient": active_patient,
        "date": target_date or date.today(),
        "summary": summary
    }

@router.put("/nutrition-intake/{intake_id}", response_model=NutritionIntakeResponse, dependencies=[Depends(require_permission("nutrition.update"))])
async def update_nutrition_intake_endpoint(
    intake_id: int,
    update_data: NutritionIntakeUpdate,
    db: Session = Depends(get_db)
):
    """Update a nutrition intake record"""
    try:
        # Only include non-None values in update
        update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
        
        intake = update_nutrition_intake(db, intake_id, update_dict)
        if not intake:
            raise HTTPException(status_code=404, detail="Nutrition intake record not found")
        return intake
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update nutrition intake record")

@router.delete("/nutrition-intake/{intake_id}", dependencies=[Depends(require_permission("nutrition.delete"))])
async def delete_nutrition_intake_endpoint(
    intake_id: int,
    db: Session = Depends(get_db)
):
    """Delete a nutrition intake record"""
    try:
        success = delete_nutrition_intake(db, intake_id)
        if not success:
            raise HTTPException(status_code=404, detail="Nutrition intake record not found")
        return {"message": "Nutrition intake record deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete nutrition intake record")

@router.get("/care-task-logs/{care_task_log_id}/nutrition-intake", response_model=List[NutritionIntakeResponse])
async def get_care_task_nutrition_intake_endpoint(
    care_task_log_id: int,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get nutrition intake records linked to a specific care task completion"""
    intake_records = get_nutrition_intake_for_care_task(db, care_task_log_id)
    return intake_records

# Common nutrition items/presets for quick entry
@router.get("/nutrition-presets")
async def get_nutrition_presets_legacy(
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    """Deprecated shim for the old hardcoded preset dict.

    This used to return a fixed list of items nobody could edit. It now reads
    the real item library so existing callers keep working; new code should use
    /api/nutrition/items and /api/nutrition/presets.
    """
    items = list_nutrition_items(db, patient_id=patient_id, limit=200)

    def as_legacy(item):
        return {
            "id": item.id,
            "name": item.name,
            "item_type": item.item_type,
            "default_unit": item.default_amount_unit,
            "default_amount": item.default_amount,
            "calories_per_ml": item.calories_per_unit,
            "calories_per_serving": item.calories_per_unit,
            "protein_per_ml": item.protein_per_unit,
            "carbs_per_ml": item.carbs_per_unit,
            "fat_per_ml": item.fat_per_unit,
        }

    return {
        "liquids": [as_legacy(i) for i in items if i.item_type in ('liquid', 'tube_feed', 'supplement')],
        "foods": [as_legacy(i) for i in items if i.item_type == 'food'],
        "meal_types": MEAL_TYPES,
        "common_units": {
            "liquids": ["ml", "oz", "cups", "liters"],
            "foods": ["grams", "oz", "servings", "pieces"],
        },
    }


# ---------- Item library ----------

@router.get("/nutrition/items", response_model=List[NutritionItemResponse])
async def list_items(
    patient_id: Optional[int] = None,
    search: Optional[str] = None,
    item_type: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    """Saved reusable items, for the sheet's item search."""
    return list_nutrition_items(db, patient_id=patient_id, search=search,
                                item_type=item_type, limit=limit)


@router.post("/nutrition/items", response_model=NutritionItemResponse,
             dependencies=[Depends(require_permission("nutrition.create"))])
async def create_item(item_data: NutritionItemCreate, db: Session = Depends(get_db)):
    """Save a reusable item (the sheet's 'Save as a reusable item' toggle)."""
    try:
        return create_nutrition_item(db, item_data.model_dump())
    except IntegrityError:
        raise HTTPException(status_code=409, detail="An item with that name already exists.")
    except Exception as e:
        logger.error(f"Error creating nutrition item: {e}")
        raise HTTPException(status_code=500, detail="Failed to create nutrition item")


@router.put("/nutrition/items/{item_id}", response_model=NutritionItemResponse,
            dependencies=[Depends(require_permission("nutrition.update"))])
async def update_item(item_id: int, update_data: NutritionItemUpdate, db: Session = Depends(get_db)):
    item = update_nutrition_item(db, item_id, update_data.model_dump(exclude_unset=True))
    if not item:
        raise HTTPException(status_code=404, detail="Nutrition item not found")
    return item


@router.delete("/nutrition/items/{item_id}",
               dependencies=[Depends(require_permission("nutrition.delete"))])
async def delete_item(item_id: int, db: Session = Depends(get_db)):
    """Deactivates the item; logged intakes that reference it are untouched."""
    if not delete_nutrition_item(db, item_id):
        raise HTTPException(status_code=404, detail="Nutrition item not found")
    return {"message": "Nutrition item removed"}


@router.get("/nutrition/recent")
async def recent_items(
    patient_id: int,
    limit: int = 6,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    """Recent item/amount combinations, for the one-tap prefill chips."""
    return {"recent": get_recent_intake_items(db, patient_id, limit=limit)}


# ---------- Presets ----------

@router.get("/nutrition/presets", response_model=List[NutritionPresetResponse])
async def list_presets(
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    """Reusable combinations. Each expands into several intake rows."""
    presets = list_nutrition_presets(db, patient_id=patient_id)
    return [_preset_response(p) for p in presets]


@router.post("/nutrition/presets", response_model=NutritionPresetResponse,
             dependencies=[Depends(require_permission("nutrition.create"))])
async def create_preset(preset_data: NutritionPresetCreate, db: Session = Depends(get_db)):
    try:
        preset = create_nutrition_preset(db, preset_data.model_dump())
        return _preset_response(preset)
    except Exception as e:
        logger.error(f"Error creating nutrition preset: {e}")
        raise HTTPException(status_code=500, detail="Failed to create nutrition preset")


@router.put("/nutrition/presets/{preset_id}", response_model=NutritionPresetResponse,
            dependencies=[Depends(require_permission("nutrition.update"))])
async def update_preset(preset_id: int, update_data: NutritionPresetUpdate, db: Session = Depends(get_db)):
    preset = update_nutrition_preset(db, preset_id, update_data.model_dump(exclude_unset=True))
    if not preset:
        raise HTTPException(status_code=404, detail="Nutrition preset not found")
    return _preset_response(preset)


@router.delete("/nutrition/presets/{preset_id}",
               dependencies=[Depends(require_permission("nutrition.delete"))])
async def delete_preset(preset_id: int, db: Session = Depends(get_db)):
    if not delete_nutrition_preset(db, preset_id):
        raise HTTPException(status_code=404, detail="Nutrition preset not found")
    return {"message": "Nutrition preset removed"}


@router.post("/nutrition/presets/{preset_id}/apply",
             response_model=List[NutritionIntakeResponse],
             dependencies=[Depends(require_permission("nutrition.create"))])
async def apply_preset(preset_id: int, data: NutritionPresetApply, db: Session = Depends(get_db)):
    """Log every component of a preset.

    Writes one intake row per component -- the feed and its flush stay separate
    records -- sharing an event_group_id so they read back as one action.
    """
    try:
        created = apply_nutrition_preset(
            db, preset_id,
            patient_id=data.patient_id,
            consumed_at=data.consumed_at,
            meal_type=data.meal_type,
            notes=data.notes,
            care_task_log_id=data.care_task_log_id,
        )
        if not created:
            raise HTTPException(status_code=404, detail="Nutrition preset not found or has no items")
        return created
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error applying nutrition preset {preset_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to apply nutrition preset")


def _preset_response(preset) -> dict:
    """Flatten a preset for the API, denormalizing item name/type for display."""
    return {
        "id": preset.id,
        "patient_id": preset.patient_id,
        "name": preset.name,
        "description": preset.description,
        "meal_type": preset.meal_type,
        "is_active": preset.is_active,
        "created_at": preset.created_at,
        "updated_at": preset.updated_at,
        "components": [
            {
                "id": c.id,
                "item_id": c.item_id,
                "item_name": c.item.name if c.item else None,
                "item_type": c.item.item_type if c.item else None,
                "amount": c.amount,
                "amount_unit": c.amount_unit,
                "feed_route": c.feed_route,
                "rate_ml_per_hr": c.rate_ml_per_hr,
                "duration_minutes": c.duration_minutes,
                "sort_order": c.sort_order,
            }
            for c in sorted(preset.components, key=lambda x: x.sort_order)
        ],
    }


@router.get("/nutrition/dashboard")
async def get_nutrition_dashboard_data(db: Session = Depends(get_db)):
    """
    Get nutrition data for dashboard gauges with scheduled progress
    Respects day_start_hour setting for daily boundaries
    """
    try:
        # Get the active patient
        active_patient = get_active_patient(db)
        if not active_patient:
            raise HTTPException(status_code=400, detail="No active patient found")
        
        # Get day_start_hour setting (default 7am)
        from crud.settings import get_setting
        day_start_hour_setting = get_setting(db, 'day_start_hour')
        day_start_hour = int(day_start_hour_setting) if day_start_hour_setting else 7
        
        # Get daily targets
        target_calories_setting = get_setting(db, 'daily_calories')
        target_water_setting = get_setting(db, 'daily_water')
        target_calories = float(target_calories_setting) if target_calories_setting else 2000
        target_water = float(target_water_setting) if target_water_setting else 2000  # ml
        
        # Calculate the current "day" based on day_start_hour
        from datetime import datetime, timedelta
        now = datetime.now()
        
        # If current hour is before day_start_hour, we're still in "yesterday"
        if now.hour < day_start_hour:
            day_start = datetime(now.year, now.month, now.day, day_start_hour, 0, 0) - timedelta(days=1)
        else:
            day_start = datetime(now.year, now.month, now.day, day_start_hour, 0, 0)
        
        day_end = day_start + timedelta(days=1)
        
        # Get nutrition data for current "day"
        from models import NutritionIntake
        daily_intake = db.query(NutritionIntake).filter(
            NutritionIntake.patient_id == active_patient.id,
            NutritionIntake.consumed_at >= day_start,
            NutritionIntake.consumed_at < day_end
        ).all()
        
        # Calculate totals
        total_calories = sum(item.calories or 0 for item in daily_intake)
        total_water_ml = 0
        
        for intake in daily_intake:
            if intake.item_type == 'liquid':
                amount_ml = intake.amount
                # Convert units to ml
                unit = intake.amount_unit.lower()
                if unit in ['oz', 'ounces']:
                    amount_ml = intake.amount * 29.5735
                elif unit in ['cup', 'cups']:
                    amount_ml = intake.amount * 236.588
                elif unit in ['liter', 'liters', 'l']:
                    amount_ml = intake.amount * 1000
                total_water_ml += amount_ml
        
        # Get scheduled nutrition tasks for today to calculate expected progress
        from models import CareTaskSchedule, CareTask, CareTaskLog
        from croniter import croniter
        
        # Find all nutrition-related scheduled tasks (category_id = 1)
        nutrition_schedules = db.query(CareTaskSchedule).join(CareTask).filter(
            CareTask.category_id == 1,
            CareTaskSchedule.active == True,
            CareTaskSchedule.patient_id == active_patient.id
        ).all()
        
        # Calculate how many scheduled feedings should have occurred by now
        scheduled_feedings_past = 0
        total_scheduled_feedings = 0
        scheduled_calories_past = 0
        scheduled_water_past = 0
        
        # Calculate scheduled amounts by parsing nutrition data from care task notes
        for schedule in nutrition_schedules:
            # First, count total scheduled feedings in the day
            # Start from slightly before day_start to ensure we include times AT day_start
            schedule_times = []
            temp_cron = croniter(schedule.cron_expression, day_start - timedelta(seconds=1))
            while True:
                next_time = temp_cron.get_next(datetime)
                if next_time >= day_end:
                    break
                schedule_times.append(next_time)
                total_scheduled_feedings += 1
            
            # Count how many have passed and extract nutrition data from notes
            for scheduled_time in schedule_times:
                if scheduled_time <= now:
                    scheduled_feedings_past += 1
                    
                    # Parse nutrition data from care task schedule notes
                    if schedule.notes:
                        try:
                            import json
                            notes_data = json.loads(schedule.notes)
                            
                            if 'nutrition' in notes_data:
                                nutrition_info = notes_data['nutrition']
                                
                                # Add calories if present
                                if nutrition_info.get('calories'):
                                    scheduled_calories_past += float(nutrition_info['calories'])
                                
                                # Add water for liquids only (not supplements)
                                if nutrition_info.get('item_type') == 'liquid':
                                    amount = float(nutrition_info.get('amount', 0))
                                    unit = nutrition_info.get('amount_unit', 'ml').lower()
                                    
                                    # Convert to ml
                                    amount_ml = amount
                                    if unit in ['oz', 'ounces']:
                                        amount_ml = amount * 29.5735
                                    elif unit in ['cup', 'cups']:
                                        amount_ml = amount * 236.588
                                    elif unit in ['liter', 'liters', 'l']:
                                        amount_ml = amount * 1000
                                    
                                    scheduled_water_past += amount_ml
                        except (json.JSONDecodeError, KeyError, ValueError) as e:
                            logger.warning(f"Failed to parse nutrition data from schedule {schedule.id} notes: {e}")
                            # Fallback to proportional calculation for this feeding
                            if total_scheduled_feedings > 0:
                                scheduled_calories_past += target_calories / total_scheduled_feedings
                                scheduled_water_past += target_water / total_scheduled_feedings
        
        # If no scheduled amounts were calculated, use time-based proportion
        if scheduled_feedings_past > 0 and scheduled_calories_past == 0 and scheduled_water_past == 0:
            # No nutrition data in notes, use proportional calculation
            calories_per_feeding = target_calories / total_scheduled_feedings if total_scheduled_feedings > 0 else 0
            water_per_feeding = target_water / total_scheduled_feedings if total_scheduled_feedings > 0 else 0
            scheduled_calories_past = calories_per_feeding * scheduled_feedings_past
            scheduled_water_past = water_per_feeding * scheduled_feedings_past
        elif total_scheduled_feedings == 0:
            # If no scheduled tasks at all, use time-based proportion
            time_elapsed = (now - day_start).total_seconds()
            day_duration = 24 * 3600  # 24 hours in seconds
            time_proportion = min(time_elapsed / day_duration, 1.0)
            scheduled_calories_past = target_calories * time_proportion
            scheduled_water_past = target_water * time_proportion
        
        return {
            "total_calories": round(total_calories, 1),
            "total_water_ml": round(total_water_ml, 1),
            "target_calories": target_calories,
            "target_water_ml": target_water,
            "scheduled_calories": round(scheduled_calories_past, 1),
            "scheduled_water_ml": round(scheduled_water_past, 1),
            "scheduled_feedings_past": scheduled_feedings_past,
            "total_scheduled_feedings": total_scheduled_feedings,
            "day_start": day_start.isoformat(),
            "day_end": day_end.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting nutrition dashboard data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/nutrition/has-data")
async def check_nutrition_data(db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Check if there is any nutrition data in the database"""
    try:
        from models import NutritionIntake
        count = db.query(NutritionIntake).count()
        return {"has_data": count > 0, "count": count}
    except Exception as e:
        logger.error(f"Error checking nutrition data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================
# NUTRITION GOALS ROUTES
# =============================================

from models.nutrition import (
    NutritionGoalCreate, NutritionGoalUpdate, NutritionGoalResponse,
    NutritionOutputCreate, NutritionOutputUpdate, NutritionOutputResponse,
    NutritionScheduleCreate, NutritionScheduleUpdate, NutritionScheduleResponse,
    NutritionOutputEventCreate, NutritionOutputEventResponse,
    OUTPUT_TYPES, CONSISTENCY_TYPES, COLOR_TYPES, CLARITY_TYPES, DIAPER_WETNESS_TYPES,
    SCHEDULE_TYPES, BRISTOL_SCALE, LOCATION_TYPES, FEED_ROUTES, AMOUNT_UNITS
)
from crud.nutrition import (
    create_nutrition_goal, get_nutrition_goal_by_id, get_patient_nutrition_goals,
    get_current_nutrition_goal, update_nutrition_goal, delete_nutrition_goal,
    create_nutrition_output, create_output_event, get_nutrition_output_by_id,
    get_patient_nutrition_outputs,
    get_daily_nutrition_outputs, get_output_summary, update_nutrition_output, delete_nutrition_output,
    create_nutrition_schedule, get_nutrition_schedule_by_id, get_patient_nutrition_schedules,
    update_nutrition_schedule, toggle_nutrition_schedule, delete_nutrition_schedule
)


@router.post("/nutrition/goals", response_model=NutritionGoalResponse, dependencies=[Depends(require_permission("nutrition.create"))])
async def create_goal(goal_data: NutritionGoalCreate, db: Session = Depends(get_db)):
    """Create a new nutrition goal for a patient"""
    try:
        goal = create_nutrition_goal(db, goal_data.model_dump())
        return goal
    except Exception as e:
        logger.error(f"Error creating nutrition goal: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nutrition/goals/patient/{patient_id}", response_model=List[NutritionGoalResponse])
async def get_goals_for_patient(
    patient_id: int,
    active_only: bool = True,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get all nutrition goals for a patient"""
    return get_patient_nutrition_goals(db, patient_id, active_only)


@router.get("/nutrition/goals/patient/{patient_id}/current", response_model=Optional[NutritionGoalResponse])
async def get_current_goal(patient_id: int, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get the current active nutrition goal for a patient"""
    return get_current_nutrition_goal(db, patient_id)


@router.get("/nutrition/goals/{goal_id}", response_model=NutritionGoalResponse)
async def get_goal(goal_id: int, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get a specific nutrition goal"""
    goal = get_nutrition_goal_by_id(db, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Nutrition goal not found")
    return goal


@router.put("/nutrition/goals/{goal_id}", response_model=NutritionGoalResponse, dependencies=[Depends(require_permission("nutrition.update"))])
async def update_goal(goal_id: int, update_data: NutritionGoalUpdate, db: Session = Depends(get_db)):
    """Update a nutrition goal"""
    goal = update_nutrition_goal(db, goal_id, update_data.model_dump(exclude_unset=True))
    if not goal:
        raise HTTPException(status_code=404, detail="Nutrition goal not found")
    return goal


@router.delete("/nutrition/goals/{goal_id}", dependencies=[Depends(require_permission("nutrition.delete"))])
async def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    """Delete a nutrition goal"""
    if not delete_nutrition_goal(db, goal_id):
        raise HTTPException(status_code=404, detail="Nutrition goal not found")
    return {"success": True}


@router.get("/nutrition/patient/{patient_id}/summary")
async def get_nutrition_intake_summary(
    patient_id: int,
    days: int = 30,
    tz_offset_minutes: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """
    Get daily nutrition summary for a patient over specified days.
    Uses the correct nutrition goal for each day based on effective_date.
    Returns daily intake totals, goals, and % deviation.

    Bucketing rules (matching the Overview):
    - Use scheduled_time when present (a 9pm feed logged at 12:30am belongs
      to the day it was scheduled for), else fall back to consumed_at.
    - Bucket by the caller's local day when tz_offset_minutes is supplied.
    - water_ml sums both liquid- and hydration-typed intakes (hydration is
      the item_type assigned when a hydration *schedule* is completed).
    """
    from sqlalchemy import func, cast, Date, text, case
    from datetime import timedelta
    from models import NutritionIntake
    from schemas.nutrition_goal import NutritionGoal

    try:
        # "Today" in the caller's local time when an offset is provided;
        # otherwise UTC today (back-compat).
        if tz_offset_minutes is not None:
            now_local = datetime.utcnow() + timedelta(minutes=tz_offset_minutes)
            end_date = now_local.date()
        else:
            end_date = date.today()
        start_date = end_date - timedelta(days=days - 1)

        # Get all goals for this patient (including historical) sorted by effective_date desc
        all_goals = db.query(NutritionGoal).filter(
            NutritionGoal.patient_id == patient_id
        ).order_by(NutritionGoal.effective_date.desc()).all()

        # Event-time expression: prefer scheduled_time, fall back to consumed_at.
        event_time = func.coalesce(NutritionIntake.scheduled_time, NutritionIntake.consumed_at)
        # Shift into caller's local time before casting to Date so daily
        # buckets align with their day, not UTC's. PostgreSQL supports
        # `timestamptz + interval` naturally.
        if tz_offset_minutes is not None:
            local_event_time = event_time + text(f"INTERVAL '{tz_offset_minutes} minutes'")
        else:
            local_event_time = event_time
        bucket_date = cast(local_event_time, Date)

        # Daily aggregated intake. Column names corrected (protein_grams etc.)
        # and water sum extended to include `hydration` (schedule-completion item_type).
        daily_intake = db.query(
            bucket_date.label('date'),
            func.sum(NutritionIntake.calories).label('total_calories'),
            func.sum(
                case(
                    (NutritionIntake.item_type.in_(['liquid', 'hydration']),
                     case(
                         (NutritionIntake.amount_unit.in_(['oz', 'ounces']), NutritionIntake.amount * 29.5735),
                         (NutritionIntake.amount_unit.in_(['cup', 'cups']), NutritionIntake.amount * 236.588),
                         (NutritionIntake.amount_unit.in_(['liter', 'liters', 'l']), NutritionIntake.amount * 1000),
                         else_=NutritionIntake.amount
                     )),
                    else_=0
                )
            ).label('total_water_ml'),
            func.sum(NutritionIntake.protein_grams).label('total_protein'),
            func.sum(NutritionIntake.carbs_grams).label('total_carbs'),
            func.sum(NutritionIntake.fat_grams).label('total_fat')
        ).filter(
            NutritionIntake.patient_id == patient_id,
            bucket_date >= start_date,
            bucket_date <= end_date
        ).group_by(
            bucket_date
        ).all()
        
        # Convert to dict for easier lookup
        intake_by_date = {
            row.date: {
                'calories': float(row.total_calories or 0),
                'water_ml': float(row.total_water_ml or 0),
                'protein': float(row.total_protein or 0),
                'carbs': float(row.total_carbs or 0),
                'fat': float(row.total_fat or 0)
            }
            for row in daily_intake
        }
        
        def find_goal_for_date(target_date: date):
            """Find the applicable goal for a specific date"""
            target_datetime = datetime.combine(target_date, datetime.min.time())
            for goal in all_goals:
                # Check if goal was effective on this date
                goal_effective = goal.effective_date.date() if isinstance(goal.effective_date, datetime) else goal.effective_date
                if goal_effective <= target_date:
                    # Check end_date if set
                    if goal.end_date:
                        goal_end = goal.end_date.date() if isinstance(goal.end_date, datetime) else goal.end_date
                        if goal_end < target_date:
                            continue
                    if goal.is_active:
                        return goal
            return None
        
        # Build result for each day
        result = []
        current_date = start_date
        while current_date <= end_date:
            intake = intake_by_date.get(current_date, {
                'calories': 0,
                'water_ml': 0,
                'protein': 0,
                'carbs': 0,
                'fat': 0
            })
            
            goal = find_goal_for_date(current_date)
            
            day_data = {
                'date': current_date.isoformat(),
                'calories': round(intake['calories'], 1),
                'water_ml': round(intake['water_ml'], 1),
                'protein': round(intake['protein'], 1),
                'carbs': round(intake['carbs'], 1),
                'fat': round(intake['fat'], 1),
                'calories_target': None,
                'water_target': None,
                'protein_target': None,
                'carbs_target': None,
                'fat_target': None
            }
            
            if goal:
                day_data['calories_target'] = goal.calories_target
                day_data['water_target'] = goal.water_ml_target
                # Broader target that includes meals/tube feeds as fluid —
                # matches the Overview's fluid card semantics.
                day_data['total_fluid_target'] = goal.total_fluid_ml_target
                day_data['protein_target'] = goal.protein_grams_target
                day_data['carbs_target'] = goal.carbs_grams_target
                day_data['fat_target'] = goal.fat_grams_target
            
            result.append(day_data)
            current_date += timedelta(days=1)
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting nutrition summary: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================
# NUTRITION OUTPUT ROUTES
# =============================================

@router.get("/nutrition/outputs/types")
async def get_output_types():
    """Get available output types and options"""
    return {
        "output_types": OUTPUT_TYPES,
        "consistency_types": CONSISTENCY_TYPES,
        "color_types": COLOR_TYPES,
        "clarity_types": CLARITY_TYPES,
        "diaper_wetness_types": DIAPER_WETNESS_TYPES
    }


@router.post("/nutrition/outputs/event", response_model=NutritionOutputEventResponse,
             dependencies=[Depends(require_permission("nutrition.create"))])
async def create_output_event_endpoint(event: NutritionOutputEventCreate, db: Session = Depends(get_db)):
    """Log one bathroom event.

    Urine and stool remain separate rows -- that is what keeps volume sums and
    bowel-movement counts meaningful -- but they are written in a single
    transaction under one event_group_id, so a half-saved event is no longer
    possible and every view groups them the same way.
    """
    payload = event.model_dump()
    payload['urine'] = payload.get('urine') or None
    payload['stool'] = payload.get('stool') or None
    try:
        rows = create_output_event(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating output event: {e}")
        raise HTTPException(status_code=500, detail="Failed to log output event")
    return {"event_group_id": rows[0].event_group_id, "outputs": rows}


@router.post("/nutrition/outputs", response_model=NutritionOutputResponse, dependencies=[Depends(require_permission("nutrition.create"))])
async def create_output(output_data: NutritionOutputCreate, db: Session = Depends(get_db)):
    """Create a new output log entry"""
    try:
        output = create_nutrition_output(db, output_data.model_dump())
        return output
    except Exception as e:
        logger.error(f"Error creating nutrition output: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nutrition/outputs/patient/{patient_id}", response_model=List[NutritionOutputResponse])
async def get_outputs_for_patient(
    patient_id: int,
    output_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get output logs for a patient"""
    return get_patient_nutrition_outputs(db, patient_id, output_type, start_date, end_date, limit)


@router.get("/nutrition/outputs/patient/{patient_id}/daily")
async def get_daily_outputs(
    patient_id: int,
    target_date: Optional[date] = None,
    tz_offset_minutes: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get output logs for a specific day.

    Day boundaries derive from the patient's account timezone;
    `tz_offset_minutes` is a deprecated legacy fallback.
    """
    tz = resolve_tz_for_patient(db, patient_id)
    outputs = get_daily_nutrition_outputs(db, patient_id, target_date, tz_offset_minutes=tz_offset_minutes, tz=tz)
    return [NutritionOutputResponse.model_validate(o) for o in outputs]


@router.get("/nutrition/outputs/patient/{patient_id}/summary")
async def get_patient_output_summary(
    patient_id: int,
    target_date: Optional[date] = None,
    tz_offset_minutes: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get output summary for a patient for a specific day"""
    tz = resolve_tz_for_patient(db, patient_id)
    return get_output_summary(db, patient_id, target_date, tz_offset_minutes=tz_offset_minutes, tz=tz)


@router.get("/nutrition/outputs/patient/{patient_id}/history")
async def get_output_history_summary(
    patient_id: int,
    days: int = 30,
    tz_offset_minutes: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """
    Get daily output summary for a patient over specified days.
    Uses the correct nutrition goal for each day based on effective_date.
    Tracks urine count + volume and bowel movement counts.

    `tz_offset_minutes` shifts the day boundary to the caller's local
    midnight (matches the intake summary endpoint). Without it, falls back
    to UTC-day buckets.
    """
    from sqlalchemy import func, cast, Date, case, text
    from datetime import timedelta
    from schemas.nutrition_output import NutritionOutput
    from schemas.nutrition_goal import NutritionGoal

    try:
        if tz_offset_minutes is not None:
            now_local = datetime.utcnow() + timedelta(minutes=tz_offset_minutes)
            end_date_val = now_local.date()
        else:
            end_date_val = date.today()
        start_date_val = end_date_val - timedelta(days=days - 1)

        # Get all goals for this patient (including historical) sorted by effective_date desc
        all_goals = db.query(NutritionGoal).filter(
            NutritionGoal.patient_id == patient_id
        ).order_by(NutritionGoal.effective_date.desc()).all()

        # Shifted-by-offset event time so buckets are caller's local days.
        if tz_offset_minutes is not None:
            local_occurred = NutritionOutput.occurred_at + text(f"INTERVAL '{tz_offset_minutes} minutes'")
        else:
            local_occurred = NutritionOutput.occurred_at
        bucket_date = cast(local_occurred, Date)

        # Daily urine — both total ml and count. Caregivers want to see
        # frequency (count) and volume (ml) together; the chart pairs them
        # on dual axes.
        daily_urine = db.query(
            bucket_date.label('date'),
            func.sum(
                case(
                    (NutritionOutput.amount_unit.in_(['oz', 'ounces']), NutritionOutput.amount * 29.5735),
                    (NutritionOutput.amount_unit.in_(['cup', 'cups']), NutritionOutput.amount * 236.588),
                    (NutritionOutput.amount_unit.in_(['liter', 'liters', 'l']), NutritionOutput.amount * 1000),
                    else_=NutritionOutput.amount
                )
            ).label('total_urine_ml'),
            func.count(NutritionOutput.id).label('urine_count')
        ).filter(
            NutritionOutput.patient_id == patient_id,
            NutritionOutput.output_type == 'urine',
            bucket_date >= start_date_val,
            bucket_date <= end_date_val
        ).group_by(
            bucket_date
        ).all()

        # Daily bowel movement count
        daily_bowel = db.query(
            bucket_date.label('date'),
            func.count(NutritionOutput.id).label('bowel_count')
        ).filter(
            NutritionOutput.patient_id == patient_id,
            NutritionOutput.output_type == 'bowel',
            bucket_date >= start_date_val,
            bucket_date <= end_date_val
        ).group_by(
            bucket_date
        ).all()

        # Convert to dicts for lookup
        urine_ml_by_date = {row.date: float(row.total_urine_ml or 0) for row in daily_urine}
        urine_count_by_date = {row.date: int(row.urine_count or 0) for row in daily_urine}
        bowel_by_date = {row.date: int(row.bowel_count or 0) for row in daily_bowel}
        
        def find_goal_for_date(target_date: date):
            """Find the applicable goal for a specific date"""
            for goal in all_goals:
                goal_effective = goal.effective_date.date() if isinstance(goal.effective_date, datetime) else goal.effective_date
                if goal_effective <= target_date:
                    if goal.end_date:
                        goal_end = goal.end_date.date() if isinstance(goal.end_date, datetime) else goal.end_date
                        if goal_end < target_date:
                            continue
                    if goal.is_active:
                        return goal
            return None
        
        # Build result for each day
        result = []
        current_date = start_date_val
        while current_date <= end_date_val:
            goal = find_goal_for_date(current_date)
            
            day_data = {
                'date': current_date.isoformat(),
                'urine_ml': round(urine_ml_by_date.get(current_date, 0), 1),
                'urine_count': urine_count_by_date.get(current_date, 0),
                'bowel_count': bowel_by_date.get(current_date, 0),
                'urine_target': goal.urine_output_ml_min if goal else None,
                'bowel_target': goal.bowel_movements_target if goal else None
            }
            
            result.append(day_data)
            current_date += timedelta(days=1)
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting output history: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nutrition/outputs/{output_id}", response_model=NutritionOutputResponse)
async def get_output(output_id: int, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get a specific output log"""
    output = get_nutrition_output_by_id(db, output_id)
    if not output:
        raise HTTPException(status_code=404, detail="Output log not found")
    return output


@router.put("/nutrition/outputs/{output_id}", response_model=NutritionOutputResponse, dependencies=[Depends(require_permission("nutrition.update"))])
async def update_output(output_id: int, update_data: NutritionOutputUpdate, db: Session = Depends(get_db)):
    """Update an output log entry"""
    output = update_nutrition_output(db, output_id, update_data.model_dump(exclude_unset=True))
    if not output:
        raise HTTPException(status_code=404, detail="Output log not found")
    return output


@router.delete("/nutrition/outputs/{output_id}", dependencies=[Depends(require_permission("nutrition.delete"))])
async def delete_output(output_id: int, db: Session = Depends(get_db)):
    """Delete an output log entry"""
    if not delete_nutrition_output(db, output_id):
        raise HTTPException(status_code=404, detail="Output log not found")
    return {"success": True}


# =============================================
# NUTRITION SCHEDULE ROUTES
# =============================================

@router.get("/nutrition/schedules/types")
async def get_schedule_types(_: bool = Depends(require_read_access)):
    """Get available schedule types"""
    return {"schedule_types": SCHEDULE_TYPES}


@router.post("/nutrition/schedules", response_model=NutritionScheduleResponse)
async def create_schedule(schedule_data: NutritionScheduleCreate, db: Session = Depends(get_db)):
    """Create a new nutrition schedule"""
    try:
        schedule = create_nutrition_schedule(db, schedule_data.model_dump())
        return schedule
    except Exception as e:
        logger.error(f"Error creating nutrition schedule: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nutrition/schedules/patient/{patient_id}", response_model=List[NutritionScheduleResponse])
async def get_schedules_for_patient(
    patient_id: int,
    schedule_type: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get nutrition schedules for a patient"""
    return get_patient_nutrition_schedules(db, patient_id, schedule_type, active_only)


@router.get("/nutrition/schedules/{schedule_id}", response_model=NutritionScheduleResponse)
async def get_schedule(schedule_id: int, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get a specific nutrition schedule"""
    schedule = get_nutrition_schedule_by_id(db, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Nutrition schedule not found")
    return schedule


@router.put("/nutrition/schedules/{schedule_id}", response_model=NutritionScheduleResponse)
async def update_schedule(schedule_id: int, update_data: NutritionScheduleUpdate, db: Session = Depends(get_db)):
    """Update a nutrition schedule"""
    schedule = update_nutrition_schedule(db, schedule_id, update_data.model_dump(exclude_unset=True))
    if not schedule:
        raise HTTPException(status_code=404, detail="Nutrition schedule not found")
    return schedule


@router.post("/nutrition/schedules/{schedule_id}/toggle", response_model=NutritionScheduleResponse)
async def toggle_schedule(schedule_id: int, db: Session = Depends(get_db)):
    """Toggle a nutrition schedule active status"""
    schedule = toggle_nutrition_schedule(db, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Nutrition schedule not found")
    return schedule


@router.delete("/nutrition/schedules/{schedule_id}")
async def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    """Delete a nutrition schedule"""
    if not delete_nutrition_schedule(db, schedule_id):
        raise HTTPException(status_code=404, detail="Nutrition schedule not found")
    return {"success": True}

