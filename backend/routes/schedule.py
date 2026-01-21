"""
Schedule routes - Daily schedule view combining medications, nutrition schedules, and care tasks
"""
import logging
from datetime import datetime, date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pydantic import BaseModel

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


def parse_scheduled_time(scheduled_time_str: str) -> datetime:
    """
    Parse scheduled time string and return as UTC-aware datetime.
    This ensures PostgreSQL stores the exact time without any timezone conversion.
    """
    from datetime import timezone as tz
    
    # Remove Z or timezone offset to get the raw time
    s = scheduled_time_str
    if s.endswith('Z'):
        s = s[:-1]
    # Handle +00:00 or similar timezone offsets
    if '+' in s and 'T' in s:
        s = s.rsplit('+', 1)[0]
    elif s.count('-') > 2:  # Has negative timezone offset like -05:00
        # Split on T, then handle the time part
        parts = s.split('T')
        if len(parts) == 2:
            time_part = parts[1]
            # Find the last dash that's part of timezone (after HH:MM:SS)
            if '-' in time_part and len(time_part) > 8:
                time_part = time_part.rsplit('-', 1)[0]
                s = f"{parts[0]}T{time_part}"
    
    # Parse as naive datetime then mark as UTC
    # This tells PostgreSQL "this IS UTC" so it won't convert it
    naive_dt = datetime.fromisoformat(s)
    return naive_dt.replace(tzinfo=tz.utc)


# Pydantic models for request bodies
class CompleteItemRequest(BaseModel):
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
    items: List[CompleteItemRequest]


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
        
        # Check completion status for nutrition schedules (via nutrition_intake with schedule_id)
        nutrition_logs = db.query(NutritionIntake).filter(
            NutritionIntake.patient_id == patient_id,
            NutritionIntake.consumed_at >= datetime.combine(schedule_date, datetime.min.time()),
            NutritionIntake.consumed_at <= datetime.combine(schedule_date, datetime.max.time())
        ).all()
        
        # Use schedule_id + scheduled_time for accurate matching
        completed_nutrition_times = set()
        for log in nutrition_logs:
            if log.schedule_id and log.scheduled_time:
                # Use scheduled_time directly if available
                key = f"{log.schedule_id}_{log.scheduled_time.strftime('%H:%M')}"
                completed_nutrition_times.add(key)
            elif log.schedule_id:
                # Fallback: match by schedule_id and consumed_at time
                for nutr in nutrition_items:
                    if log.schedule_id == nutr['schedule_id']:
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


# ===== Completion Endpoints =====

@router.post("/complete/medication")
async def complete_medication(
    data: CompleteItemRequest,
    db: Session = Depends(get_db)
):
    """Mark a scheduled medication as administered"""
    try:
        # Parse scheduled time
        scheduled_dt = parse_scheduled_time(data.scheduled_time)
        
        # Parse completed_at time if provided, otherwise use now
        if data.completed_at:
            completed_at = parse_scheduled_time(data.completed_at)
        else:
            completed_at = datetime.now()
        
        logger.info(f"Completing medication: schedule_id={data.schedule_id}, scheduled_time={data.scheduled_time}, completed_at={completed_at}")
        
        # Get the schedule to find medication ID
        schedule = db.query(MedicationSchedule).filter(MedicationSchedule.id == data.schedule_id).first()
        if not schedule:
            return {"success": False, "error": "Schedule not found"}
        
        # Get medication for dose info
        medication = db.query(Medication).filter(Medication.id == schedule.medication_id).first()
        if not medication:
            return {"success": False, "error": "Medication not found"}
        
        # Use provided dose or fall back to schedule defaults
        dose_amount = data.dose_amount if data.dose_amount is not None else (schedule.dose_amount or 0)
        
        # Deduct from quantity if applicable
        if dose_amount > 0 and medication.quantity is not None:
            medication.quantity = max(0, medication.quantity - float(dose_amount))
        
        # Create log entry
        log = MedicationLog(
            medication_id=medication.id,
            patient_id=data.patient_id,
            schedule_id=data.schedule_id,
            administered_at=completed_at,
            dose_amount=dose_amount,
            is_scheduled=True,
            scheduled_time=scheduled_dt,
            administered_early=False,
            administered_late=False,
            notes=data.notes,
            created_at=datetime.now()
        )
        db.add(log)
        db.commit()
        
        return {"success": True, "log_id": log.id}
    except Exception as e:
        logger.error(f"Error completing medication: {e}")
        db.rollback()
        return {"success": False, "error": str(e)}


