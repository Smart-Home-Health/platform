"""
Schedule routes - Daily schedule view combining medications, nutrition schedules, and care tasks
"""
import logging
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import and_

from db import get_db
from utils.datetime_utils import utc_now
from models.schedule import CompleteItemRequest, BulkCompleteRequest
from crud.scheduling import get_scheduled_medications, get_scheduled_care_tasks, get_scheduled_nutrition
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


@router.get("/daily")
async def get_daily_schedule(
    target_date: str = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
    patient_id: int = Query(..., description="Patient ID"),
    db: Session = Depends(get_db),
):
    """
    Get the complete daily schedule for a patient, organized by hour.
    Returns medications, nutrition schedules, and care tasks with completion status.
    Allowed in restricted mode so user can see what to complete and perform care.
    """
    try:
        # Parse target date
        if target_date:
            schedule_date = datetime.strptime(target_date, "%Y-%m-%d").date()
        else:
            schedule_date = date.today()
        
        # Get all scheduled items (now includes completion status from joined logs)
        medications = get_scheduled_medications(db, schedule_date, patient_id)
        nutrition_items = get_scheduled_nutrition(db, schedule_date, patient_id)
        care_tasks = get_scheduled_care_tasks(db, schedule_date, patient_id)
        
        # Build response - completion status already included from get_scheduled_* functions
        result = {
            "date": schedule_date.isoformat(),
            "patient_id": patient_id,
            "medications": [],
            "nutrition": [],
            "care_tasks": []
        }
        
        for med in medications:
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
                "completed": med["completed"],
                "completed_at": med["completed_at"],
                "completed_by": med["completed_by"],
                "type": "medication"
            })
        
        for nutr in nutrition_items:
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
                "completed": nutr["completed"],
                "completed_at": nutr["completed_at"],
                "completed_by": nutr["completed_by"],
                "type": "nutrition"
            })
        
        for task in care_tasks:
            result["care_tasks"].append({
                "schedule_id": task["schedule_id"],
                "care_task_id": task["care_task_id"],
                "name": task["care_task_name"],
                "description": task.get("care_task_description"),
                "scheduled_time": task["scheduled_time"].isoformat(),
                "hour": task["scheduled_time"].hour,
                "minute": task["scheduled_time"].minute,
                "notes": task.get("notes"),
                "completed": task["completed"],
                "completed_at": task["completed_at"],
                "completed_by": task["completed_by"],
                "category_id": task.get("category_id"),
                "category_name": task.get("category_name"),
                "category_color": task.get("category_color"),
                "type": "care_task"
            })
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting daily schedule: {e}")
        return {"error": str(e), "date": target_date, "medications": [], "nutrition": [], "care_tasks": []}


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
            completed_at = utc_now()
        
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
            created_at=utc_now()
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
            completed_at = utc_now()
        
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
            created_at=utc_now(),
            updated_at=utc_now()
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
            completed_at = utc_now()
        
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
            performed_by=data.user_id,
            created_at=utc_now()
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
                completed_at = parse_scheduled_time(item.completed_at) if item.completed_at else utc_now()
                
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
                            created_at=utc_now()
                        )
                        db.add(log)
                        results["medications"].append({"schedule_id": item.schedule_id, "success": True})
            except Exception as e:
                results["medications"].append({"schedule_id": item.schedule_id, "success": False, "error": str(e)})
        
        # Process nutrition
        for item in nutrition:
            try:
                scheduled_dt = parse_scheduled_time(item.scheduled_time)
                completed_at = parse_scheduled_time(item.completed_at) if item.completed_at else utc_now()
                
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
                        created_at=utc_now(),
                        updated_at=utc_now()
                    )
                    db.add(intake)
                    results["nutrition"].append({"schedule_id": item.schedule_id, "success": True})
            except Exception as e:
                results["nutrition"].append({"schedule_id": item.schedule_id, "success": False, "error": str(e)})
        
        # Process care tasks
        for item in care_tasks:
            try:
                scheduled_dt = parse_scheduled_time(item.scheduled_time)
                completed_at = parse_scheduled_time(item.completed_at) if item.completed_at else utc_now()
                
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
