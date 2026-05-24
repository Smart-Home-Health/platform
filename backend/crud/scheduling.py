"""
Scheduling CRUD operations for care tasks
"""
import logging
from datetime import datetime, timedelta, timezone
from croniter import croniter
from sqlalchemy.orm import Session
from schemas.care_task import CareTask
from schemas.care_task_schedule import CareTaskSchedule
from schemas.care_task_log import CareTaskLog
from crud.patients import get_active_patient
from utils.datetime_utils import utc_now, utc_today

logger = logging.getLogger('crud')


# --- CareTaskSchedule CRUD ---
def add_care_task_schedule(db: Session, care_task_id, cron_expression, description=None, active=True, notes=None, patient_id=None):
    """
    Add a new care task schedule
    """
    try:
        # If no patient_id provided, use the current active patient
        if patient_id is None:
            active_patient = get_active_patient(db)
            if active_patient:
                patient_id = active_patient.id
        
        now = utc_now()
        schedule = CareTaskSchedule(
            care_task_id=care_task_id,
            patient_id=patient_id,
            cron_expression=cron_expression,
            description=description,
            active=active,
            notes=notes,
            created_at=now,
            updated_at=now
        )
        db.add(schedule)
        db.commit()
        db.refresh(schedule)
        logger.info(f"Care task schedule added for task {care_task_id} (patient {patient_id}): {cron_expression}")
        return schedule.id
    except Exception as e:
        logger.error(f"Error adding care task schedule: {e}")
        db.rollback()
        return None


def get_care_task_schedules(db: Session, care_task_id, patient_id=None):
    """
    Get all schedules for a specific care task, optionally filtered by patient
    """
    try:
        query = db.query(CareTaskSchedule).filter(
            CareTaskSchedule.care_task_id == care_task_id
        )
        
        # If patient_id is provided, filter by it
        # If patient_id is None, get current patient and filter by that
        if patient_id is None:
            active_patient = get_active_patient(db)
            if active_patient:
                # Filter to show only schedules for current patient OR global schedules (patient_id is NULL)
                query = query.filter(
                    (CareTaskSchedule.patient_id == active_patient.id) | 
                    (CareTaskSchedule.patient_id.is_(None))
                )
        elif patient_id == -1:
            # Admin mode: show all schedules regardless of patient
            pass  # No patient filter
        else:
            # Filter to show schedules for specific patient OR global schedules
            query = query.filter(
                (CareTaskSchedule.patient_id == patient_id) | 
                (CareTaskSchedule.patient_id.is_(None))
            )
        
        schedules = query.order_by(CareTaskSchedule.created_at.desc()).all()
        
        return [
            {
                'id': s.id,
                'care_task_id': s.care_task_id,
                'patient_id': s.patient_id,
                'cron_expression': s.cron_expression,
                'description': s.description,
                'active': s.active,
                'notes': s.notes,
                'created_at': s.created_at.isoformat() if s.created_at else None,
                'updated_at': s.updated_at.isoformat() if s.updated_at else None
            }
            for s in schedules
        ]
    except Exception as e:
        logger.error(f"Error fetching care task schedules for task {care_task_id}: {e}")
        return []


def get_all_care_task_schedules(db: Session, active_only=True, patient_id=None):
    """
    Get all care task schedules, optionally filtering by active status and patient
    """
    try:
        query = db.query(CareTaskSchedule)
        if active_only:
            query = query.filter(CareTaskSchedule.active == True)
        
        # Filter by patient - if no patient_id provided, use current patient
        if patient_id is None:
            active_patient = get_active_patient(db)
            if active_patient:
                # Show schedules for current patient OR global schedules (patient_id is NULL)
                query = query.filter(
                    (CareTaskSchedule.patient_id == active_patient.id) | 
                    (CareTaskSchedule.patient_id.is_(None))
                )
        elif patient_id == -1:
            # Admin mode: show all schedules regardless of patient
            pass  # No patient filter
        else:
            # Show schedules for specific patient OR global schedules
            query = query.filter(
                (CareTaskSchedule.patient_id == patient_id) | 
                (CareTaskSchedule.patient_id.is_(None))
            )
        
        schedules = query.order_by(CareTaskSchedule.created_at.desc()).all()
        
        return [
            {
                'id': s.id,
                'care_task_id': s.care_task_id,
                'care_task_name': s.care_task.name if s.care_task else None,
                'patient_id': s.patient_id,
                'cron_expression': s.cron_expression,
                'description': s.description,
                'active': s.active,
                'notes': s.notes,
                'created_at': s.created_at.isoformat() if s.created_at else None,
                'updated_at': s.updated_at.isoformat() if s.updated_at else None
            }
            for s in schedules
        ]
    except Exception as e:
        logger.error(f"Error fetching all care task schedules: {e}")
        return []


