from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, func
from datetime import datetime, date, timedelta
from typing import List, Optional
from schemas.nutrition_intake import NutritionIntake
from schemas.patient import Patient
import logging
import asyncio

logger = logging.getLogger(__name__)

def _get_event_bus():
    """Get the event bus instance from main module."""
    try:
        from main import get_modules
        modules = get_modules()
        return modules.get("event_bus")
    except Exception as e:
        logger.error(f"Failed to get event bus: {e}")
        return None

def _publish_event_async(event):
    """Helper to publish event to event bus from sync code."""
    try:
        event_bus = _get_event_bus()
        if event_bus:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(event_bus.publish(event))
            else:
                loop.run_until_complete(event_bus.publish(event))
        else:
            logger.warning("Event bus not available for publishing")
    except Exception as e:
        logger.error(f"Failed to publish event: {e}")

def _publish_nutrition_mqtt(db: Session, patient_id: int):
    """Publish nutrition dashboard data to MQTT"""
    try:
        from events import NutritionSensorUpdate, EventSource
        
        # Get dashboard data
        dashboard_data = _get_nutrition_dashboard_data(db, patient_id)
        
        # Publish WATER intake (actual consumed)
        water_intake_event = NutritionSensorUpdate(
            sensor_type="nutrition_water_intake",
            value=dashboard_data["total_water_ml"],
            timestamp=datetime.now(),
            source=EventSource.API,
            metadata={
                "day_start": dashboard_data["day_start"],
                "day_end": dashboard_data["day_end"]
            }
        )
        _publish_event_async(water_intake_event)
        
        # Publish WATER scheduled (expected progress)
        water_scheduled_event = NutritionSensorUpdate(
            sensor_type="nutrition_water_scheduled",
            value=dashboard_data["scheduled_water_ml"],
            timestamp=datetime.now(),
            source=EventSource.API,
            metadata={
                "scheduled_feedings_past": dashboard_data["scheduled_feedings_past"],
                "total_scheduled_feedings": dashboard_data["total_scheduled_feedings"],
                "day_start": dashboard_data["day_start"],
                "day_end": dashboard_data["day_end"]
            }
        )
        _publish_event_async(water_scheduled_event)
        
        # Publish WATER target (daily limit)
        water_target_event = NutritionSensorUpdate(
            sensor_type="nutrition_water_target",
            value=dashboard_data["target_water_ml"],
            timestamp=datetime.now(),
            source=EventSource.API,
            metadata={
                "day_start": dashboard_data["day_start"],
                "day_end": dashboard_data["day_end"]
            }
        )
        _publish_event_async(water_target_event)
        
        # Publish CALORIES intake (actual consumed)
        calories_intake_event = NutritionSensorUpdate(
            sensor_type="nutrition_calories_intake",
            value=dashboard_data["total_calories"],
            timestamp=datetime.now(),
            source=EventSource.API,
            metadata={
                "day_start": dashboard_data["day_start"],
                "day_end": dashboard_data["day_end"]
            }
        )
        _publish_event_async(calories_intake_event)
        
        # Publish CALORIES scheduled (expected progress)
        calories_scheduled_event = NutritionSensorUpdate(
            sensor_type="nutrition_calories_scheduled",
            value=dashboard_data["scheduled_calories"],
            timestamp=datetime.now(),
            source=EventSource.API,
            metadata={
                "scheduled_feedings_past": dashboard_data["scheduled_feedings_past"],
                "total_scheduled_feedings": dashboard_data["total_scheduled_feedings"],
                "day_start": dashboard_data["day_start"],
                "day_end": dashboard_data["day_end"]
            }
        )
        _publish_event_async(calories_scheduled_event)
        
        # Publish CALORIES target (daily limit)
        calories_target_event = NutritionSensorUpdate(
            sensor_type="nutrition_calories_target",
            value=dashboard_data["target_calories"],
            timestamp=datetime.now(),
            source=EventSource.API,
            metadata={
                "day_start": dashboard_data["day_start"],
                "day_end": dashboard_data["day_end"]
            }
        )
        _publish_event_async(calories_target_event)
        
        logger.info(f"Published nutrition MQTT: {dashboard_data['total_calories']} cal, {dashboard_data['total_water_ml']} ml")
    except Exception as e:
        logger.error(f"Error publishing nutrition to MQTT: {e}")

