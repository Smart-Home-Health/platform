"""
Scheduling CRUD operations for care tasks
"""
import logging
from datetime import datetime, timedelta
from croniter import croniter
from sqlalchemy.orm import Session
from schemas.care_task import CareTask
from schemas.care_task_schedule import CareTaskSchedule
from schemas.care_task_log import CareTaskLog
from crud.patients import get_active_patient

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
        
        now = datetime.now()
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
        
        schedule.updated_at = datetime.now()
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
        schedule.updated_at = datetime.now()
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
            target_date = datetime.now().date()
        
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
                # Calculate next occurrence using croniter
                # Convert date to datetime for croniter
                start_of_day = datetime.combine(target_date, datetime.min.time())
                cron = croniter(schedule.cron_expression, start_of_day)
                
                # Get all times for this date
                end_of_day = datetime.combine(target_date, datetime.max.time())
                
                current_time = cron.get_next(datetime)
                while current_time.date() == target_date:
                    scheduled_tasks.append({
                        'schedule_id': schedule.id,
                        'care_task_id': schedule.care_task_id,
                        'care_task_name': schedule.care_task.name,
                        'care_task_description': schedule.care_task.description,
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
            target_date = datetime.now().date() - timedelta(days=1)
        
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
        today = datetime.now().date()
        yesterday = today - timedelta(days=1)
        current_time = datetime.now()
        
        # Get scheduled tasks for yesterday and today for the specified patient
        yesterday_scheduled = get_scheduled_care_tasks_for_date(db, yesterday, patient_id)
        today_scheduled = get_scheduled_care_tasks_for_date(db, today, patient_id)
        
        all_scheduled = []
        
        # Process yesterday's schedules (check if missed or completed)
        for item in yesterday_scheduled:
            # Check if this task was completed/skipped for this specific time
            completion_log = db.query(CareTaskLog).filter(
                CareTaskLog.schedule_id == item['schedule_id'],
                CareTaskLog.scheduled_time == item['scheduled_time']
            ).first()
            
            if completion_log:
                item['status'] = completion_log.status  # 'completed', 'skipped', etc.
                item['completed_at'] = completion_log.completed_at.isoformat() if completion_log.completed_at else None
                item['notes'] = completion_log.notes
            else:
                item['status'] = 'missed'  # Default to missed for yesterday
            
            item['is_yesterday'] = True
            all_scheduled.append(item)
        
        # Process today's schedules
        for item in today_scheduled:
            # Check if this task was completed/skipped for this specific time
            completion_log = db.query(CareTaskLog).filter(
                CareTaskLog.schedule_id == item['schedule_id'],
                CareTaskLog.scheduled_time == item['scheduled_time']
            ).first()
            
            if completion_log:
                item['status'] = completion_log.status  # 'completed', 'skipped', etc.
                item['completed_at'] = completion_log.completed_at.isoformat() if completion_log.completed_at else None
                item['notes'] = completion_log.notes
            else:
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
            'generated_at': datetime.now().isoformat()
        }


def complete_care_task(db: Session, task_id, schedule_id=None, scheduled_time=None, notes=None, status='completed', completed_by=None):
    """
    Complete a care task (either scheduled or ad-hoc)
    
    Args:
        task_id: ID of the care task
        schedule_id: ID of the schedule (if this is a scheduled completion)
        scheduled_time: The originally scheduled time (for timing analysis)
        notes: Optional notes about the completion
        status: Completion status ('completed', 'skipped', 'partial')
        completed_by: Optional identifier of who completed the task
    
    Returns:
        ID of the created log entry, or None if failed
    """
    try:
        now = datetime.now()
        
        # Get the care task to retrieve patient_id
        care_task = db.query(CareTask).filter(CareTask.id == task_id).first()
        if not care_task:
            logger.error(f"Care task {task_id} not found")
            return None
        
        # Determine patient_id: use care_task's patient_id or get active patient
        patient_id = care_task.patient_id
        if patient_id is None:
            # For global care tasks, use the active patient
            active_patient = get_active_patient(db)
            if active_patient:
                patient_id = active_patient.id
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
                
            diff_minutes = (now - scheduled_dt).total_seconds() / 60
            
            if diff_minutes < -15:  # More than 15 minutes early
                completed_early = True
            elif diff_minutes > 15:  # More than 15 minutes late
                completed_late = True
        
        # Create the completion log
        log = CareTaskLog(
            care_task_id=task_id,
            patient_id=patient_id,  # Use the determined patient_id
            schedule_id=schedule_id,
            completed_at=now,
            is_scheduled=is_scheduled,
            scheduled_time=scheduled_time,
            completed_early=completed_early,
            completed_late=completed_late,
            status=status,
            notes=notes,
            completed_by=completed_by,
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
        now = datetime.now()
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
        
        now = datetime.now()
        cron = croniter(schedule.cron_expression, now)
        
        next_times = []
        for _ in range(count):
            next_time = cron.get_next(datetime)
            next_times.append(next_time)
        
        return next_times
        
    except Exception as e:
        logger.error(f"Error getting next scheduled times for schedule {schedule_id}: {e}")
        return []