def update_care_task_schedule(db: Session, schedule_id, **kwargs):
    """
    Update an existing care task schedule
    """
    try:
        schedule = db.query(CareTaskSchedule).filter(CareTaskSchedule.id == schedule_id).first()
        if not schedule:
            return False
        
        # Update fields if provided
        for key, value in kwargs.items():
            if hasattr(schedule, key):
                setattr(schedule, key, value)
        
        schedule.updated_at = utc_now()
        db.commit()
        logger.info(f"Care task schedule {schedule_id} updated")
        return True
    except Exception as e:
        logger.error(f"Error updating care task schedule {schedule_id}: {e}")
        db.rollback()
        return False


def delete_care_task_schedule(db: Session, schedule_id):
    """
    Delete a care task schedule (hard delete since it's not critical data)
    """
    try:
        schedule = db.query(CareTaskSchedule).filter(CareTaskSchedule.id == schedule_id).first()
        if not schedule:
            return False
        
        db.delete(schedule)
        db.commit()
        logger.info(f"Care task schedule {schedule_id} deleted")
        return True
    except Exception as e:
        logger.error(f"Error deleting care task schedule {schedule_id}: {e}")
        db.rollback()
        return False


def toggle_care_task_schedule_active(db: Session, schedule_id):
    """
    Toggle the active status of a care task schedule
    """
    try:
        schedule = db.query(CareTaskSchedule).filter(CareTaskSchedule.id == schedule_id).first()
        if not schedule:
            return False, None
        
        schedule.active = not schedule.active
        schedule.updated_at = utc_now()
        db.commit()
        logger.info(f"Care task schedule {schedule_id} active status toggled to {schedule.active}")
        return True, schedule.active
    except Exception as e:
        logger.error(f"Error toggling care task schedule {schedule_id}: {e}")
        db.rollback()
        return False, None


def get_scheduled_care_tasks_for_date(db: Session, target_date=None, patient_id=None):
    """
    Get all care tasks scheduled for a specific date, filtered by patient
    
    Args:
        target_date: datetime.date object, defaults to today
        patient_id: Patient ID to filter by, if None uses current active patient
    
    Returns:
        List of scheduled care task entries with calculated times
    """
    try:
        if target_date is None:
            target_date = utc_today()
        
        # Get all active care task schedules for the specified patient
        query = db.query(CareTaskSchedule).filter(
            CareTaskSchedule.active == True
        ).join(CareTask).filter(
            CareTask.active == True
        )
        
        # Filter by patient - if no patient_id provided, use current patient
        if patient_id is None:
            active_patient = get_active_patient(db)
            if active_patient:
                # Show schedules for current patient OR global schedules (patient_id is NULL)
                query = query.filter(
                    (CareTaskSchedule.patient_id == active_patient.id) | 
                    (CareTaskSchedule.patient_id.is_(None))
                )
        elif patient_id == -1:
            # Admin mode: show all schedules regardless of patient
            pass  # No patient filter
        else:
            # Show schedules for specific patient OR global schedules
            query = query.filter(
                (CareTaskSchedule.patient_id == patient_id) | 
                (CareTaskSchedule.patient_id.is_(None))
            )
        
        schedules = query.all()
        
        scheduled_tasks = []
        
        for schedule in schedules:
            try:
                # Cron expressions are interpreted in UTC. Anchor croniter on a
                # UTC-aware start-of-day so the times it yields are UTC-aware
                # — required because callers compare them against utc_now().
                start_of_day = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
                cron = croniter(schedule.cron_expression, start_of_day)

                category = schedule.care_task.category
                category_name = category.name if category else None
                category_color = category.color if category else '#6f42c1'

                current_time = cron.get_next(datetime)
                while current_time.date() == target_date:
                    scheduled_tasks.append({
                        'schedule_id': schedule.id,
                        'care_task_id': schedule.care_task_id,
                        'care_task_name': schedule.care_task.name,
                        'care_task_description': schedule.care_task.description,
                        'care_task_category_name': category_name,
                        'care_task_category_color': category_color,
                        'scheduled_time': current_time,
                        'schedule_description': schedule.description,
                        'notes': schedule.notes
                    })
                    current_time = cron.get_next(datetime)

            except Exception as cron_error:
                logger.error(f"Error parsing cron expression '{schedule.cron_expression}' for schedule {schedule.id}: {cron_error}")
                continue

        return sorted(scheduled_tasks, key=lambda x: x['scheduled_time'])

    except Exception as e:
        logger.error(f"Error getting scheduled care tasks: {e}")
        return []


def get_missed_care_tasks(db: Session, target_date=None):
    """
    Get care tasks that were scheduled but not completed for a specific date
    
    Args:
        target_date: datetime.date object, defaults to yesterday
    
    Returns:
        List of missed care task entries
    """
    try:
        if target_date is None:
            target_date = utc_today() - timedelta(days=1)
        
        # Get all scheduled care tasks for the target date
        scheduled = get_scheduled_care_tasks_for_date(db, target_date)
        
        missed_tasks = []
        
        for scheduled_task in scheduled:
            # Check if this care task was actually completed
            scheduled_time = scheduled_task['scheduled_time']
            schedule_id = scheduled_task['schedule_id']
            
            # Look for completion log within 2 hours of scheduled time
            window_start = scheduled_time - timedelta(hours=1)
            window_end = scheduled_time + timedelta(hours=1)
            
            completed = db.query(CareTaskLog).filter(
                CareTaskLog.schedule_id == schedule_id,
                CareTaskLog.completed_at >= window_start,
                CareTaskLog.completed_at <= window_end
            ).first()
            
            if not completed:
                missed_tasks.append(scheduled_task)
        
        return missed_tasks
        
    except Exception as e:
        logger.error(f"Error getting missed care tasks: {e}")
        return []