def _publish_nutrition_scheduled_mqtt(db: Session, patient_id: int):
    """Publish only scheduled nutrition values (for hourly updates)"""
    try:
        from events import NutritionSensorUpdate, EventSource
        
        # Get dashboard data
        dashboard_data = _get_nutrition_dashboard_data(db, patient_id)
        
        # Publish WATER scheduled
        water_scheduled_event = NutritionSensorUpdate(
            sensor_type="nutrition_water_scheduled",
            value=dashboard_data["scheduled_water_ml"],
            timestamp=datetime.now(),
            source=EventSource.SYSTEM,
            metadata={
                "scheduled_feedings_past": dashboard_data["scheduled_feedings_past"],
                "total_scheduled_feedings": dashboard_data["total_scheduled_feedings"],
                "day_start": dashboard_data["day_start"],
                "day_end": dashboard_data["day_end"]
            }
        )
        _publish_event_async(water_scheduled_event)
        
        # Publish CALORIES scheduled
        calories_scheduled_event = NutritionSensorUpdate(
            sensor_type="nutrition_calories_scheduled",
            value=dashboard_data["scheduled_calories"],
            timestamp=datetime.now(),
            source=EventSource.SYSTEM,
            metadata={
                "scheduled_feedings_past": dashboard_data["scheduled_feedings_past"],
                "total_scheduled_feedings": dashboard_data["total_scheduled_feedings"],
                "day_start": dashboard_data["day_start"],
                "day_end": dashboard_data["day_end"]
            }
        )
        _publish_event_async(calories_scheduled_event)
        
        logger.info(f"Published nutrition scheduled MQTT: {dashboard_data['scheduled_calories']} cal, {dashboard_data['scheduled_water_ml']} ml")
    except Exception as e:
        logger.error(f"Error publishing nutrition scheduled to MQTT: {e}")

def _publish_nutrition_targets_mqtt(db: Session, patient_id: int):
    """Publish only nutrition targets (for settings changes)"""
    try:
        from events import NutritionSensorUpdate, EventSource
        from crud.settings import get_setting
        
        # Get targets
        target_calories_setting = get_setting(db, 'daily_calories')
        target_water_setting = get_setting(db, 'daily_water')
        target_calories = float(target_calories_setting) if target_calories_setting else 2000
        target_water = float(target_water_setting) if target_water_setting else 2000
        
        # Calculate day boundaries
        day_start_hour_setting = get_setting(db, 'day_start_hour')
        day_start_hour = int(day_start_hour_setting) if day_start_hour_setting else 7
        now = datetime.now()
        if now.hour < day_start_hour:
            day_start = datetime(now.year, now.month, now.day, day_start_hour, 0, 0) - timedelta(days=1)
        else:
            day_start = datetime(now.year, now.month, now.day, day_start_hour, 0, 0)
        day_end = day_start + timedelta(days=1)
        
        # Publish WATER target
        water_target_event = NutritionSensorUpdate(
            sensor_type="nutrition_water_target",
            value=target_water,
            timestamp=datetime.now(),
            source=EventSource.API,
            metadata={
                "day_start": day_start.isoformat(),
                "day_end": day_end.isoformat()
            }
        )
        _publish_event_async(water_target_event)
        
        # Publish CALORIES target
        calories_target_event = NutritionSensorUpdate(
            sensor_type="nutrition_calories_target",
            value=target_calories,
            timestamp=datetime.now(),
            source=EventSource.API,
            metadata={
                "day_start": day_start.isoformat(),
                "day_end": day_end.isoformat()
            }
        )
        _publish_event_async(calories_target_event)
        
        logger.info(f"Published nutrition targets MQTT: {target_calories} cal, {target_water} ml")
    except Exception as e:
        logger.error(f"Error publishing nutrition targets to MQTT: {e}")

