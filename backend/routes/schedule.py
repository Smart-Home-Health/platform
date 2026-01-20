"""
Schedule routes - Daily schedule view combining medications, nutrition schedules, and care tasks
"""
import logging
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_

from db import get_db
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog
from schemas.care_task import CareTask
from schemas.care_task_schedule import CareTaskSchedule
from schemas.care_task_log import CareTaskLog
from schemas.care_task_category import CareTaskCategory
from schemas.nutrition_schedule import NutritionSchedule
from schemas.nutrition_intake import NutritionIntake
from croniter import croniter

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


@router.get("/daily")
async def get_daily_schedule(
    target_date: str = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
    patient_id: int = Query(..., description="Patient ID"),
    db: Session = Depends(get_db)
):
    """
    Get the complete daily schedule for a patient, organized by hour.
    Returns medications, nutrition schedules, and care tasks with completion status.
    """
    try:
        # Parse target date
        if target_date:
            schedule_date = datetime.strptime(target_date, "%Y-%m-%d").date()
        else:
            schedule_date = date.today()
        
        # Get all scheduled items
        medications = get_scheduled_medications(db, schedule_date, patient_id)
        nutrition_items = get_scheduled_nutrition(db, schedule_date, patient_id)
        care_tasks = get_scheduled_care_tasks(db, schedule_date, patient_id)
        
        # Check completion status for medications
        med_logs = db.query(MedicationLog).filter(
            MedicationLog.patient_id == patient_id,
            MedicationLog.administered_at >= datetime.combine(schedule_date, datetime.min.time()),
            MedicationLog.administered_at <= datetime.combine(schedule_date, datetime.max.time())
        ).all()
        
        # Create a set of completed schedule_id + scheduled_time combinations
        completed_med_times = set()
        for log in med_logs:
            if log.schedule_id and log.scheduled_time:
                key = f"{log.schedule_id}_{log.scheduled_time.strftime('%H:%M')}"
                completed_med_times.add(key)
        
        # Check completion status for care tasks
        task_logs = db.query(CareTaskLog).filter(
            CareTaskLog.patient_id == patient_id,
            CareTaskLog.completed_at >= datetime.combine(schedule_date, datetime.min.time()),
            CareTaskLog.completed_at <= datetime.combine(schedule_date, datetime.max.time())
        ).all()
        
        completed_task_times = set()
        for log in task_logs:
            if log.schedule_id and log.scheduled_time:
                key = f"{log.schedule_id}_{log.scheduled_time.strftime('%H:%M')}"
                completed_task_times.add(key)
        
        # Check completion status for nutrition schedules (via nutrition_intake)
        nutrition_logs = db.query(NutritionIntake).filter(
            NutritionIntake.patient_id == patient_id,
            NutritionIntake.consumed_at >= datetime.combine(schedule_date, datetime.min.time()),
            NutritionIntake.consumed_at <= datetime.combine(schedule_date, datetime.max.time())
        ).all()
        
        # For nutrition, we check if intake was logged around the scheduled time (within 30 min)
        completed_nutrition_times = set()
        for log in nutrition_logs:
            for nutr in nutrition_items:
                if abs((log.consumed_at.replace(tzinfo=None) - nutr['scheduled_time']).total_seconds()) <= 1800:  # 30 minutes
                    key = f"{nutr['schedule_id']}_{nutr['scheduled_time'].strftime('%H:%M')}"
                    completed_nutrition_times.add(key)
        
        # Build response with completion status
        result = {
            "date": schedule_date.isoformat(),
            "patient_id": patient_id,
            "medications": [],
            "nutrition": [],
            "care_tasks": []
        }
        
        for med in medications:
            key = f"{med['schedule_id']}_{med['scheduled_time'].strftime('%H:%M')}"
            result["medications"].append({
                "schedule_id": med["schedule_id"],
                "medication_id": med["medication_id"],
                "name": med["medication_name"],
                "dose_amount": med["dose_amount"],
                "dose_unit": med["dose_unit"],
                "scheduled_time": med["scheduled_time"].isoformat(),
                "hour": med["scheduled_time"].hour,
                "minute": med["scheduled_time"].minute,
                "description": med["description"],
                "completed": key in completed_med_times,
                "type": "medication"
            })
        
        for nutr in nutrition_items:
            key = f"{nutr['schedule_id']}_{nutr['scheduled_time'].strftime('%H:%M')}"
            result["nutrition"].append({
                "schedule_id": nutr["schedule_id"],
                "name": nutr["name"],
                "schedule_type": nutr["schedule_type"],
                "description": nutr.get("instructions"),
                "default_item": nutr.get("default_item_name"),
                "default_amount": nutr.get("default_amount"),
                "default_amount_unit": nutr.get("default_amount_unit"),
                "default_calories": nutr.get("default_calories"),
                "scheduled_time": nutr["scheduled_time"].isoformat(),
                "hour": nutr["scheduled_time"].hour,
                "minute": nutr["scheduled_time"].minute,
                "notes": nutr.get("notes"),
                "completed": key in completed_nutrition_times,
                "type": "nutrition"
            })
        
        for task in care_tasks:
            key = f"{task['schedule_id']}_{task['scheduled_time'].strftime('%H:%M')}"
            result["care_tasks"].append({
                "schedule_id": task["schedule_id"],
                "care_task_id": task["care_task_id"],
                "name": task["care_task_name"],
                "description": task.get("care_task_description"),
                "scheduled_time": task["scheduled_time"].isoformat(),
                "hour": task["scheduled_time"].hour,
                "minute": task["scheduled_time"].minute,
                "notes": task.get("notes"),
                "completed": key in completed_task_times,
                "category_id": task.get("category_id"),
                "category_name": task.get("category_name"),
                "category_color": task.get("category_color"),
                "type": "care_task"
            })
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting daily schedule: {e}")
        return {"error": str(e), "date": target_date, "medications": [], "nutrition": [], "care_tasks": []}