def get_daily_care_task_schedule(db: Session, patient_id=None):
    """
    Get scheduled care tasks for today and yesterday in chronological order with status
    
    Args:
        patient_id: Patient ID to filter by, if None uses current active patient
    
    Returns:
        Dict with 'scheduled_care_tasks' list sorted chronologically
    """
    try:
        today = utc_today()
        yesterday = today - timedelta(days=1)
        current_time = utc_now()
        
        # Get scheduled tasks for yesterday and today for the specified patient
        yesterday_scheduled = get_scheduled_care_tasks_for_date(db, yesterday, patient_id)
        today_scheduled = get_scheduled_care_tasks_for_date(db, today, patient_id)
        
        all_scheduled = []
        
        def _apply_completion(item, completion_log):
            if completion_log:
                item['status'] = completion_log.status  # 'completed', 'skipped', etc.
                item['is_completed'] = True
                completed_at_iso = (
                    completion_log.completed_at.isoformat()
                    if completion_log.completed_at else None
                )
                item['completed_at'] = completed_at_iso
                item['completed_time'] = completed_at_iso
                item['notes'] = completion_log.notes
                item['performed_by'] = completion_log.performed_by
            else:
                item['is_completed'] = False
                item['completed_at'] = None
                item['completed_time'] = None
                item['performed_by'] = None

        # Process yesterday's schedules (check if missed or completed)
        for item in yesterday_scheduled:
            completion_log = db.query(CareTaskLog).filter(
                CareTaskLog.schedule_id == item['schedule_id'],
                CareTaskLog.scheduled_time == item['scheduled_time']
            ).first()

            _apply_completion(item, completion_log)
            if not completion_log:
                item['status'] = 'missed'  # Default to missed for yesterday

            item['is_yesterday'] = True
            all_scheduled.append(item)

        # Process today's schedules
        for item in today_scheduled:
            completion_log = db.query(CareTaskLog).filter(
                CareTaskLog.schedule_id == item['schedule_id'],
                CareTaskLog.scheduled_time == item['scheduled_time']
            ).first()

            _apply_completion(item, completion_log)
            if not completion_log:
                # Only set time-based status if not completed
                scheduled_time = item['scheduled_time']
                time_diff = (current_time - scheduled_time).total_seconds() / 60

                if time_diff < -30:
                    item['status'] = 'pending'
                elif time_diff < -15:
                    item['status'] = 'due_warning'
                elif time_diff < 15:
                    item['status'] = 'due_on_time'
                else:
                    item['status'] = 'due_late'

            item['is_yesterday'] = False
            all_scheduled.append(item)
        
        # Sort by scheduled time chronologically
        all_scheduled.sort(key=lambda x: x['scheduled_time'])
        
        return {
            'scheduled_care_tasks': all_scheduled,
            'generated_at': current_time.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting daily care task schedule: {e}")
        return {
            'scheduled_care_tasks': [],
            'generated_at': utc_now().isoformat()
        }


def complete_care_task(db: Session, task_id, schedule_id=None, scheduled_time=None, notes=None, status='completed', performed_by=None, completed_at=None, patient_id=None):
    """
    Complete a care task (either scheduled or ad-hoc)

    Args:
        task_id: ID of the care task
        schedule_id: ID of the schedule (if this is a scheduled completion)
        scheduled_time: The originally scheduled time (for timing analysis)
        notes: Optional notes about the completion
        status: Completion status ('completed', 'skipped', 'partial')
        performed_by: Optional user ID of who completed the task
        completed_at: When the task was actually performed (defaults to now)
        patient_id: Patient to attribute the completion to. Required when the
            care task is global (patient_id IS NULL); otherwise falls back to
            the task's patient and then the active patient.

    Returns:
        ID of the created log entry, or None if failed
    """
    try:
        now = utc_now()
        completed_at = completed_at or now
        if isinstance(completed_at, str):
            completed_at = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))

        # Get the care task to retrieve patient_id
        care_task = db.query(CareTask).filter(CareTask.id == task_id).first()
        if not care_task:
            logger.error(f"Care task {task_id} not found")
            return None

        # Determine patient_id: explicit > task's own > active patient
        resolved_patient_id = patient_id or care_task.patient_id
        if resolved_patient_id is None:
            active_patient = get_active_patient(db)
            if active_patient:
                resolved_patient_id = active_patient.id
            else:
                logger.error("No patient_id found for care task and no active patient available")
                return None

        # Calculate timing flags if this is a scheduled task
        is_scheduled = bool(schedule_id)
        completed_early = False
        completed_late = False

        if is_scheduled and scheduled_time:
            if isinstance(scheduled_time, str):
                scheduled_dt = datetime.fromisoformat(scheduled_time.replace('Z', '+00:00'))
            else:
                scheduled_dt = scheduled_time

            diff_minutes = (completed_at - scheduled_dt).total_seconds() / 60

            if diff_minutes < -15:  # More than 15 minutes early
                completed_early = True
            elif diff_minutes > 15:  # More than 15 minutes late
                completed_late = True

        # Create the completion log
        log = CareTaskLog(
            care_task_id=task_id,
            patient_id=resolved_patient_id,
            schedule_id=schedule_id,
            completed_at=completed_at,
            is_scheduled=is_scheduled,
            scheduled_time=scheduled_time,
            completed_early=completed_early,
            completed_late=completed_late,
            status=status,
            notes=notes,
            performed_by=performed_by,
            created_at=now
        )
        
        db.add(log)
        db.commit()
        db.refresh(log)
        
        logger.info(f"Care task {task_id} completed with status '{status}' (scheduled: {is_scheduled})")
        return log.id
        
    except Exception as e:
        logger.error(f"Error completing care task: {e}")
        db.rollback()
        return None


