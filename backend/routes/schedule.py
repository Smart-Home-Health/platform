"""
Schedule routes - Daily schedule view combining medications, nutrition schedules, and care tasks
"""
import logging
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_

from db import get_db
from utils.datetime_utils import utc_now
from models.schedule import CompleteItemRequest, BulkCompleteRequest
from crud.scheduling import get_scheduled_medications, get_scheduled_care_tasks, get_scheduled_nutrition
from utils.early_administration import guard_early_administration
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


TIMING_FLAG_THRESHOLD_MINUTES = 15


def _compute_timing_flags(scheduled_dt: Optional[datetime], administered_at: Optional[datetime]):
    """
    Return (administered_early, administered_late) by comparing the actual
    administered time to the scheduled time. The 15-minute threshold matches
    `crud.medications.administer_medication` so flags are consistent across
    all log paths.
    """
    if scheduled_dt is None or administered_at is None:
        return False, False
    sched = scheduled_dt if scheduled_dt.tzinfo else scheduled_dt.replace(tzinfo=timezone.utc)
    given = administered_at if administered_at.tzinfo else administered_at.replace(tzinfo=timezone.utc)
    diff_minutes = (given - sched).total_seconds() / 60
    if diff_minutes < -TIMING_FLAG_THRESHOLD_MINUTES:
        return True, False
    if diff_minutes > TIMING_FLAG_THRESHOLD_MINUTES:
        return False, True
    return False, False


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
    tz_offset_minutes: Optional[int] = Query(
        None,
        description="Minutes the caller's local time is ahead of UTC. When provided, the day boundary is the caller's local midnight rather than UTC midnight.",
    ),
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
        medications = get_scheduled_medications(db, schedule_date, patient_id, tz_offset_minutes=tz_offset_minutes)
        nutrition_items = get_scheduled_nutrition(db, schedule_date, patient_id, tz_offset_minutes=tz_offset_minutes)
        care_tasks = get_scheduled_care_tasks(db, schedule_date, patient_id, tz_offset_minutes=tz_offset_minutes)
        
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
                "is_prn": med.get("is_prn", False),
                "log_id": med.get("log_id"),
                "type": "medication",
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
                "is_prn": nutr.get("is_prn", False),
                "intake_type": nutr.get("intake_type", "intake"),
                "output_type": nutr.get("output_type"),
                "log_id": nutr.get("log_id"),
                "type": "nutrition",
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

        # Block out-of-window administrations (>1h early or >1h late) unless
        # the caller explicitly confirmed. dose_amount == 0 means skipped —
        # not an administration, so not gated.
        if (data.dose_amount is None or data.dose_amount > 0):
            early = guard_early_administration(
                scheduled_dt,
                early_override=data.early_override,
                item_label="medication",
                schedule_id=data.schedule_id,
                completed_at=data.completed_at,
            )
            if early is not None:
                return early

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
        
        # Compute timing flags from actual completed_at vs scheduled time —
        # skipped doses (dose_amount == 0) are explicitly "not an administration"
        # so they don't carry early/late flags.
        if dose_amount > 0:
            early_flag, late_flag = _compute_timing_flags(scheduled_dt, completed_at)
        else:
            early_flag, late_flag = False, False

        log = MedicationLog(
            medication_id=medication.id,
            patient_id=data.patient_id,
            schedule_id=data.schedule_id,
            administered_at=completed_at,
            dose_amount=dose_amount,
            is_scheduled=True,
            scheduled_time=scheduled_dt,
            administered_early=early_flag,
            administered_late=late_flag,
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

        early = guard_early_administration(
            scheduled_dt,
            early_override=data.early_override,
            item_label="nutrition item",
            schedule_id=data.schedule_id,
            completed_at=data.completed_at,
        )
        if early is not None:
            return early

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
            notes=data.notes,
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

        early = guard_early_administration(
            scheduled_dt,
            early_override=data.early_override,
            item_label="care task",
            schedule_id=data.schedule_id,
            completed_at=data.completed_at,
        )
        if early is not None:
            return early

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
            is_scheduled=True,
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
    # Pre-flight: refuse the whole bulk if any item is outside the administration
    # window (>1h early or >1h late) and was not individually overridden. Frontend
    # can re-submit with early_override=true on the offending items after the user
    # confirms.
    from utils.early_administration import (
        check_administration_window,
        EARLY_ADMINISTRATION_THRESHOLD_MINUTES,
        LATE_ADMINISTRATION_THRESHOLD_MINUTES,
    )
    off_window_items = []
    sections = [
        ("medication", medications),
        ("nutrition item", nutrition),
        ("care task", care_tasks),
    ]
    for label, items in sections:
        for item in items:
            # Skip doses are not gated (dose_amount == 0 == explicit skip)
            if label == "medication" and item.dose_amount is not None and item.dose_amount == 0:
                continue
            if item.early_override:
                continue
            status, minutes_offset, parsed = check_administration_window(
                item.scheduled_time,
                completed_at=item.completed_at,
            )
            if status in ("early", "late"):
                off_window_items.append({
                    "type": label,
                    "schedule_id": item.schedule_id,
                    "scheduled_time": parsed.isoformat() if parsed else None,
                    "status": status,
                    "minutes_early": minutes_offset if status == "early" else 0,
                    "minutes_late": -minutes_offset if status == "late" else 0,
                })
    if off_window_items:
        has_early = any(i["status"] == "early" for i in off_window_items)
        has_late = any(i["status"] == "late" for i in off_window_items)
        if has_early and not has_late:
            error_code = "early_administration"
            window_msg = (
                f"more than {EARLY_ADMINISTRATION_THRESHOLD_MINUTES} minutes from now"
            )
        elif has_late and not has_early:
            error_code = "late_administration"
            window_msg = (
                f"more than {LATE_ADMINISTRATION_THRESHOLD_MINUTES} minutes past their scheduled time"
            )
        else:
            error_code = "off_window_administration"
            window_msg = "outside the administration window"
        return JSONResponse(
            status_code=409,
            content={
                "detail": (
                    f"{len(off_window_items)} item(s) are {window_msg}. "
                    "Re-submit with early_override=true on those items to confirm."
                ),
                "error": error_code,
                "threshold_minutes": EARLY_ADMINISTRATION_THRESHOLD_MINUTES,
                "early_items": off_window_items,
            },
        )

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
                        
                        if dose_amount > 0:
                            early_flag, late_flag = _compute_timing_flags(scheduled_dt, completed_at)
                        else:
                            early_flag, late_flag = False, False
                        log = MedicationLog(
                            medication_id=medication.id,
                            patient_id=item.patient_id,
                            schedule_id=item.schedule_id,
                            administered_at=completed_at,
                            dose_amount=dose_amount,
                            is_scheduled=True,
                            scheduled_time=scheduled_dt,
                            administered_early=early_flag,
                            administered_late=late_flag,
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
                        notes=item.notes,
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
                        is_scheduled=True,
                        status="completed",
                        notes=item.notes,
                        performed_by=item.user_id,
                        created_at=utc_now()
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