@router.post("/complete/nutrition")
async def complete_nutrition(
    data: CompleteItemRequest,
    db: Session = Depends(get_db)
):
    """Mark a scheduled nutrition item as completed"""
    try:
        # Parse scheduled time
        scheduled_dt = parse_scheduled_time(data.scheduled_time)
        
        # Parse completed_at time if provided, otherwise use now
        if data.completed_at:
            completed_at = parse_scheduled_time(data.completed_at)
        else:
            completed_at = datetime.now()
        
        # Get the schedule for default values
        schedule = db.query(NutritionSchedule).filter(NutritionSchedule.id == data.schedule_id).first()
        if not schedule:
            return {"success": False, "error": "Schedule not found"}
        
        # Use provided values or fall back to schedule defaults
        item_name = data.item_name or schedule.default_item_name or schedule.name
        amount = data.amount if data.amount is not None else (schedule.default_amount or 0)
        amount_unit = data.amount_unit or schedule.default_amount_unit or 'servings'
        
        # Create nutrition intake record
        intake = NutritionIntake(
            patient_id=data.patient_id,
            schedule_id=data.schedule_id,
            item_name=item_name,
            item_type=schedule.schedule_type or 'food',  # Map schedule_type to item_type
            amount=amount,
            amount_unit=amount_unit,
            calories=schedule.default_calories,
            consumed_at=completed_at,
            scheduled_time=scheduled_dt,
            notes=data.notes or f"Completed from schedule '{schedule.name}' at {scheduled_dt.strftime('%H:%M')}",
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        db.add(intake)
        db.commit()
        
        return {"success": True, "intake_id": intake.id}
    except Exception as e:
        logger.error(f"Error completing nutrition: {e}")
        db.rollback()
        return {"success": False, "error": str(e)}


@router.post("/complete/care-task")
async def complete_care_task(
    data: CompleteItemRequest,
    db: Session = Depends(get_db)
):
    """Mark a scheduled care task as completed"""
    try:
        # Parse scheduled time
        scheduled_dt = parse_scheduled_time(data.scheduled_time)
        
        # Parse completed_at time if provided, otherwise use now
        if data.completed_at:
            completed_at = parse_scheduled_time(data.completed_at)
        else:
            completed_at = datetime.now()
        
        # Get the schedule to find care task ID
        schedule = db.query(CareTaskSchedule).filter(CareTaskSchedule.id == data.schedule_id).first()
        if not schedule:
            return {"success": False, "error": "Schedule not found"}
        
        # Create log entry
        log = CareTaskLog(
            care_task_id=schedule.care_task_id,
            patient_id=data.patient_id,
            schedule_id=data.schedule_id,
            scheduled_time=scheduled_dt,
            completed_at=completed_at,
            status="completed",
            notes=data.notes,
            completed_by=data.user_id
        )
        db.add(log)
        db.commit()
        
        return {"success": True, "log_id": log.id}
    except Exception as e:
        logger.error(f"Error completing care task: {e}")
        db.rollback()
        return {"success": False, "error": str(e)}


@router.post("/complete/bulk")
async def complete_bulk(
    medications: List[CompleteItemRequest] = Body(default=[]),
    nutrition: List[CompleteItemRequest] = Body(default=[]),
    care_tasks: List[CompleteItemRequest] = Body(default=[]),
    db: Session = Depends(get_db)
):
    """Complete multiple schedule items at once (e.g., all items in an hour)"""
    results = {
        "medications": [],
        "nutrition": [],
        "care_tasks": [],
        "success": True
    }
    
    try:
        # Process medications
        for item in medications:
            try:
                scheduled_dt = parse_scheduled_time(item.scheduled_time)
                completed_at = parse_scheduled_time(item.completed_at) if item.completed_at else datetime.now()
                
                schedule = db.query(MedicationSchedule).filter(MedicationSchedule.id == item.schedule_id).first()
                if schedule:
                    medication = db.query(Medication).filter(Medication.id == schedule.medication_id).first()
                    if medication:
                        dose_amount = item.dose_amount if item.dose_amount is not None else (schedule.dose_amount or 0)
                        if dose_amount > 0 and medication.quantity is not None:
                            medication.quantity = max(0, medication.quantity - float(dose_amount))
                        
                        log = MedicationLog(
                            medication_id=medication.id,
                            patient_id=item.patient_id,
                            schedule_id=item.schedule_id,
                            administered_at=completed_at,
                            dose_amount=dose_amount,
                            is_scheduled=True,
                            scheduled_time=scheduled_dt,
                            notes=item.notes,
                            created_at=datetime.now()
                        )
                        db.add(log)
                        results["medications"].append({"schedule_id": item.schedule_id, "success": True})
            except Exception as e:
                results["medications"].append({"schedule_id": item.schedule_id, "success": False, "error": str(e)})
        
        # Process nutrition
        for item in nutrition:
            try:
                scheduled_dt = parse_scheduled_time(item.scheduled_time)
                completed_at = parse_scheduled_time(item.completed_at) if item.completed_at else datetime.now()
                
                schedule = db.query(NutritionSchedule).filter(NutritionSchedule.id == item.schedule_id).first()
                if schedule:
                    item_name = item.item_name or schedule.default_item_name or schedule.name
                    amount = item.amount if item.amount is not None else (schedule.default_amount or 0)
                    amount_unit = item.amount_unit or schedule.default_amount_unit or 'servings'
                    
                    intake = NutritionIntake(
                        patient_id=item.patient_id,
                        schedule_id=item.schedule_id,
                        item_name=item_name,
                        item_type=schedule.schedule_type or 'food',
                        amount=amount,
                        amount_unit=amount_unit,
                        calories=schedule.default_calories,
                        consumed_at=completed_at,
                        scheduled_time=scheduled_dt,
                        notes=item.notes or f"Completed from schedule '{schedule.name}' at {scheduled_dt.strftime('%H:%M')}",
                        created_at=datetime.now(),
                        updated_at=datetime.now()
                    )
                    db.add(intake)
                    results["nutrition"].append({"schedule_id": item.schedule_id, "success": True})
            except Exception as e:
                results["nutrition"].append({"schedule_id": item.schedule_id, "success": False, "error": str(e)})
        
        # Process care tasks
        for item in care_tasks:
            try:
                scheduled_dt = parse_scheduled_time(item.scheduled_time)
                completed_at = parse_scheduled_time(item.completed_at) if item.completed_at else datetime.now()
                
                schedule = db.query(CareTaskSchedule).filter(CareTaskSchedule.id == item.schedule_id).first()
                if schedule:
                    log = CareTaskLog(
                        care_task_id=schedule.care_task_id,
                        patient_id=item.patient_id,
                        schedule_id=item.schedule_id,
                        scheduled_time=scheduled_dt,
                        completed_at=completed_at,
                        status="completed",
                        notes=item.notes,
                        completed_by=item.user_id
                    )
                    db.add(log)
                    results["care_tasks"].append({"schedule_id": item.schedule_id, "success": True})
            except Exception as e:
                results["care_tasks"].append({"schedule_id": item.schedule_id, "success": False, "error": str(e)})
        
        db.commit()
        return results
        
    except Exception as e:
        logger.error(f"Error in bulk complete: {e}")
        db.rollback()
        return {"success": False, "error": str(e)}