def get_due_and_upcoming_care_tasks_count(db: Session):
    """
    Returns the count of scheduled care tasks that are:
    - missed (for today or yesterday)
    - due_late or due_warning (for today or yesterday)
    - due_on_time or pending (for today or yesterday) and scheduled within the next hour
    """
    try:
        schedule_data = get_daily_care_task_schedule(db)
        tasks = schedule_data.get('scheduled_care_tasks', [])
        now = utc_now()
        count = 0
        
        for task in tasks:
            status = task.get('status', '')
            scheduled_time = task.get('scheduled_time')
            if isinstance(scheduled_time, str):
                scheduled_time = datetime.fromisoformat(scheduled_time)
            
            if status in ['missed', 'due_late', 'due_warning']:
                count += 1
            elif status in ['due_on_time', 'pending'] and scheduled_time and (scheduled_time - now).total_seconds() <= 3600:
                count += 1
                
        return count
    except Exception as e:
        logger.error(f"Error getting due/upcoming care tasks count: {e}")
        return 0


def get_care_task_schedule(db: Session, schedule_id):
    """
    Get a specific care task schedule by ID
    """
    try:
        schedule = db.query(CareTaskSchedule).filter(CareTaskSchedule.id == schedule_id).first()
        if not schedule:
            return None
        
        return {
            'id': schedule.id,
            'care_task_id': schedule.care_task_id,
            'care_task_name': schedule.care_task.name if schedule.care_task else None,
            'cron_expression': schedule.cron_expression,
            'description': schedule.description,
            'active': schedule.active,
            'notes': schedule.notes,
            'created_at': schedule.created_at.isoformat() if schedule.created_at else None,
            'updated_at': schedule.updated_at.isoformat() if schedule.updated_at else None
        }
    except Exception as e:
        logger.error(f"Error fetching care task schedule {schedule_id}: {e}")
        return None


def validate_cron_expression(cron_expression):
    """
    Validate a cron expression
    
    Args:
        cron_expression: The cron expression to validate
    
    Returns:
        Tuple of (is_valid: bool, error_message: str or None)
    """
    try:
        # Test the cron expression with croniter
        cron = croniter(cron_expression, datetime.now())
        # Try to get the next occurrence to ensure it's valid
        cron.get_next(datetime)
        return True, None
    except Exception as e:
        return False, str(e)


def get_next_scheduled_times(db: Session, schedule_id, count=5):
    """
    Get the next N scheduled times for a specific schedule
    
    Args:
        schedule_id: ID of the schedule
        count: Number of next times to return
    
    Returns:
        List of datetime objects for the next scheduled times
    """
    try:
        schedule = db.query(CareTaskSchedule).filter(CareTaskSchedule.id == schedule_id).first()
        if not schedule:
            return []
        
        now = utc_now()
        cron = croniter(schedule.cron_expression, now)
        
        next_times = []
        for _ in range(count):
            next_time = cron.get_next(datetime)
            next_times.append(next_time)
        
        return next_times
        
    except Exception as e:
        logger.error(f"Error getting next scheduled times for schedule {schedule_id}: {e}")
        return []


# ===== Daily Schedule Functions =====

from sqlalchemy import func, cast, Date
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog
from schemas.nutrition_schedule import NutritionSchedule
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_output import NutritionOutput


