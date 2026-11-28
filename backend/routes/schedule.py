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
"""
Schedule routes - Daily schedule view combining medications, nutrition schedules, and care tasks
"""
import json
import logging
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, Query, Body, Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_

from db import get_db
from utils.datetime_utils import utc_now, make_utc, resolve_tz_for_patient, local_day_bounds, local_day_range_utc
from models.schedule import CompleteItemRequest, BulkCompleteRequest
from crud.scheduling import get_scheduled_medications, get_scheduled_care_tasks, get_scheduled_nutrition, get_due_and_upcoming_care_tasks_count
from crud.scheduling import canonical_care_task_item
from crud.reminder_timeline import timeline_rows, reminder_fields
from crud.nutrition import (
    create_nutrition_intake_event,
    maybe_spawn_flush_followup,
    schedule_components_as_intake_items,
    schedule_flush_components,
    get_water_suggestion,
    sync_flush_followups_on_void,
    _publish_nutrition_mqtt,
    _publish_bathroom_mqtt,
)
from crud.users import create_audit_log
from event_publisher import publish_due_counts_changed
from dependencies import (get_current_user, permitted_schedule_categories, require_permission, can_record_schedule,
                          require_schedule_record_permission, require_writable_schedule_profile, schedule_profile_level)
from schemas.patient import AccessLevel
from models.users import AuditLog, User
from utils.early_administration import guard_early_administration, guard_future_administration
from utils.medication_quantity import insufficient_quantity_response
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog
from care_task_vocab import is_nutrition_category, completion_timing
from schemas.care_task_schedule import CareTaskSchedule
from schemas.care_task_log import CareTaskLog
from schemas.care_task_category import CareTaskCategory
from schemas.nutrition_schedule import NutritionSchedule
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_item import NutritionItem
from nutrition_vocab import item_type_for_schedule_type, SCHEDULE_TYPE_TO_MEAL_TYPE
from schemas.nutrition_output import NutritionOutput
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
    """Preserve the supplied instant, treating legacy naive values as UTC."""
    return make_utc(datetime.fromisoformat(scheduled_time_str.replace('Z', '+00:00')))