def _get_nutrition_dashboard_data(db: Session, patient_id: int) -> dict:
    """Get nutrition dashboard data for MQTT publishing"""
    from crud.settings import get_setting
    from models import CareTaskSchedule, CareTask
    from croniter import croniter
    import json
    
    # Get day_start_hour setting (default 7am)
    day_start_hour_setting = get_setting(db, 'day_start_hour')
    day_start_hour = int(day_start_hour_setting) if day_start_hour_setting else 7
    
    # Get daily targets
    target_calories_setting = get_setting(db, 'daily_calories')
    target_water_setting = get_setting(db, 'daily_water')
    target_calories = float(target_calories_setting) if target_calories_setting else 2000
    target_water = float(target_water_setting) if target_water_setting else 2000  # ml
    
    # Calculate the current "day" based on day_start_hour
    now = datetime.now()
    
    # If current hour is before day_start_hour, we're still in "yesterday"
    if now.hour < day_start_hour:
        day_start = datetime(now.year, now.month, now.day, day_start_hour, 0, 0) - timedelta(days=1)
    else:
        day_start = datetime(now.year, now.month, now.day, day_start_hour, 0, 0)
    
    day_end = day_start + timedelta(days=1)
    
    # Get nutrition data for current "day"
    daily_intake = db.query(NutritionIntake).filter(
        NutritionIntake.patient_id == patient_id,
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
    
    # Get scheduled nutrition tasks
    nutrition_schedules = db.query(CareTaskSchedule).join(CareTask).filter(
        CareTask.category_id == 1,
        CareTaskSchedule.active == True,
        CareTaskSchedule.patient_id == patient_id
    ).all()
    
    scheduled_feedings_past = 0
    total_scheduled_feedings = 0
    scheduled_calories_past = 0
    scheduled_water_past = 0
    
    for schedule in nutrition_schedules:
        schedule_times = []
        temp_cron = croniter(schedule.cron_expression, day_start - timedelta(seconds=1))
        while True:
            next_time = temp_cron.get_next(datetime)
            if next_time >= day_end:
                break
            schedule_times.append(next_time)
            total_scheduled_feedings += 1
        
        for scheduled_time in schedule_times:
            if scheduled_time <= now:
                scheduled_feedings_past += 1
                
                if schedule.notes:
                    try:
                        notes_data = json.loads(schedule.notes)
                        if 'nutrition' in notes_data:
                            nutrition_info = notes_data['nutrition']
                            if nutrition_info.get('calories'):
                                scheduled_calories_past += float(nutrition_info['calories'])
                            
                            if nutrition_info.get('item_type') == 'liquid':
                                amount = float(nutrition_info.get('amount', 0))
                                unit = nutrition_info.get('amount_unit', 'ml').lower()
                                amount_ml = amount
                                if unit in ['oz', 'ounces']:
                                    amount_ml = amount * 29.5735
                                elif unit in ['cup', 'cups']:
                                    amount_ml = amount * 236.588
                                elif unit in ['liter', 'liters', 'l']:
                                    amount_ml = amount * 1000
                                scheduled_water_past += amount_ml
                    except (json.JSONDecodeError, KeyError, ValueError) as e:
                        logger.warning(f"Failed to parse nutrition notes '{schedule.notes}': {e}")
    
    if total_scheduled_feedings == 0:
        time_elapsed = (now - day_start).total_seconds()
        day_duration = 24 * 3600
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

def create_nutrition_intake(db: Session, intake_data: dict, patient_id: int = None) -> NutritionIntake:
    """Create a new nutrition intake record"""
    try:
        # Use provided patient_id or get active patient
        if not patient_id:
            active_patient = db.query(Patient).filter(Patient.is_active == True).first()
            if not active_patient:
                raise ValueError("No active patient found")
            patient_id = active_patient.id
        
        # Create the nutrition intake record
        nutrition_intake = NutritionIntake(
            patient_id=patient_id,
            care_task_log_id=intake_data.get('care_task_log_id'),
            item_name=intake_data['item_name'],
            item_type=intake_data['item_type'],
            amount=intake_data['amount'],
            amount_unit=intake_data['amount_unit'],
            calories=intake_data.get('calories'),
            protein_grams=intake_data.get('protein_grams'),
            carbs_grams=intake_data.get('carbs_grams'),
            fat_grams=intake_data.get('fat_grams'),
            fiber_grams=intake_data.get('fiber_grams'),
            sodium_mg=intake_data.get('sodium_mg'),
            consumed_at=intake_data.get('consumed_at') or datetime.utcnow(),
            meal_type=intake_data.get('meal_type'),
            notes=intake_data.get('notes'),
            recorded_by=intake_data.get('recorded_by'),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(nutrition_intake)
        db.commit()
        db.refresh(nutrition_intake)
        
        logger.info(f"Created nutrition intake record: {nutrition_intake.id}")
        
        # Publish to MQTT
        _publish_nutrition_mqtt(db, patient_id)
        
        return nutrition_intake
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating nutrition intake: {str(e)}")
        raise

def get_nutrition_intake_by_id(db: Session, intake_id: int) -> Optional[NutritionIntake]:
    """Get a nutrition intake record by ID"""
    return db.query(NutritionIntake).filter(NutritionIntake.id == intake_id).first()

def get_patient_nutrition_intake(db: Session, patient_id: int, limit: int = 50) -> List[NutritionIntake]:
    """Get nutrition intake records for a patient"""
    return db.query(NutritionIntake)\
        .filter(NutritionIntake.patient_id == patient_id)\
        .order_by(desc(NutritionIntake.consumed_at))\
        .limit(limit)\
        .all()

def get_daily_nutrition_intake(db: Session, patient_id: int, target_date: date = None) -> List[NutritionIntake]:
    """Get nutrition intake records for a specific day"""
    if not target_date:
        target_date = date.today()
    
    start_of_day = datetime.combine(target_date, datetime.min.time())
    end_of_day = datetime.combine(target_date, datetime.max.time())
    
    return db.query(NutritionIntake)\
        .filter(
            and_(
                NutritionIntake.patient_id == patient_id,
                NutritionIntake.consumed_at >= start_of_day,
                NutritionIntake.consumed_at <= end_of_day
            )
        )\
        .order_by(NutritionIntake.consumed_at)\
        .all()

def get_nutrition_summary(db: Session, patient_id: int, target_date: date = None) -> dict:
    """Get daily nutrition summary (totals for calories, water, etc.)"""
    daily_intake = get_daily_nutrition_intake(db, patient_id, target_date)
    
    summary = {
        'total_calories': 0,
        'total_protein': 0,
        'total_carbs': 0,
        'total_fat': 0,
        'total_fiber': 0,
        'total_sodium': 0,
        'total_liquids_ml': 0,
        'meal_breakdown': {
            'breakfast': {'count': 0, 'calories': 0},
            'lunch': {'count': 0, 'calories': 0},
            'dinner': {'count': 0, 'calories': 0},
            'snack': {'count': 0, 'calories': 0},
            'supplement': {'count': 0, 'calories': 0}
        },
        'items': []
    }
    
    for intake in daily_intake:
        # Add to totals
        if intake.calories:
            summary['total_calories'] += intake.calories
        if intake.protein_grams:
            summary['total_protein'] += intake.protein_grams
        if intake.carbs_grams:
            summary['total_carbs'] += intake.carbs_grams
        if intake.fat_grams:
            summary['total_fat'] += intake.fat_grams
        if intake.fiber_grams:
            summary['total_fiber'] += intake.fiber_grams
        if intake.sodium_mg:
            summary['total_sodium'] += intake.sodium_mg
            
        # Track liquids (in ml)
        if intake.item_type == 'liquid':
            amount_ml = intake.amount
            # Convert common units to ml
            if intake.amount_unit.lower() in ['oz', 'ounces']:
                amount_ml = intake.amount * 29.5735  # oz to ml
            elif intake.amount_unit.lower() in ['cup', 'cups']:
                amount_ml = intake.amount * 236.588  # cups to ml
            elif intake.amount_unit.lower() in ['liter', 'liters', 'l']:
                amount_ml = intake.amount * 1000  # liters to ml
            
            summary['total_liquids_ml'] += amount_ml
        
        # Meal breakdown
        meal_type = intake.meal_type or 'snack'
        if meal_type in summary['meal_breakdown']:
            summary['meal_breakdown'][meal_type]['count'] += 1
            if intake.calories:
                summary['meal_breakdown'][meal_type]['calories'] += intake.calories
        
        # Add to items list
        summary['items'].append({
            'id': intake.id,
            'item_name': intake.item_name,
            'item_type': intake.item_type,
            'amount': intake.amount,
            'amount_unit': intake.amount_unit,
            'calories': intake.calories,
            'consumed_at': intake.consumed_at.isoformat(),
            'meal_type': intake.meal_type,
            'notes': intake.notes
        })
    
    return summary

def update_nutrition_intake(db: Session, intake_id: int, update_data: dict) -> Optional[NutritionIntake]:
    """Update a nutrition intake record"""
    try:
        intake = db.query(NutritionIntake).filter(NutritionIntake.id == intake_id).first()
        if not intake:
            return None
            
        # Update fields
        for field, value in update_data.items():
            if hasattr(intake, field) and field not in ['id', 'created_at']:
                setattr(intake, field, value)
        
        intake.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(intake)
        
        logger.info(f"Updated nutrition intake record: {intake_id}")
        
        # Publish to MQTT
        _publish_nutrition_mqtt(db, intake.patient_id)
        
        return intake
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating nutrition intake {intake_id}: {str(e)}")
        raise

def delete_nutrition_intake(db: Session, intake_id: int) -> bool:
    """Delete a nutrition intake record"""
    try:
        intake = db.query(NutritionIntake).filter(NutritionIntake.id == intake_id).first()
        if not intake:
            return False
        
        patient_id = intake.patient_id
        
        db.delete(intake)
        db.commit()
        
        logger.info(f"Deleted nutrition intake record: {intake_id}")
        
        # Publish to MQTT
        _publish_nutrition_mqtt(db, patient_id)
        
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting nutrition intake {intake_id}: {str(e)}")
        raise

def get_nutrition_intake_for_care_task(db: Session, care_task_log_id: int) -> List[NutritionIntake]:
    """Get nutrition intake records linked to a specific care task completion"""
    return db.query(NutritionIntake)\
        .filter(NutritionIntake.care_task_log_id == care_task_log_id)\
        .order_by(NutritionIntake.consumed_at)\
        .all()