def get_scheduled_medications(db: Session, target_date, patient_id: int, tz_offset_minutes=None):
    """
    Get all medications scheduled for a specific date for a patient.
    Only includes medications where start_date <= target_date (or no start_date).
    Returns completion status by joining to medication_log.

    `tz_offset_minutes` is the minutes the caller's local time is ahead of UTC
    (so US Eastern in DST = -240). When provided, the day boundary is the
    caller's local midnight rather than the server's UTC midnight. Without it
    the function falls back to UTC-day semantics for backward compatibility.
    """
    try:
        # Compute the UTC range that corresponds to the caller's local day.
        # local_start_utc = midnight local converted to UTC.
        if tz_offset_minutes is None:
            local_start_utc = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone.utc)
            local_end_utc = local_start_utc + timedelta(days=1)
        else:
            offset = timedelta(minutes=tz_offset_minutes)
            local_midnight_naive = datetime.combine(target_date, datetime.min.time())
            local_start_utc = (local_midnight_naive - offset).replace(tzinfo=timezone.utc)
            local_end_utc = local_start_utc + timedelta(days=1)

        # MedicationLog.scheduled_time is stored as naive UTC (cron firings'
        # wall-clock values). Compare against the same UTC range stripped of tzinfo.
        local_start_naive = local_start_utc.replace(tzinfo=None)
        local_end_naive = local_end_utc.replace(tzinfo=None)

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

        # Completion logs whose stored scheduled_time falls inside the caller's
        # local day (in UTC range, since the stored value is the firing's UTC).
        med_logs = db.query(MedicationLog).filter(
            MedicationLog.patient_id == patient_id,
            MedicationLog.schedule_id.isnot(None),
            MedicationLog.scheduled_time >= local_start_naive,
            MedicationLog.scheduled_time < local_end_naive,
        ).all()

        # Build a lookup keyed by (schedule_id, UTC HH:MM of firing).
        log_lookup = {}
        for log in med_logs:
            if log.scheduled_time:
                key = (log.schedule_id, log.scheduled_time.strftime('%H:%M'))
                log_lookup[key] = log

        scheduled_meds = []

        for schedule in schedules:
            try:
                # Walk croniter forward from just before the local-day window in UTC.
                base_time = local_start_utc - timedelta(hours=1)
                cron = croniter(schedule.cron_expression, base_time)

                while True:
                    next_time_utc = cron.get_next(datetime).replace(tzinfo=timezone.utc)
                    if next_time_utc >= local_end_utc:
                        break
                    if next_time_utc < local_start_utc:
                        continue

                    # Key by the firing's UTC HH:MM (matches how scheduled_time
                    # is stored on logs — naive but holding the UTC wall-clock).
                    key = (schedule.id, next_time_utc.strftime('%H:%M'))
                    log = log_lookup.get(key)

                    scheduled_meds.append({
                        'schedule_id': schedule.id,
                        'medication_id': schedule.medication_id,
                        'medication_name': schedule.medication.name,
                        'dose_amount': schedule.dose_amount,
                        'dose_unit': schedule.medication.quantity_unit,
                        # Real UTC ISO with offset; the frontend converts to
                        # user-local for display and hour/minute bucketing.
                        'scheduled_time': next_time_utc,
                        'description': schedule.description,
                        'cron_expression': schedule.cron_expression,
                        'completed': log is not None,
                        'completed_at': log.administered_at.isoformat() if log else None,
                        'completed_by': log.administered_by if log else None,
                    })
            except Exception as cron_error:
                logger.error(f"Error processing cron expression {schedule.cron_expression}: {cron_error}")
                continue
        
        # PRN / ad-hoc administrations whose real-UTC administered_at falls
        # within the caller's local day. Surface them on the schedule view at
        # the hour they were administered so caregivers see a unified picture
        # of what's been given. is_prn=True lets the frontend render them as
        # an info row (no mark-taken / skip controls).
        prn_logs = db.query(MedicationLog).filter(
            MedicationLog.patient_id == patient_id,
            MedicationLog.schedule_id.is_(None),
            MedicationLog.dose_amount > 0,
            MedicationLog.administered_at >= local_start_utc,
            MedicationLog.administered_at < local_end_utc,
        ).all()

        for log in prn_logs:
            medication = log.medication
            if medication is None:
                continue
            given_at = log.administered_at
            if given_at is None:
                continue
            # Normalize to UTC-aware so the frontend can convert to user-local.
            if given_at.tzinfo is None:
                given_at = given_at.replace(tzinfo=timezone.utc)
            scheduled_meds.append({
                'schedule_id': None,
                'medication_id': medication.id,
                'medication_name': medication.name,
                'dose_amount': log.dose_amount,
                'dose_unit': medication.quantity_unit,
                'scheduled_time': given_at,
                'description': None,
                'cron_expression': None,
                'completed': True,
                'completed_at': given_at.isoformat(),
                'completed_by': log.administered_by,
                'is_prn': True,
                'log_id': log.id,
            })

        # Sort by the UTC instant (datetimes here are all UTC-aware now).
        return sorted(scheduled_meds, key=lambda x: x['scheduled_time'])

    except Exception as e:
        logger.error(f"Error getting scheduled medications: {e}")
        return []