def get_scheduled_medications(db: Session, target_date: date, patient_id: int):
    """
    Get all medications scheduled for a specific date for a patient.
    Only includes medications where start_date <= target_date (or no start_date).
    """
    try:
        # Get all active medication schedules for this patient
        schedules = db.query(MedicationSchedule).filter(
            MedicationSchedule.active == True,
            (MedicationSchedule.patient_id == patient_id) | (MedicationSchedule.patient_id == None)
        ).join(Medication).filter(
            Medication.active == True,
            (Medication.patient_id == patient_id) | (Medication.patient_id == None),
            # Only include if start_date is null or <= target_date
            (Medication.start_date == None) | (Medication.start_date <= datetime.combine(target_date, datetime.max.time())),
            # Exclude if end_date is set and < target_date
            (Medication.end_date == None) | (Medication.end_date >= datetime.combine(target_date, datetime.min.time()))
        ).all()
        
        scheduled_meds = []
        
        for schedule in schedules:
            try:
                # Create datetime for start of target date
                start_of_day = datetime.combine(target_date, datetime.min.time())
                
                # Initialize croniter with a time before the target date
                base_time = start_of_day - timedelta(days=1)
                cron = croniter(schedule.cron_expression, base_time)
                
                # Find all scheduled times for the target date
                while True:
                    next_time = cron.get_next(datetime)
                    if next_time.date() > target_date:
                        break
                    if next_time.date() == target_date:
                        scheduled_meds.append({
                            'schedule_id': schedule.id,
                            'medication_id': schedule.medication_id,
                            'medication_name': schedule.medication.name,
                            'dose_amount': schedule.dose_amount,
                            'dose_unit': schedule.medication.quantity_unit,
                            'scheduled_time': next_time,
                            'description': schedule.description,
                            'cron_expression': schedule.cron_expression
                        })
            except Exception as cron_error:
                logger.error(f"Error processing cron expression {schedule.cron_expression}: {cron_error}")
                continue
        
        return sorted(scheduled_meds, key=lambda x: x['scheduled_time'])
        
    except Exception as e:
        logger.error(f"Error getting scheduled medications: {e}")
        return []