@router.get("/care-tasks/due/count")
async def get_care_tasks_due_count_endpoint(patient_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Count of due/upcoming care tasks, scoped to a patient for the per-patient
    dashboard badge. Ungated like the equipment due-count so the badge stays
    visible in restricted (locked) mode."""
    return {"count": get_due_and_upcoming_care_tasks_count(db, patient_id=patient_id)}


@router.get("/daily")
async def get_daily_schedule(
    target_date: str = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
    patient_id: int = Query(..., description="Patient ID"),
    tz_offset_minutes: Optional[int] = Query(
        None,
        description="Deprecated. Day boundaries now derive from the patient's account timezone (Account.timezone), which takes precedence. Still accepted as a legacy fallback.",
    ),
    category: Optional[Literal["medications", "nutrition", "care_tasks"]] = Query(
        None, description="Load only this category; omitted categories have empty arrays.",
    ),
    include_prior_day: bool = Query(
        False,
        description="Also load the prior local day's rows for the requested categories and mark them is_yesterday=true.",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Get the complete daily schedule for a patient, organized by hour.
    Returns medications, nutrition schedules, and care tasks with completion status.
    Allowed in restricted mode so user can see what to complete and perform care.
    """
    profile_level = schedule_profile_level(db, user, patient_id)
    categories = permitted_schedule_categories(user, category)
    try:
        # The patient's account timezone is the source of truth for day
        # boundaries, so the view buckets items into the same local day the
        # dashboard badges count. tz_offset_minutes is forwarded only as a
        # legacy lower-precedence fallback.
        tz = resolve_tz_for_patient(db, patient_id)

        # Parse target date (defaults to the patient's account-local today,
        # not the server's UTC today).
        bounds = local_day_bounds(tz)
        if target_date:
            schedule_date = datetime.strptime(target_date, "%Y-%m-%d").date()
        else:
            schedule_date = bounds['local_today']
        is_live_day = schedule_date == bounds['local_today']

        # Group rows before serializing so a single-section view loads only
        # the requested clinical data, including on prior-day requests.
        days = [schedule_date - timedelta(days=1), schedule_date] if include_prior_day else [schedule_date]
        loaders = {
            "medications": get_scheduled_medications,
            "nutrition": get_scheduled_nutrition,
            "care_tasks": get_scheduled_care_tasks,
        }
        rows = {key: [] for key in loaders}
        grace_before = local_day_range_utc(schedule_date, tz_offset_minutes, tz)[0] if is_live_day else None
        for key in categories:
            items = timeline_rows(db, patient_id, key, days, tz, bounds['now_utc'], load=loaders[key],
                                  grace_before=grace_before, tz_offset_minutes=tz_offset_minutes)
            if profile_level == AccessLevel.VIEWER or not can_record_schedule(user, key):
                for item in items:
                    if 'can_remind_later' in item:
                        item['can_remind_later'] = False
            rows[key] = [item for item in items if not (key == 'nutrition' and is_live_day
                         and item['is_yesterday'] and item.get('reminder_superseded'))]

        # Build response - completion status already included from get_scheduled_* functions
        result = {
            "date": schedule_date.isoformat(),
            "timezone": str(tz),
            "patient_id": patient_id,
            "medications": [],
            "nutrition": [],
            "care_tasks": []
        }
        
        for med in rows["medications"]:
            display_at = med.get("effective_time", med["scheduled_time"])
            result["medications"].append({
                "schedule_id": med["schedule_id"],
                "medication_id": med["medication_id"],
                "name": med["medication_name"],
                "dose_amount": med["dose_amount"],
                "dose_unit": med["dose_unit"],
                "scheduled_time": med["scheduled_time"].isoformat(),
                "hour": display_at.hour,
                "minute": display_at.minute,
                "description": med["description"],
                "completed": med["completed"],
                "skipped": med.get("skipped", False),
                "completed_at": med["completed_at"],
                "completed_by": med["completed_by"],
                "is_prn": med.get("is_prn", False),
                "log_id": med.get("log_id"),
                "is_yesterday": med.get("is_yesterday", False),
                # Grace period: an unfilled past dose that is still actionable.
                "in_grace": med.get("in_grace", False),
                "grace_expires_at": med["grace_expires_at"].isoformat() if med.get("grace_expires_at") else None,
                "overdue_minutes": med.get("overdue_minutes"),
                "type": "medication",
                **reminder_fields(med),
            })
        
        for nutr in rows["nutrition"]:
            result["nutrition"].append({
                "schedule_id": nutr["schedule_id"],
                "name": nutr["name"],
                "schedule_type": nutr["schedule_type"],
                "description": nutr.get("instructions"),
                "default_item": nutr.get("default_item_name"),
                "default_amount": nutr.get("default_amount"),
                "default_amount_unit": nutr.get("default_amount_unit"),
                "default_calories": nutr.get("default_calories"),
                "components": nutr.get("components") or [],
                # 'schedule' | 'flush' | 'prn' | 'output' — flush rows are the
                # one-off post-feed follow-ups with Run/Skip affordances.
                "row_kind": nutr.get("row_kind", "schedule"),
                "check_outcome": nutr.get("check_outcome"),
                "followup_id": nutr.get("followup_id"),
                "skipped": nutr.get("skipped", False),
                "flush_components": nutr.get("flush_components") or [],
                # Dynamic water budget: a flagged spot's amount is computed
                # on read; water_plan carries the arithmetic so the UI can
                # show its work.
                "fluid_dynamic": nutr.get("fluid_dynamic", False),
                "suggested_amount": nutr.get("suggested_amount"),
                "water_plan": nutr.get("water_plan"),
                "scheduled_time": nutr["scheduled_time"].isoformat(),
                "effective_time": nutr.get("effective_time", nutr["scheduled_time"]).isoformat(),
                "managed_feed": nutr.get("managed_feed", False),
                "reminder_superseded": nutr.get("reminder_superseded", False),
                "timing_reason": nutr.get("timing_reason"),
                "start_override_at": nutr["start_override_at"].isoformat() if nutr.get("start_override_at") else None,
                "overnight_target_at": nutr["overnight_target_at"].isoformat() if nutr.get("overnight_target_at") else None,
                "overnight_delayed": nutr.get("overnight_delayed", False),
                "hour": nutr.get("effective_time", nutr["scheduled_time"]).hour,
                "minute": nutr.get("effective_time", nutr["scheduled_time"]).minute,
                "notes": nutr.get("notes"),
                "completed": nutr["completed"],
                "completed_at": nutr["completed_at"],
                "completed_by": nutr["completed_by"],
                "is_prn": nutr.get("is_prn", False),
                "intake_type": nutr.get("intake_type", "intake"),
                "output_type": nutr.get("output_type"),
                "log_id": nutr.get("log_id"),
                "is_yesterday": nutr.get("is_yesterday", False),
                "type": "nutrition",
                **reminder_fields(nutr),
            })
        
        for task in rows["care_tasks"]:
            # One shape for a care-task day item, shared with the care-task
            # endpoints so a field added in one place shows up in all of them.
            result["care_tasks"].append(canonical_care_task_item(task))
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting daily schedule: {e}")
        return {"error": str(e), "date": target_date, "medications": [], "nutrition": [], "care_tasks": []}


# ===== Completion Endpoints =====

def _catalog_matches_profile(record, patient_id, account_id):
    # Older shared catalog entries can have a null patient or account.
    return record is not None and record.patient_id in (None, patient_id) and record.account_id in (None, account_id)


def _schedule_for_recording(db, user, category, item):
    require_schedule_record_permission(user, category)
    require_writable_schedule_profile(db, user, item.patient_id)
    model = {"medications": MedicationSchedule, "care_tasks": CareTaskSchedule, "nutrition": NutritionSchedule}[category]
    schedule = db.get(model, item.schedule_id)
    if schedule is None or schedule.patient_id not in (None, item.patient_id):
        raise HTTPException(404, "Schedule not found.")
    if category == "nutrition":
        item_ids = {part.item_id for part in (item.items or []) if part.item_id is not None}
        item_ids.update(part.item_id for part in schedule.components)
        if item_ids:
            visible_count = db.query(NutritionItem.id).filter(
                NutritionItem.id.in_(item_ids),
                (NutritionItem.account_id == user.account_id) | NutritionItem.account_id.is_(None),
                (NutritionItem.patient_id == item.patient_id) | NutritionItem.patient_id.is_(None),
            ).count()
            if visible_count != len(item_ids):
                raise HTTPException(404, "Nutrition item not found.")
    else:
        record = schedule.medication if category == "medications" else schedule.care_task
        if not _catalog_matches_profile(record, item.patient_id, user.account_id):
            raise HTTPException(404, "Schedule not found.")
    return schedule


@router.post("/complete/medication")
async def complete_medication(
    data: CompleteItemRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Mark a scheduled medication as administered"""
    schedule = _schedule_for_recording(db, current_user, "medications", data)
    medication = schedule.medication
    try:
        # Parse scheduled time
        scheduled_dt = parse_scheduled_time(data.scheduled_time)

        # A dose can't be given in the future — reject a completed_at past now
        # (catches the date-left-on-today slip). Not overridable.
        future = guard_future_administration(data.completed_at, item_label="medication")
        if future is not None:
            return future

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
        
        # Use provided dose or fall back to schedule defaults
        dose_amount = data.dose_amount if data.dose_amount is not None else (schedule.dose_amount or 0)

        # Refuse to administer more than what's on hand — caller must update the
        # quantity first (see UpdateQuantityModal on the frontend).
        guard = insufficient_quantity_response(medication, dose_amount)
        if guard is not None:
            return guard

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
            # Legacy medication/care-task columns hold naive UTC. Passing an
            # aware value lets PostgreSQL cast it through its session timezone.
            scheduled_time=scheduled_dt.replace(tzinfo=None),
            administered_early=early_flag,
            administered_late=late_flag,
            # Care tasks have always recorded who performed them; medications
            # left this column unwritten, so `completed_by` on the daily
            # schedule was permanently None for doses.
            administered_by=getattr(current_user, 'id', None),
            notes=data.notes,
            created_at=utc_now()
        )
        db.add(log)
        db.commit()
        
        # Real-time badge: notify dashboards the medications due-count changed.
        publish_due_counts_changed("medications", data.patient_id)

        return {"success": True, "log_id": log.id}
    except Exception as e:
        logger.error(f"Error completing medication: {e}")
        db.rollback()
        return {"success": False, "error": str(e)}


def _nutrition_completion_rows(schedule, data: CompleteItemRequest, db=None,
                               scheduled_dt=None):
    """What a nutrition completion actually logs, in priority order:
    explicit `items` from the client, else the schedule's component mix, else
    the legacy single default. Shared by the single and bulk paths so they
    cannot drift.

    Returns None for a care-activity schedule (diaper check etc.) that
    records no intake at all.
    """
    if data.items:
        return [part.model_dump() for part in data.items]

    if schedule.components:
        rows = schedule_components_as_intake_items(schedule)
        if rows:
            return rows

    # Normalize schedule_type onto the intake vocabulary. Assigning it
    # straight through used to write schedule words ('meal', 'hydration')
    # into item_type, bypassing validation. A care activity that produces
    # no food or fluid maps to None and creates no intake row at all.
    item_type = item_type_for_schedule_type(schedule.schedule_type)
    if item_type is None:
        return None

    amount = data.amount
    if amount is None and schedule.fills_fluid_goal and db is not None:
        # Dynamic water spot completed without an explicit amount: pour
        # today's suggestion (what's left of the fluid goal, split across
        # the remaining spots), not the nominal default.
        amount = get_water_suggestion(
            db, schedule.patient_id,
            schedule_id=schedule.id, scheduled_time=scheduled_dt,
        )
    if amount is None:
        amount = schedule.default_amount or 0

    return [{
        'item_name': data.item_name or schedule.default_item_name or schedule.name,
        'item_type': item_type,
        'amount': amount,
        'amount_unit': data.amount_unit or schedule.default_amount_unit or 'servings',
        'calories': schedule.default_calories,
    }]


def _nutrition_administration_time(db, item, original):
    """Use the server's adjusted window while retaining original for the intake."""
    from crud.schedule_manager import read_settings

    settings = read_settings(db, item.patient_id)
    if not settings.feeds_enabled or item.schedule_id not in settings.feed_schedule_ids:
        return original
    tz = resolve_tz_for_patient(db, item.patient_id)
    day = original.astimezone(tz).date()
    for row in get_scheduled_nutrition(db, day, item.patient_id, tz=tz, strict=True,
                                       feed_settings=settings):
        if (row.get("managed_feed") and row["schedule_id"] == item.schedule_id
                and row["scheduled_time"] == original.replace(second=0, microsecond=0)):
            return row["effective_time"]
    return original


def _diaper_check_outcome_required():
    return JSONResponse(status_code=422, content={
        "detail": "Choose Checked dry or Diaper changed on the scheduled bathroom check.",
        "error": "check_outcome_required",
    })


@router.post("/complete/nutrition")
async def complete_nutrition(
    data: CompleteItemRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark a scheduled nutrition item as completed"""
    schedule = _schedule_for_recording(db, current_user, "nutrition", data)
    try:
        if schedule.schedule_type == 'diaper_check':
            return _diaper_check_outcome_required()

        # Parse scheduled time
        scheduled_dt = parse_scheduled_time(data.scheduled_time)

        future = guard_future_administration(data.completed_at, item_label="nutrition item")
        if future is not None:
            return future

        early = guard_early_administration(
            _nutrition_administration_time(db, data, scheduled_dt),
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
        
        
        # Resolve what this feed actually logs: explicit items from the
        # client, else the schedule's component mix, else the legacy single
        # default. None means a care activity that records no intake.
        rows = _nutrition_completion_rows(schedule, data, db=db, scheduled_dt=scheduled_dt)
        if rows is None:
            return {
                "success": True,
                "intake_id": None,
                "detail": "Care activity schedule; no intake recorded.",
            }

        # Create via the dedicated nutrition module so MQTT/HA publishing and
        # the due-count badge fire; one event = N rows sharing event_group_id.
        intakes = create_nutrition_intake_event(
            db,
            data.patient_id,
            rows,
            consumed_at=completed_at,
            meal_type=SCHEDULE_TYPE_TO_MEAL_TYPE.get(
                (schedule.schedule_type or '').strip().lower()
            ),
            notes=data.notes,
            recorded_by=current_user.id,
            schedule_id=data.schedule_id,
            scheduled_time=scheduled_dt,
        )

        # A flush-flagged schedule queued a follow-up in the same transaction;
        # hand it back so the client can show the new due row immediately.
        followup = None
        from schemas.nutrition_flush_followup import NutritionFlushFollowup
        spawned = db.query(NutritionFlushFollowup).filter(
            NutritionFlushFollowup.source_event_group_id == intakes[0].event_group_id,
        ).first()
        if spawned is not None:
            followup = {
                "id": spawned.id,
                "due_at": spawned.due_at.isoformat(),
                "item_name": spawned.item_name,
                "amount": spawned.amount,
                "amount_unit": spawned.amount_unit,
                "status": spawned.status,
            }

        return {
            "success": True,
            # First row's id keeps the pre-multi-item response shape working.
            "intake_id": intakes[0].id,
            "intake_ids": [i.id for i in intakes],
            "event_group_id": intakes[0].event_group_id,
            "flush_followup": followup,
        }
    except Exception as e:
        logger.error(f"Error completing nutrition: {e}")
        db.rollback()
        return {"success": False, "error": str(e)}


def _schedule_nutrition_prefill(schedule):
    """Prefill for the intake sheet, stashed as JSON in the schedule's notes.

    The Manage form writes {"nutrition": {...}} there. Anything else in the
    field is a plain note and simply yields no prefill.
    """
    if not schedule or not schedule.notes:
        return None
    try:
        return json.loads(schedule.notes).get('nutrition')
    except (json.JSONDecodeError, AttributeError, TypeError):
        return None


@router.post("/complete/care-task")
async def complete_care_task(
    data: CompleteItemRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark a scheduled care task as completed.

    This used to take performed_by from the request body with no permission
    dependency at all, and never recorded whether the completion was early or
    late — so every completion made from this page counted as on time while
    the same action from the care-tasks schedule tab did not, quietly skewing
    the adherence stats.
    """
    schedule = _schedule_for_recording(db, current_user, "care_tasks", data)
    try:
        # Parse scheduled time
        scheduled_dt = parse_scheduled_time(data.scheduled_time)

        future = guard_future_administration(data.completed_at, item_label="care task")
        if future is not None:
            return future

        # Skips are an explicit "not done" — they aren't gated by the window.
        if not data.skipped:
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

        # Skips are neither early nor late — they were not done at all.
        timing = ({'completed_early': False, 'completed_late': False} if data.skipped
                  else completion_timing(scheduled_dt, completed_at))

        log = CareTaskLog(
            care_task_id=schedule.care_task_id,
            patient_id=data.patient_id,
            schedule_id=data.schedule_id,
            scheduled_time=scheduled_dt.replace(tzinfo=None),  # Legacy naive UTC column.
            completed_at=completed_at,
            is_scheduled=True,
            status="skipped" if data.skipped else "completed",
            notes=data.notes,
            # The signed-in user, not whoever the client claimed.
            performed_by=getattr(current_user, 'id', None),
            created_at=utc_now(),
            **timing,
        )
        db.add(log)
        db.commit()

        # Real-time badge: notify dashboards the care-task due-count changed.
        publish_due_counts_changed("care_tasks", data.patient_id)

        # Same nutrition hook the other completion paths carry, so which page
        # a task was completed from stops deciding whether intake is offered.
        care_task = schedule.care_task
        category_name = care_task.category.name if care_task and care_task.category else None
        is_nutrition = (not data.skipped) and is_nutrition_category(category_name)

        return {
            "success": True,
            "log_id": log.id,
            "id": log.id,
            "requires_nutrition_tracking": is_nutrition,
            "care_task": {
                "id": care_task.id,
                "name": care_task.name,
                "category": category_name,
                "is_nutrition_related": is_nutrition,
            } if care_task else None,
            "nutrition_data": _schedule_nutrition_prefill(schedule) if is_nutrition else None,
        }
    except Exception as e:
        logger.error(f"Error completing care task: {e}")
        db.rollback()
        return {"success": False, "error": str(e)}


@router.post("/complete/bulk")
async def complete_bulk(
    medications: List[CompleteItemRequest] = Body(default=[]),
    nutrition: List[CompleteItemRequest] = Body(default=[]),
    care_tasks: List[CompleteItemRequest] = Body(default=[]),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
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
    # Validate every category and persisted schedule before inspecting stock,
    # checking managed feeds, or writing any part of this batch.
    schedules = {
        category: {item.schedule_id: _schedule_for_recording(db, current_user, category, item) for item in items}
        for category, items in (("medications", medications), ("nutrition", nutrition), ("care_tasks", care_tasks))
    }
    if any(schedule.schedule_type == "diaper_check" for schedule in schedules["nutrition"].values()):
        return _diaper_check_outcome_required()
    off_window_items = []
    sections = [
        ("medication", medications),
        ("nutrition item", nutrition),
        ("care task", care_tasks),
    ]
    # Pre-flight: a future completed_at is always invalid (not overridable).
    for label, items in sections:
        for item in items:
            future = guard_future_administration(item.completed_at, item_label=label)
            if future is not None:
                return future
    for label, items in sections:
        for item in items:
            # Skip doses are not gated (dose_amount == 0 == explicit skip)
            if label == "medication" and item.dose_amount is not None and item.dose_amount == 0:
                continue
            if item.early_override:
                continue
            window_time = item.scheduled_time
            if label == "nutrition item":
                window_time = _nutrition_administration_time(db, item, parse_scheduled_time(item.scheduled_time))
            status, minutes_offset, parsed = check_administration_window(
                window_time,
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

    # Pre-flight: refuse the whole bulk if any medication is short on stock, so
    # nothing is partially administered. Returns the first offending med; the
    # frontend updates its quantity and re-submits (looping through any others).
    for item in medications:
        if item.dose_amount is not None and item.dose_amount == 0:
            continue
        schedule = schedules["medications"][item.schedule_id]
        medication = schedule.medication
        dose_amount = item.dose_amount if item.dose_amount is not None else (schedule.dose_amount or 0)
        guard = insufficient_quantity_response(medication, dose_amount)
        if guard is not None:
            return guard

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
                
                schedule = schedules["medications"][item.schedule_id]
                medication = schedule.medication
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
                    scheduled_time=scheduled_dt.replace(tzinfo=None),
                    administered_early=early_flag,
                    administered_late=late_flag,
                    administered_by=getattr(current_user, 'id', None),
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
                
                schedule = schedules["nutrition"][item.schedule_id]
                rows = _nutrition_completion_rows(schedule, item, db=db, scheduled_dt=scheduled_dt)
                if rows is None:
                    # Care activity, not an intake -- see the single path.
                    continue
                # One event per feed: every row of the mix shares a group
                # id. Rows are added to the shared bulk transaction rather
                # than through create_nutrition_intake_event so the whole
                # bulk completion stays one commit with one MQTT publish.
                group_id = str(uuid.uuid4())
                meal_type = SCHEDULE_TYPE_TO_MEAL_TYPE.get(
                    (schedule.schedule_type or '').strip().lower()
                )
                for row in rows:
                    intake = NutritionIntake(
                        patient_id=item.patient_id,
                        schedule_id=item.schedule_id,
                        event_group_id=group_id,
                        item_id=row.get('item_id'),
                        item_name=row['item_name'],
                        item_type=row['item_type'],
                        amount=row['amount'],
                        amount_unit=row['amount_unit'],
                        feed_route=row.get('feed_route'),
                        rate_ml_per_hr=row.get('rate_ml_per_hr'),
                        duration_minutes=row.get('duration_minutes'),
                        calories=row.get('calories'),
                        protein_grams=row.get('protein_grams'),
                        carbs_grams=row.get('carbs_grams'),
                        fat_grams=row.get('fat_grams'),
                        fiber_grams=row.get('fiber_grams'),
                        sodium_mg=row.get('sodium_mg'),
                        meal_type=meal_type,
                        consumed_at=completed_at,
                        recorded_by=current_user.id,
                        scheduled_time=scheduled_dt,
                        notes=item.notes,
                        created_at=utc_now(),
                        updated_at=utc_now()
                    )
                    db.add(intake)
                # A flush-flagged schedule queues its follow-up inside the
                # same bulk transaction.
                maybe_spawn_flush_followup(
                    db, schedule,
                    patient_id=item.patient_id,
                    group_id=group_id,
                    rows=rows,
                    consumed_at=completed_at,
                    feed_scheduled_time=scheduled_dt,
                    recorded_by=current_user.id,
                )
                results["nutrition"].append({"schedule_id": item.schedule_id, "success": True})
            except Exception as e:
                results["nutrition"].append({"schedule_id": item.schedule_id, "success": False, "error": str(e)})
        
        # Process care tasks
        for item in care_tasks:
            try:
                scheduled_dt = parse_scheduled_time(item.scheduled_time)
                completed_at = parse_scheduled_time(item.completed_at) if item.completed_at else utc_now()
                
                schedule = schedules["care_tasks"][item.schedule_id]
                log = CareTaskLog(
                    care_task_id=schedule.care_task_id,
                    patient_id=item.patient_id,
                    schedule_id=item.schedule_id,
                    scheduled_time=scheduled_dt.replace(tzinfo=None),
                    completed_at=completed_at,
                    is_scheduled=True,
                    status="completed",
                    notes=item.notes,
                    performed_by=current_user.id,
                    created_at=utc_now()
                )
                db.add(log)
                results["care_tasks"].append({"schedule_id": item.schedule_id, "success": True})
            except Exception as e:
                results["care_tasks"].append({"schedule_id": item.schedule_id, "success": False, "error": str(e)})
        
        db.commit()

        # Real-time badges: emit once per category that had items (never per
        # item) so the bulk "complete this hour" action triggers at most one
        # refetch per category instead of a storm.
        if medications:
            publish_due_counts_changed("medications", medications[0].patient_id)
        if nutrition:
            publish_due_counts_changed("nutrition", nutrition[0].patient_id)
            # Bulk path builds NutritionIntake directly (transactional); fire the
            # dedicated nutrition MQTT publish once per affected patient.
            for pid in {n.patient_id for n in nutrition}:
                _publish_nutrition_mqtt(db, pid)
        if care_tasks:
            publish_due_counts_changed("care_tasks", care_tasks[0].patient_id)

        return results

    except Exception as e:
        logger.error(f"Error in bulk complete: {e}")
        db.rollback()
        return {"success": False, "error": str(e)}


# ===== Undo Endpoint =====

def _record_undo_audit(db, request, user, item_type, log_id, details):
    """Write an audit_logs row so undos are traceable (who/what/when)."""
    try:
        create_audit_log(
            db,
            user_id=user.id if user else None,
            action="schedule.undo",
            resource_type=item_type,
            resource_id=details.get("primary_id"),
            details=json.dumps(details),
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
        )
    except Exception as e:
        # An audit failure must not block the undo itself.
        logger.error(f"Failed to write undo audit log ({item_type}/{log_id}): {e}")


@router.delete("/log/{item_type}/{log_id}")
async def undo_completion(
    item_type: str,
    log_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Undo a completed schedule item. The log row is *soft-deleted* — marked
    voided (`voided_at`/`voided_by`) rather than removed — so the undo stays
    auditable and the original record survives. The global soft-delete filter
    excludes voided rows from every read path. An audit_logs entry is written
    recording who undid what and when.

    Used when a dose, feed, or care task was marked on the wrong day or by
    mistake. `item_type` is one of: medication, nutrition_intake,
    nutrition_output, care_task. For medications the on-hand quantity deducted at
    administration is added back.

    `log_id` is normally an integer. Merged-diaper nutrition outputs arrive as a
    composite "mixed-<id>-<id>" key (see get_scheduled_nutrition) — every member
    output is voided.
    """
    categories = {"medication": "medications", "care_task": "care_tasks",
                  "nutrition_intake": "nutrition", "nutrition_output": "nutrition"}
    if item_type not in categories:
        raise HTTPException(400, f"Unknown item_type: {item_type}")
    require_schedule_record_permission(current_user, categories[item_type])
    now = utc_now()
    uid = current_user.id
    try:
        if item_type == "medication":
            log = db.query(MedicationLog).filter(MedicationLog.id == int(log_id)).first()
            if not log:
                return JSONResponse(status_code=404, content={"detail": "Medication log not found"})
            require_writable_schedule_profile(db, current_user, log.patient_id)
            medication = log.medication
            if medication and not _catalog_matches_profile(medication, log.patient_id, current_user.account_id):
                raise HTTPException(404, "Medication log not found")
            # Mirror the deduction done at administration time so on-hand stock
            # is restored. Skips (dose_amount == 0) never deducted, so nothing to add.
            restored = None
            if log.dose_amount and log.dose_amount > 0:
                if medication and medication.quantity is not None:
                    medication.quantity = medication.quantity + float(log.dose_amount)
                    restored = float(log.dose_amount)
            med_name = log.medication.name if log.medication else None
            log.voided_at = now
            log.voided_by = uid
            _record_undo_audit(db, request, current_user, item_type, log_id, {
                "primary_id": log.id,
                "item_name": med_name,
                "patient_id": log.patient_id,
                "dose_amount": log.dose_amount,
                "quantity_restored": restored,
                "scheduled_time": log.scheduled_time.isoformat() if log.scheduled_time else None,
                "administered_at": log.administered_at.isoformat() if log.administered_at else None,
            })
            db.commit()
            # Real-time badge: undo restores the dose to "due".
            publish_due_counts_changed("medications", log.patient_id)
            return {"success": True}

        if item_type == "care_task":
            log = db.query(CareTaskLog).filter(CareTaskLog.id == int(log_id)).first()
            if not log:
                return JSONResponse(status_code=404, content={"detail": "Care task log not found"})
            require_writable_schedule_profile(db, current_user, log.patient_id)
            task = log.care_task
            if task and not _catalog_matches_profile(task, log.patient_id, current_user.account_id):
                raise HTTPException(404, "Care task log not found")
            task_name = task.name if task else None
            log.voided_at = now
            log.voided_by = uid
            _record_undo_audit(db, request, current_user, item_type, log_id, {
                "primary_id": log.id,
                "item_name": task_name,
                "patient_id": log.patient_id,
                "scheduled_time": log.scheduled_time.isoformat() if log.scheduled_time else None,
                "completed_at": log.completed_at.isoformat() if log.completed_at else None,
            })
            db.commit()
            # Real-time badge: undo restores the task to "due".
            publish_due_counts_changed("care_tasks", log.patient_id)
            return {"success": True}

        if item_type == "nutrition_intake":
            intake = db.query(NutritionIntake).filter(NutritionIntake.id == int(log_id)).first()
            if not intake:
                return JSONResponse(status_code=404, content={"detail": "Nutrition intake not found"})
            require_writable_schedule_profile(db, current_user, intake.patient_id)
            # Un-completing a feed means the whole feed: void every row of the
            # logged event (a multi-item mix), not just the one the board
            # happened to reference. The soft-delete filter already excludes
            # previously voided siblings.
            siblings = [intake]
            if intake.event_group_id:
                siblings = db.query(NutritionIntake).filter(
                    NutritionIntake.event_group_id == intake.event_group_id,
                    NutritionIntake.patient_id == intake.patient_id,
                ).all()
            voided_ids = []
            for row in siblings:
                row.voided_at = now
                row.voided_by = uid
                voided_ids.append(row.id)
            # Undoing a feed voids its queued flush; undoing a logged flush
            # restores the follow-up to pending.
            flush_sync = sync_flush_followups_on_void(
                db, [intake.event_group_id], uid, now, patient_id=intake.patient_id)
            _record_undo_audit(db, request, current_user, item_type, log_id, {
                "primary_id": intake.id,
                "voided_ids": voided_ids,
                "item_name": intake.item_name,
                "patient_id": intake.patient_id,
                "amount": intake.amount,
                "amount_unit": intake.amount_unit,
                "scheduled_time": intake.scheduled_time.isoformat() if intake.scheduled_time else None,
                "consumed_at": intake.consumed_at.isoformat() if intake.consumed_at else None,
                "flush_followups_voided": flush_sync["voided"],
                "flush_followups_restored": flush_sync["restored"],
            })
            db.commit()
            # Real-time badge: undo restores the feed to "due".
            publish_due_counts_changed("nutrition", intake.patient_id)
            # Recompute calorie state for HA (today's total / last feed changed).
            _publish_nutrition_mqtt(db, intake.patient_id)
            return {"success": True}

        if item_type == "nutrition_output":
            # Merged diaper rows carry a composite "mixed-<id>-<id>" key.
            raw = str(log_id)
            parts = raw[len("mixed-"):].split("-") if raw.startswith("mixed-") else [raw]
            ids = list(dict.fromkeys(int(part) for part in parts))
            outputs = {row.id: row for row in db.query(NutritionOutput).filter(NutritionOutput.id.in_(ids))}
            if len(outputs) != len(ids) or len({row.patient_id for row in outputs.values()}) != 1:
                raise HTTPException(404, "Nutrition output not found")
            first = outputs[ids[0]]
            require_writable_schedule_profile(db, current_user, first.patient_id)
            for output in outputs.values():
                output.voided_at = now
                output.voided_by = uid
            voided_ids = ids
            _record_undo_audit(db, request, current_user, item_type, log_id, {
                "primary_id": voided_ids[0],
                "voided_ids": voided_ids,
                "item_name": first.output_type if first else None,
                "patient_id": first.patient_id if first else None,
                "occurred_at": first.occurred_at.isoformat() if first and first.occurred_at else None,
            })
            db.commit()
            # Real-time badge: undo restores the output to "due".
            publish_due_counts_changed("nutrition", first.patient_id)
            # Republish bathroom state so HA reflects the now-most-recent output.
            _publish_bathroom_mqtt(db, first.patient_id)
            return {"success": True}

    except HTTPException:
        raise
    except ValueError:
        return JSONResponse(status_code=400, content={"detail": "Invalid log id"})
    except Exception as e:
        logger.error(f"Error undoing completion ({item_type}/{log_id}): {e}")
        db.rollback()
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/undo-log")
async def get_undo_log(
    limit: int = Query(100, le=500),
    patient_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: bool = Depends(require_permission("audit.read")),
):
    """
    Audit feed of undo actions (who undid what, and when) for the dedicated
    Undo Log admin view. Sourced from audit_logs (action='schedule.undo'), not
    the voided rows themselves, so it is unaffected by the soft-delete filter.
    """
    rows = (
        db.query(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
        .filter(AuditLog.action == "schedule.undo")
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )

    entries = []
    for audit, user in rows:
        try:
            details = json.loads(audit.details) if audit.details else {}
        except (ValueError, TypeError):
            details = {}
        if patient_id is not None and details.get("patient_id") != patient_id:
            continue
        entries.append({
            "id": audit.id,
            "item_type": audit.resource_type,
            "undone_at": audit.timestamp.isoformat() if audit.timestamp else None,
            "undone_by": (user.full_name or user.username) if user else None,
            "undone_by_id": audit.user_id,
            "item_name": details.get("item_name"),
            "patient_id": details.get("patient_id"),
            "scheduled_time": details.get("scheduled_time"),
            "dose_amount": details.get("dose_amount"),
            "quantity_restored": details.get("quantity_restored"),
            "details": details,
        })

    return {"entries": entries, "count": len(entries)}