def get_scheduled_care_tasks(db: Session, target_date, patient_id: int, tz_offset_minutes=None):
    """
    Get all care tasks scheduled for a specific date for a patient.
    Includes category information for nutrition detection.
    Returns completion status by joining to care_task_log.

    `tz_offset_minutes` matches the meds/nutrition path. When provided, cron
    firings are filtered to the caller's local-midnight-to-midnight window
    (expressed in UTC) so a 9pm-local feed doesn't slide onto the next UTC day.
    """
    try:
        # Caller's local-day window expressed in UTC. Without tz_offset, fall
        # back to UTC-day semantics for backward compatibility.
        if tz_offset_minutes is None:
            local_start_utc = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone.utc)
            local_end_utc = local_start_utc + timedelta(days=1)
        else:
            offset = timedelta(minutes=tz_offset_minutes)
            local_midnight_naive = datetime.combine(target_date, datetime.min.time())
            local_start_utc = (local_midnight_naive - offset).replace(tzinfo=timezone.utc)
            local_end_utc = local_start_utc + timedelta(days=1)

        # Get all active care task schedules for this patient
        schedules = db.query(CareTaskSchedule).filter(
            CareTaskSchedule.active == True,
            (CareTaskSchedule.patient_id == patient_id) | (CareTaskSchedule.patient_id == None)
        ).join(CareTask).filter(
            CareTask.active == True,
            (CareTask.patient_id == patient_id) | (CareTask.patient_id == None)
        ).all()

        # CareTaskLog.scheduled_time is TIMESTAMP (naive UTC wall-clock); strip
        # the tz off the bounds so the comparison succeeds.
        local_start_naive = local_start_utc.replace(tzinfo=None)
        local_end_naive = local_end_utc.replace(tzinfo=None)

        task_logs = db.query(CareTaskLog).filter(
            CareTaskLog.patient_id == patient_id,
            CareTaskLog.schedule_id.isnot(None),
            CareTaskLog.scheduled_time >= local_start_naive,
            CareTaskLog.scheduled_time < local_end_naive,
        ).all()

        # Build a lookup dict: {(schedule_id, HH:MM): log}. Key on the UTC
        # wall-clock the firing was emitted at.
        log_lookup = {}
        for log in task_logs:
            if log.scheduled_time:
                key = (log.schedule_id, log.scheduled_time.strftime('%H:%M'))
                log_lookup[key] = log

        scheduled_tasks = []

        for schedule in schedules:
            try:
                # Walk croniter from just before the local-day window in UTC.
                base_time = local_start_utc - timedelta(hours=1)
                cron = croniter(schedule.cron_expression, base_time)

                # Category info
                category = schedule.care_task.category

                while True:
                    next_time_utc = cron.get_next(datetime).replace(tzinfo=timezone.utc)
                    if next_time_utc >= local_end_utc:
                        break
                    if next_time_utc < local_start_utc:
                        continue

                    key = (schedule.id, next_time_utc.strftime('%H:%M'))
                    log = log_lookup.get(key)

                    scheduled_tasks.append({
                        'schedule_id': schedule.id,
                        'care_task_id': schedule.care_task_id,
                        'care_task_name': schedule.care_task.name,
                        'care_task_description': schedule.care_task.description,
                        # Real UTC datetime — frontend converts to local for display.
                        'scheduled_time': next_time_utc,
                        'schedule_description': schedule.description,
                        'notes': schedule.notes,
                        'category_id': category.id if category else None,
                        'category_name': category.name if category else None,
                        'category_color': category.color if category else None,
                        # Completion info
                        'completed': log is not None,
                        'completed_at': log.completed_at.isoformat() if log else None,
                        'completed_by': log.performed_by if log else None
                    })
            except Exception as cron_error:
                logger.error(f"Error processing cron expression {schedule.cron_expression}: {cron_error}")
                continue

        return sorted(scheduled_tasks, key=lambda x: x['scheduled_time'])

    except Exception as e:
        logger.error(f"Error getting scheduled care tasks: {e}")
        return []