def get_scheduled_care_tasks(db: Session, target_date: date, patient_id: int):
    """
    Get all care tasks scheduled for a specific date for a patient.
    Includes category information for nutrition detection.
    """
    try:
        # Get all active care task schedules for this patient
        schedules = db.query(CareTaskSchedule).filter(
            CareTaskSchedule.active == True,
            (CareTaskSchedule.patient_id == patient_id) | (CareTaskSchedule.patient_id == None)
        ).join(CareTask).filter(
            CareTask.active == True,
            (CareTask.patient_id == patient_id) | (CareTask.patient_id == None)
        ).all()
        
        scheduled_tasks = []
        
        for schedule in schedules:
            try:
                # Create datetime for start of target date
                start_of_day = datetime.combine(target_date, datetime.min.time())
                
                # Initialize croniter with a time before the target date
                base_time = start_of_day - timedelta(days=1)
                cron = croniter(schedule.cron_expression, base_time)
                
                # Get category info
                category = schedule.care_task.category
                
                # Find all scheduled times for the target date
                while True:
                    next_time = cron.get_next(datetime)
                    if next_time.date() > target_date:
                        break
                    if next_time.date() == target_date:
                        scheduled_tasks.append({
                            'schedule_id': schedule.id,
                            'care_task_id': schedule.care_task_id,
                            'care_task_name': schedule.care_task.name,
                            'care_task_description': schedule.care_task.description,
                            'scheduled_time': next_time,
                            'schedule_description': schedule.description,
                            'notes': schedule.notes,
                            'category_id': category.id if category else None,
                            'category_name': category.name if category else None,
                            'category_color': category.color if category else None
                        })
            except Exception as cron_error:
                logger.error(f"Error processing cron expression {schedule.cron_expression}: {cron_error}")
                continue
        
        return sorted(scheduled_tasks, key=lambda x: x['scheduled_time'])
        
    except Exception as e:
        logger.error(f"Error getting scheduled care tasks: {e}")
        return []


def get_scheduled_nutrition(db: Session, target_date: date, patient_id: int):
    """
    Get all nutrition items scheduled for a specific date for a patient.
    Uses the nutrition_schedules table for meals, hydration, bathroom checks, etc.
    """
    try:
        # Get all active nutrition schedules for this patient
        schedules = db.query(NutritionSchedule).filter(
            NutritionSchedule.is_active == True,
            NutritionSchedule.patient_id == patient_id
        ).all()
        
        scheduled_nutrition = []
        
        for schedule in schedules:
            try:
                # Create datetime for start of target date
                start_of_day = datetime.combine(target_date, datetime.min.time())
                
                # Initialize croniter with a time before the target date
                base_time = start_of_day - timedelta(days=1)
                cron = croniter(schedule.cron_expression, base_time)
                
                # Find all scheduled times for the target date
                while True:
                    next_time = cron.get_next(datetime)
                    if next_time.date() > target_date:
                        break
                    if next_time.date() == target_date:
                        scheduled_nutrition.append({
                            'schedule_id': schedule.id,
                            'name': schedule.name,
                            'schedule_type': schedule.schedule_type,
                            'default_item_name': schedule.default_item_name,
                            'default_amount': schedule.default_amount,
                            'default_amount_unit': schedule.default_amount_unit,
                            'default_calories': schedule.default_calories,
                            'scheduled_time': next_time,
                            'instructions': schedule.instructions,
                            'notes': schedule.notes,
                            'cron_expression': schedule.cron_expression
                        })
            except Exception as cron_error:
                logger.error(f"Error processing nutrition cron expression {schedule.cron_expression}: {cron_error}")
                continue
        
        return sorted(scheduled_nutrition, key=lambda x: x['scheduled_time'])
        
    except Exception as e:
        logger.error(f"Error getting scheduled nutrition: {e}")
        return []
