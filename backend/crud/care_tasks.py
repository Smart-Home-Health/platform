"""
Care tasks management CRUD operations
"""
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from schemas.care_task_category import CareTaskCategory
from schemas.care_task import CareTask
from schemas.care_task_log import CareTaskLog
from utils.datetime_utils import utc_now

logger = logging.getLogger('crud')


# --- CareTaskCategory CRUD ---
def add_care_task_category(db: Session, name, description=None, color='#3B82F6'):
    """
    Add a new care task category
    """
    try:
        now = utc_now()
        category = CareTaskCategory(
            name=name,
            description=description,
            color=color,
            created_at=now,
            updated_at=now
        )
        db.add(category)
        db.commit()
        db.refresh(category)
        logger.info(f"Care task category added: {name}")
        return category.id
    except Exception as e:
        logger.error(f"Error adding care task category: {e}")
        db.rollback()
        return None


def get_care_task_categories(db: Session):
    """
    Get all care task categories ordered by name
    """
    try:
        categories = db.query(CareTaskCategory).order_by(CareTaskCategory.name).all()
        
        return [
            {
                'id': cat.id,
                'name': cat.name,
                'description': cat.description,
                'color': cat.color,
                'active': cat.active,
                'is_default': cat.is_default,
                'created_at': cat.created_at.isoformat() if cat.created_at else None,
                'updated_at': cat.updated_at.isoformat() if cat.updated_at else None
            }
            for cat in categories
        ]
    except Exception as e:
        logger.error(f"Error fetching care task categories: {e}")
        return []


def update_care_task_category(db: Session, category_id, **kwargs):
    """
    Update an existing care task category
    """
    try:
        category = db.query(CareTaskCategory).filter(CareTaskCategory.id == category_id).first()
        if not category:
            return False
        
        # Update fields
        for key, value in kwargs.items():
            if hasattr(category, key):
                setattr(category, key, value)
        
        category.updated_at = utc_now()
        db.commit()
        logger.info(f"Care task category updated: {category.name}")
        return True
    except Exception as e:
        logger.error(f"Error updating care task category: {e}")
        db.rollback()
        return False


def delete_care_task_category(db: Session, category_id):
    """
    Delete a care task category (only if no tasks are using it)
    """
    try:
        # Check if any tasks are using this category
        task_count = db.query(CareTask).filter(CareTask.category_id == category_id).count()
        if task_count > 0:
            logger.warning(f"Cannot delete category {category_id}: {task_count} tasks are using it")
            return False
        
        category = db.query(CareTaskCategory).filter(CareTaskCategory.id == category_id).first()
        if not category:
            return False
        
        db.delete(category)
        db.commit()
        logger.info(f"Care task category deleted: {category.name}")
        return True
    except Exception as e:
        logger.error(f"Error deleting care task category {category_id}: {e}")
        db.rollback()
        return False