def get_scheduled_nutrition(db: Session, target_date, patient_id: int, tz_offset_minutes=None):
    """
    Get all nutrition items scheduled for a specific date for a patient.
    Uses the nutrition_schedules table for meals, hydration, bathroom checks, etc.
    Returns completion status by joining to nutrition_intake.

    Also surfaces ad-hoc / PRN logs whose timestamp falls on `target_date` so
    the unified schedule view shows what was actually consumed/output:
      - NutritionIntake rows with schedule_id IS NULL (PRN intakes)
      - NutritionOutput rows (outputs are always ad-hoc; no schedule table)
    Both are marked with is_prn=True and intake_type='intake'|'output' so the
    frontend can render them as info-only rows (no mark-complete affordance).

    `tz_offset_minutes` is the minutes the caller's local time is ahead of UTC
    (matches the meds path). When provided, PRN logs are bucketed by the
    caller's local day rather than UTC midnight — otherwise an evening log in
    a negative-offset timezone (e.g. 9pm EDT) would land on the next UTC day.
    """
    try:
        # Compute the caller's local-day window in UTC (matches the medications
        # path). Without this, a 9pm EDT feed (cron `0 1 * * *` UTC) would
        # appear on the wrong local day and its completion would record the
        # wrong scheduled_time, making Overview unable to find it later.
        if tz_offset_minutes is None:
            local_start_utc = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone.utc)
            local_end_utc = local_start_utc + timedelta(days=1)
        else:
            offset = timedelta(minutes=tz_offset_minutes)
            local_midnight_naive = datetime.combine(target_date, datetime.min.time())
            local_start_utc = (local_midnight_naive - offset).replace(tzinfo=timezone.utc)
            local_end_utc = local_start_utc + timedelta(days=1)

        # Get all active nutrition schedules for this patient
        schedules = db.query(NutritionSchedule).filter(
            NutritionSchedule.is_active == True,
            NutritionSchedule.patient_id == patient_id
        ).all()

        # Completion logs whose scheduled_time falls inside the local-day
        # window. Comparing TIMESTAMPTZ against a TZ-aware bound works directly.
        nutrition_logs = db.query(NutritionIntake).filter(
            NutritionIntake.patient_id == patient_id,
            NutritionIntake.schedule_id.isnot(None),
            NutritionIntake.scheduled_time >= local_start_utc,
            NutritionIntake.scheduled_time < local_end_utc,
        ).all()

        # Build a lookup dict: {(schedule_id, HH:MM): log}. Key on the UTC
        # wall-clock so it matches the next_time_utc we emit below.
        log_lookup = {}
        for log in nutrition_logs:
            if log.scheduled_time:
                key = (log.schedule_id, log.scheduled_time.strftime('%H:%M'))
                log_lookup[key] = log

        scheduled_nutrition = []

        for schedule in schedules:
            try:
                # Walk croniter forward from just before the local-day window in UTC.
                base_time = local_start_utc - timedelta(hours=1)
                cron = croniter(schedule.cron_expression, base_time)

                while True:
                    next_time_utc = cron.get_next(datetime).replace(tzinfo=timezone.utc)
                    if next_time_utc >= local_end_utc:
                        break
                    if next_time_utc < local_start_utc:
                        continue

                    # Key by the firing's UTC HH:MM (matches stored scheduled_time).
                    key = (schedule.id, next_time_utc.strftime('%H:%M'))
                    log = log_lookup.get(key)

                    scheduled_nutrition.append({
                        'schedule_id': schedule.id,
                        'name': schedule.name,
                        'schedule_type': schedule.schedule_type,
                        'default_item_name': schedule.default_item_name,
                        'default_amount': schedule.default_amount,
                        'default_amount_unit': schedule.default_amount_unit,
                        'default_calories': schedule.default_calories,
                        # Real UTC datetime — the frontend converts to local
                        # for display and hour/minute bucketing.
                        'scheduled_time': next_time_utc,
                        'instructions': schedule.instructions,
                        'notes': schedule.notes,
                        'cron_expression': schedule.cron_expression,
                        # Completion info
                        'completed': log is not None,
                        'completed_at': log.consumed_at.isoformat() if log else None,
                        'completed_by': log.recorded_by if log else None,
                        'is_prn': False,
                        'intake_type': 'intake',
                        'log_id': log.id if log else None,
                    })
            except Exception as cron_error:
                logger.error(f"Error processing nutrition cron expression {schedule.cron_expression}: {cron_error}")
                continue

        # Mirror the PRN-medication behavior: ad-hoc intakes & outputs that
        # happened during the local day get surfaced at the hour they
        # occurred. They are already "done" so they render as completed.
        # local_start_utc / local_end_utc are computed above.
        prn_intakes = db.query(NutritionIntake).filter(
            NutritionIntake.patient_id == patient_id,
            NutritionIntake.schedule_id.is_(None),
            NutritionIntake.consumed_at >= local_start_utc,
            NutritionIntake.consumed_at < local_end_utc,
        ).all()

        for intake in prn_intakes:
            consumed = intake.consumed_at
            if consumed is None:
                continue
            if consumed.tzinfo is None:
                consumed = consumed.replace(tzinfo=timezone.utc)
            scheduled_nutrition.append({
                'schedule_id': None,
                'name': intake.item_name,
                'schedule_type': intake.item_type,
                'default_item_name': intake.item_name,
                'default_amount': intake.amount,
                'default_amount_unit': intake.amount_unit,
                'default_calories': intake.calories,
                # Emit TZ-aware UTC so the final sort can compare against the
                # schedule-firing rows (which are also TZ-aware UTC). The
                # frontend converts to local for display.
                'scheduled_time': consumed,
                'instructions': None,
                'notes': intake.notes,
                'cron_expression': None,
                'completed': True,
                'completed_at': consumed.isoformat(),
                'completed_by': intake.recorded_by,
                'is_prn': True,
                'intake_type': 'intake',
                'log_id': intake.id,
            })

        prn_outputs = db.query(NutritionOutput).filter(
            NutritionOutput.patient_id == patient_id,
            NutritionOutput.occurred_at >= local_start_utc,
            NutritionOutput.occurred_at < local_end_utc,
        ).all()

        # Human-readable label for the row name. We don't keep a free-text
        # "name" on outputs, so synthesize one from the output_type plus the
        # most-distinguishing flag (diaper/catheter/accident).
        def _output_label(o):
            type_labels = {
                'urine': 'Urine',
                'bowel': 'Bowel movement',
                'vomit': 'Vomit',
                'other': 'Output',
            }
            label = type_labels.get(o.output_type, (o.output_type or 'Output').replace('_', ' ').title())
            if o.is_diaper:
                return f"{label} (diaper)"
            if o.is_catheter:
                return f"{label} (catheter)"
            if o.is_accident:
                return f"{label} (accident)"
            return label

        # Stage PRN output rows separately so we can merge mixed-diaper
        # events (urine + bowel logged within a short window) into a single
        # row before appending to the schedule list. Caregivers think of one
        # diaper change as one event, not two.
        staged_outputs = []
        for output in prn_outputs:
            occurred = output.occurred_at
            if occurred is None:
                continue
            if occurred.tzinfo is None:
                occurred = occurred.replace(tzinfo=timezone.utc)
            staged_outputs.append({
                'schedule_id': None,
                'name': _output_label(output),
                'schedule_type': 'output',
                'default_item_name': None,
                'default_amount': output.amount,
                'default_amount_unit': output.amount_unit,
                'default_calories': None,
                # Match the schedule-firing rows: TZ-aware UTC. Frontend localizes.
                'scheduled_time': occurred,
                'instructions': None,
                'notes': output.notes,
                'cron_expression': None,
                'completed': True,
                'completed_at': occurred.isoformat(),
                'completed_by': output.recorded_by,
                'is_prn': True,
                'intake_type': 'output',
                'log_id': output.id,
                'output_type': output.output_type,
                # Carry the source row so merge can reach diaper flag + amounts.
                '_source': output,
            })

        # Merge diaper outputs within a 3-minute sliding window. Non-diaper
        # outputs (vomit, accidents not in a diaper, etc.) are never merged.
        merge_window = timedelta(minutes=3)
        diaper_rows = sorted(
            [r for r in staged_outputs if r['_source'].is_diaper],
            key=lambda r: r['scheduled_time'],
        )
        non_diaper_rows = [r for r in staged_outputs if not r['_source'].is_diaper]

        groups = []
        for row in diaper_rows:
            if groups and (row['scheduled_time'] - groups[-1][0]['scheduled_time']) <= merge_window:
                groups[-1].append(row)
            else:
                groups.append([row])

        for group in groups:
            if len(group) == 1:
                merged = group[0]
                merged.pop('_source', None)
                scheduled_nutrition.append(merged)
                continue
            # Build a synthesized "mixed diaper" row. Use the earliest time
            # so chronological sort is stable; carry member log_ids in a
            # composite log_id so the frontend row key stays unique.
            types = [r['output_type'] for r in group]
            ids = [r['log_id'] for r in group]
            scheduled_nutrition.append({
                'schedule_id': None,
                'name': f"Mixed diaper ({' + '.join(types)})",
                'schedule_type': 'output',
                'default_item_name': None,
                'default_amount': None,
                'default_amount_unit': None,
                'default_calories': None,
                'scheduled_time': group[0]['scheduled_time'],
                'instructions': None,
                'notes': None,
                'cron_expression': None,
                'completed': True,
                'completed_at': group[0]['completed_at'],
                'completed_by': group[0]['completed_by'],
                'is_prn': True,
                'intake_type': 'output',
                'log_id': f"mixed-{'-'.join(str(i) for i in ids)}",
                'output_type': 'mixed_diaper',
            })

        for row in non_diaper_rows:
            row.pop('_source', None)
            scheduled_nutrition.append(row)

        return sorted(scheduled_nutrition, key=lambda x: x['scheduled_time'])

    except Exception as e:
        logger.error(f"Error getting scheduled nutrition: {e}")
        return []