# --- CareTask CRUD ---
def add_care_task(db: Session, name, category_id, description=None, active=True, patient_id=None):
    """
    Add a new care task
    
    Args:
        patient_id: If provided, assign task to specific patient. If None, creates global task template.
    """
    try:
        from crud.patients import get_active_patient
        
        # If no patient_id provided and we want patient-specific tasks, use current patient
        # For now, we'll keep it as a global template unless explicitly specified
        # You can modify this logic based on your requirements
        
        now = utc_now()
        task = CareTask(
            name=name,
            patient_id=patient_id,  # Can be None for global templates
            category_id=category_id,
            description=description,
            active=active,
            created_at=now,
            updated_at=now
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        logger.info(f"Care task added: {name} (patient_id: {patient_id})")
        return task.id
    except Exception as e:
        logger.error(f"Error adding care task: {e}")
        db.rollback()
        return None


def get_care_tasks(db: Session, active_only=True, inactive_only=False, category_id=None, patient_id=None):
    """
    Get care tasks with optional filtering
    
    Args:
        active_only: If True, only return active tasks
        inactive_only: If True, only return inactive tasks
        category_id: If provided, filter by category
        patient_id: If provided, filter by patient (includes global tasks)
    """
    try:
        from crud.patients import get_active_patient
        
        query = db.query(CareTask)
        
        if active_only:
            query = query.filter(CareTask.active == True)
        elif inactive_only:
            query = query.filter(CareTask.active == False)
        
        if category_id:
            query = query.filter(CareTask.category_id == category_id)
        
        # Filter by patient - if no patient_id provided, use current patient
        if patient_id is None:
            active_patient = get_active_patient(db)
            if active_patient:
                # Show tasks for current patient OR global tasks (patient_id is NULL)
                query = query.filter(
                    (CareTask.patient_id == active_patient.id) | 
                    (CareTask.patient_id.is_(None))
                )
        elif patient_id == -1:
            # Admin mode: show all tasks regardless of patient
            pass  # No patient filter
        else:
            # Show tasks for specific patient OR global tasks
            query = query.filter(
                (CareTask.patient_id == patient_id) | 
                (CareTask.patient_id.is_(None))
            )
        
        tasks = query.order_by(CareTask.name).all()
        
        return [
            {
                'id': task.id,
                'name': task.name,
                'patient_id': task.patient_id,
                'category_id': task.category_id,
                'category_name': task.category.name if task.category else None,
                'category_color': task.category.color if task.category else '#3B82F6',
                'description': task.description,
                'active': task.active,
                'created_at': task.created_at.isoformat() if task.created_at else None,
                'updated_at': task.updated_at.isoformat() if task.updated_at else None,
                'schedules': [
                    {
                        'id': schedule.id,
                        'cron_expression': schedule.cron_expression,
                        'description': schedule.description,
                        'active': schedule.active,
                        'notes': schedule.notes,
                        'patient_id': schedule.patient_id
                    }
                    for schedule in task.schedules
                ] if task.schedules else []
            }
            for task in tasks
        ]
    except Exception as e:
        logger.error(f"Error fetching care tasks: {e}")
        return []


def get_care_task(db: Session, task_id):
    """
    Get a specific care task by ID
    """
    try:
        task = db.query(CareTask).filter(CareTask.id == task_id).first()
        if not task:
            return None
        
        return {
            'id': task.id,
            'name': task.name,
            'category_id': task.category_id,
            'category_name': task.category.name if task.category else None,
            'category_color': task.category.color if task.category else '#3B82F6',
            'description': task.description,
            'active': task.active,
            'created_at': task.created_at.isoformat() if task.created_at else None,
            'updated_at': task.updated_at.isoformat() if task.updated_at else None
        }
    except Exception as e:
        logger.error(f"Error fetching care task {task_id}: {e}")
        return None


def update_care_task(db: Session, task_id, **kwargs):
    """
    Update an existing care task
    """
    try:
        task = db.query(CareTask).filter(CareTask.id == task_id).first()
        if not task:
            return False
        
        # Update fields
        for key, value in kwargs.items():
            if hasattr(task, key):
                setattr(task, key, value)
        
        task.updated_at = utc_now()
        db.commit()
        logger.info(f"Care task updated: {task.name}")
        return True
    except Exception as e:
        logger.error(f"Error updating care task: {e}")
        db.rollback()
        return False


def delete_care_task(db: Session, task_id):
    """
    Delete a care task (soft delete by setting active=False)
    """
    try:
        task = db.query(CareTask).filter(CareTask.id == task_id).first()
        if not task:
            return False
        
        task.active = False
        task.updated_at = utc_now()
        db.commit()
        logger.info(f"Care task deleted (soft): {task.name}")
        return True
    except Exception as e:
        logger.error(f"Error deleting care task {task_id}: {e}")
        db.rollback()
        return False


def toggle_care_task_active(db: Session, task_id):
    """
    Toggle the active status of a care task
    """
    try:
        task = db.query(CareTask).filter(CareTask.id == task_id).first()
        if not task:
            return False, None
        
        task.active = not task.active
        task.updated_at = utc_now()
        db.commit()
        logger.info(f"Care task {task_id} active status toggled to {task.active}")
        return True, task.active
    except Exception as e:
        logger.error(f"Error toggling care task {task_id}: {e}")
        db.rollback()
        return False, None


# --- CareTaskLog CRUD ---
def get_care_task_logs(db: Session, task_id=None, limit=50, start_date=None, end_date=None,
                       patient_id=None, task_name=None, category_id=None, status_filter=None):
    """
    Get care task completion logs with optional filtering
    
    Args:
        task_id: Filter by specific task ID
        limit: Maximum number of records to return
        start_date: Filter by start date (YYYY-MM-DD format)
        end_date: Filter by end date (YYYY-MM-DD format)
        patient_id: Filter by patient ID
        task_name: Filter by task name (partial match)
        category_id: Filter by category ID
        status_filter: Filter by completion status
    """
    try:
        query = db.query(CareTaskLog).join(CareTask, CareTaskLog.care_task_id == CareTask.id)

        if task_id:
            query = query.filter(CareTaskLog.care_task_id == task_id)

        if patient_id:
            query = query.filter(CareTask.patient_id == patient_id)

        if task_name:
            query = query.filter(CareTask.name.ilike(f"%{task_name}%"))

        if category_id:
            query = query.filter(CareTask.category_id == category_id)

        if status_filter:
            query = query.filter(CareTaskLog.status == status_filter)

        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(CareTaskLog.completed_at >= start_dt)

        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
            query = query.filter(CareTaskLog.completed_at < end_dt)

        logs = query.order_by(CareTaskLog.completed_at.desc()).limit(limit).all()

        # Output keys (task_id / completion_status / completed_by) are kept
        # for the frontend; only the DB-column names changed.
        return [
            {
                'id': log.id,
                'task_id': log.care_task_id,
                'task_name': log.care_task.name,
                'task_description': log.care_task.description,
                'task_category': log.care_task.category.name if log.care_task.category else None,
                'task_category_id': log.care_task.category_id,
                'task_category_color': log.care_task.category.color if log.care_task.category else '#6f42c1',
                'completed_at': log.completed_at.isoformat(),
                'completion_status': log.status,
                'notes': log.notes,
                'completed_by': log.performed_by,
                'schedule_id': log.schedule_id,
                'scheduled_time': log.scheduled_time.isoformat() if log.scheduled_time else None,
                'created_at': log.created_at.isoformat() if log.created_at else None
            }
            for log in logs
        ]
    except Exception as e:
        logger.error(f"Error fetching care task logs: {e}")
        return []


def get_recent_care_task_completions(db: Session, days=7):
    """
    Get care task completions from the last N days
    """
    try:
        cutoff_date = utc_now() - timedelta(days=days)

        logs = db.query(CareTaskLog).filter(
            CareTaskLog.completed_at >= cutoff_date
        ).join(CareTask).order_by(CareTaskLog.completed_at.desc()).all()

        return [
            {
                'id': log.id,
                'task_id': log.care_task_id,
                'task_name': log.care_task.name,
                'task_category': log.care_task.category.name if log.care_task.category else None,
                'category_color': log.care_task.category.color if log.care_task.category else '#3B82F6',
                'completed_at': log.completed_at.isoformat(),
                'completion_status': log.status,
                'notes': log.notes,
                'completed_by': log.performed_by
            }
            for log in logs
        ]
    except Exception as e:
        logger.error(f"Error fetching recent care task completions: {e}")
        return []


def get_care_task_completion_stats(db: Session, days=30, patient_id=None):
    """
    Per-task completion statistics over the last N days.
    """
    try:
        cutoff_date = utc_now() - timedelta(days=days)

        query = db.query(CareTaskLog).filter(
            CareTaskLog.completed_at >= cutoff_date
        ).join(CareTask)
        if patient_id is not None:
            query = query.filter(CareTaskLog.patient_id == patient_id)
        logs = query.all()

        stats = {}
        for log in logs:
            task_name = log.care_task.name
            status = log.status

            if task_name not in stats:
                stats[task_name] = {
                    'task_id': log.care_task_id,
                    'task_name': task_name,
                    'category': log.care_task.category.name if log.care_task.category else None,
                    'category_color': log.care_task.category.color if log.care_task.category else None,
                    'total_logs': 0,
                    'completed': 0,
                    'on_time': 0,
                    'late': 0,
                    'early': 0,
                    'skipped': 0,
                    'partial': 0,
                    'other': 0,
                }

            entry = stats[task_name]
            entry['total_logs'] += 1

            if status == 'completed':
                entry['completed'] += 1
                if log.completed_late:
                    entry['late'] += 1
                elif log.completed_early:
                    entry['early'] += 1
                else:
                    entry['on_time'] += 1
            elif status == 'skipped':
                entry['skipped'] += 1
            elif status == 'partial':
                entry['partial'] += 1
            else:
                entry['other'] += 1

        for entry in stats.values():
            total = entry['total_logs']
            entry['completion_rate'] = round((entry['completed'] / total) * 100, 1) if total else 0

        return sorted(stats.values(), key=lambda s: s['total_logs'], reverse=True)
    except Exception as e:
        logger.error(f"Error getting care task completion stats: {e}")
        return []


def get_care_task_adherence_overview(db: Session, days=30, patient_id=None):
    """
    High-level adherence numbers over the last N days.
    Counts completed (on-time / late / early), skipped, and computes adherence rate.
    """
    try:
        cutoff_date = utc_now() - timedelta(days=days)

        query = db.query(CareTaskLog).filter(CareTaskLog.completed_at >= cutoff_date)
        if patient_id is not None:
            query = query.filter(CareTaskLog.patient_id == patient_id)
        logs = query.all()

        completed = on_time = late = early = skipped = other = 0
        for log in logs:
            if log.status == 'completed':
                completed += 1
                if log.completed_late:
                    late += 1
                elif log.completed_early:
                    early += 1
                else:
                    on_time += 1
            elif log.status == 'skipped':
                skipped += 1
            else:
                other += 1

        decided = completed + skipped
        adherence_rate = round((completed / decided) * 100, 1) if decided else 0
        on_time_rate = round((on_time / completed) * 100, 1) if completed else 0

        return {
            'window_days': days,
            'total_logs': len(logs),
            'completed': completed,
            'on_time': on_time,
            'late': late,
            'early': early,
            'skipped': skipped,
            'other': other,
            'adherence_rate': adherence_rate,
            'on_time_rate': on_time_rate,
        }
    except Exception as e:
        logger.error(f"Error getting care task adherence overview: {e}")
        return {
            'window_days': days,
            'total_logs': 0,
            'completed': 0, 'on_time': 0, 'late': 0, 'early': 0,
            'skipped': 0, 'other': 0,
            'adherence_rate': 0, 'on_time_rate': 0,
        }


def get_care_task_stats_by_user(db: Session, days=30, patient_id=None):
    """
    Per-user activity over the last N days: completed / on-time / late / skipped.
    Logs without a performed_by are grouped under an 'unknown' bucket.
    """
    try:
        from models.users import User
        cutoff_date = utc_now() - timedelta(days=days)

        query = db.query(CareTaskLog).filter(CareTaskLog.completed_at >= cutoff_date)
        if patient_id is not None:
            query = query.filter(CareTaskLog.patient_id == patient_id)
        logs = query.all()

        user_ids = {log.performed_by for log in logs if log.performed_by}
        users_by_id = {
            u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()
        } if user_ids else {}

        stats = {}
        for log in logs:
            key = log.performed_by if log.performed_by else 0
            if key not in stats:
                user = users_by_id.get(key)
                if user:
                    label = user.full_name or user.username
                else:
                    label = 'Unattributed'
                stats[key] = {
                    'user_id': key or None,
                    'name': label,
                    'completed': 0,
                    'on_time': 0,
                    'late': 0,
                    'early': 0,
                    'skipped': 0,
                    'total_logs': 0,
                }

            entry = stats[key]
            entry['total_logs'] += 1
            if log.status == 'completed':
                entry['completed'] += 1
                if log.completed_late:
                    entry['late'] += 1
                elif log.completed_early:
                    entry['early'] += 1
                else:
                    entry['on_time'] += 1
            elif log.status == 'skipped':
                entry['skipped'] += 1

        return sorted(stats.values(), key=lambda s: s['total_logs'], reverse=True)
    except Exception as e:
        logger.error(f"Error getting care task stats by user: {e}")
        return []


def get_overdue_care_tasks(db: Session, patient_id=None):
    """
    Get care-task occurrences scheduled in the past (yesterday or earlier today)
    that have no completion or skip log.
    """
    try:
        from crud.scheduling import get_scheduled_care_tasks_for_date
        from utils.datetime_utils import utc_today

        now = utc_now()
        today = utc_today()
        yesterday = today - timedelta(days=1)

        all_scheduled = (
            get_scheduled_care_tasks_for_date(db, yesterday, patient_id)
            + get_scheduled_care_tasks_for_date(db, today, patient_id)
        )

        overdue = []
        for item in all_scheduled:
            scheduled_time = item['scheduled_time']
            if scheduled_time >= now:
                continue

            log = db.query(CareTaskLog).filter(
                CareTaskLog.schedule_id == item['schedule_id'],
                CareTaskLog.scheduled_time == scheduled_time
            ).first()
            if log:
                continue

            overdue.append({
                'id': item['care_task_id'],
                'schedule_id': item['schedule_id'],
                'name': item['care_task_name'],
                'category': item.get('care_task_category_name'),
                'scheduled_time': scheduled_time.isoformat(),
                'minutes_overdue': int((now - scheduled_time).total_seconds() / 60),
            })

        return overdue
    except Exception as e:
        logger.error(f"Error getting overdue care tasks: {e}")
        return []


def delete_care_task_log(db: Session, log_id):
    """
    Delete a care task log entry
    """
    try:
        log = db.query(CareTaskLog).filter(CareTaskLog.id == log_id).first()
        if not log:
            return False
        
        db.delete(log)
        db.commit()
        logger.info(f"Care task log {log_id} deleted")
        return True
    except Exception as e:
        logger.error(f"Error deleting care task log {log_id}: {e}")
        db.rollback()
        return False


def update_care_task_log(db: Session, log_id, **kwargs):
    """
    Update an existing care task log entry
    """
    try:
        log = db.query(CareTaskLog).filter(CareTaskLog.id == log_id).first()
        if not log:
            return False
        
        # Update fields
        for key, value in kwargs.items():
            if hasattr(log, key):
                setattr(log, key, value)
        
        db.commit()
        logger.info(f"Care task log {log_id} updated")
        return True
    except Exception as e:
        logger.error(f"Error updating care task log {log_id}: {e}")
        db.rollback()
        return False