def get_due_and_upcoming_nutrition_count(db: Session):
    """
    Returns the count of scheduled nutrition items that need attention:
    - missed (yesterday or today, scheduled >1h ago and not completed)
    - due/late (today, scheduled 15min–1h ago and not completed)
    - ready (today, within ±15min of now and not completed)
    - upcoming (today, scheduled within the next hour and not completed)

    PRN (ad-hoc) intakes and outputs are excluded — they're already done.
    """
    try:
        active_patient = get_active_patient(db)
        if not active_patient:
            return 0

        today = utc_today()
        yesterday = today - timedelta(days=1)
        now = utc_now()

        items = (
            get_scheduled_nutrition(db, yesterday, active_patient.id) +
            get_scheduled_nutrition(db, today, active_patient.id)
        )

        count = 0
        for item in items:
            if item.get('is_prn'):
                continue
            if item.get('completed'):
                continue
            scheduled_time = item.get('scheduled_time')
            if isinstance(scheduled_time, str):
                scheduled_time = datetime.fromisoformat(scheduled_time)
            if scheduled_time is None:
                continue
            if scheduled_time.tzinfo is None:
                scheduled_time = scheduled_time.replace(tzinfo=timezone.utc)

            diff_seconds = (scheduled_time - now).total_seconds()
            # missed/late/ready, OR upcoming within the next hour
            if diff_seconds < -900 or abs(diff_seconds) <= 900 or (0 < diff_seconds <= 3600):
                count += 1

        return count
    except Exception as e:
        logger.error(f"Error getting due/upcoming nutrition count: {e}")
        return 0

