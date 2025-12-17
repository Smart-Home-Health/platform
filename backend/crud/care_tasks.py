"""
Care tasks management CRUD operations
"""
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from schemas.care_task_category import CareTaskCategory
from schemas.care_task import CareTask
from schemas.care_task_log import CareTaskLog

logger = logging.getLogger('crud')


# --- CareTaskCategory CRUD ---
def add_care_task_category(db: Session, name, description=None, color='#3B82F6'):
    """
    Add a new care task category
    """
    try:
        now = datetime.now()
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
        
        category.updated_at = datetime.now()
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
        
        now = datetime.now()
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


def get_care_tasks(db: Session, active_only=True, category_id=None, patient_id=None):
    """
    Get care tasks with optional filtering
    
    Args:
        active_only: If True, only return active tasks
        category_id: If provided, filter by category
        patient_id: If provided, filter by patient (includes global tasks)
    """
    try:
        from crud.patients import get_active_patient
        
        query = db.query(CareTask)
        
        if active_only:
            query = query.filter(CareTask.active == True)
        
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
                'updated_at': task.updated_at.isoformat() if task.updated_at else None
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
        
        task.updated_at = datetime.now()
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
        task.updated_at = datetime.now()
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
        task.updated_at = datetime.now()
        db.commit()
        logger.info(f"Care task {task_id} active status toggled to {task.active}")
        return True, task.active
    except Exception as e:
        logger.error(f"Error toggling care task {task_id}: {e}")
        db.rollback()
        return False, None


# --- CareTaskLog CRUD ---
def log_care_task(db: Session, task_id, completion_status='completed', notes=None, completed_by=None):
    """
    Log completion of a care task
    
    Args:
        task_id: ID of the care task
        completion_status: 'completed', 'skipped', 'partial', etc.
        notes: Optional notes about the completion
        completed_by: Optional identifier of who completed the task
    """
    try:
        now = datetime.now()
        log = CareTaskLog(
            task_id=task_id,
            completed_at=now,
            completion_status=completion_status,
            notes=notes,
            completed_by=completed_by,
            created_at=now
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        logger.info(f"Care task logged: {task_id} - {completion_status}")
        return log.id
    except Exception as e:
        logger.error(f"Error logging care task: {e}")
        db.rollback()
        return None


def get_care_task_logs(db: Session, task_id=None, limit=50, start_date=None, end_date=None):
    """
    Get care task completion logs with optional filtering
    
    Args:
        task_id: Filter by specific task ID
        limit: Maximum number of records to return
        start_date: Filter by start date (YYYY-MM-DD format)
        end_date: Filter by end date (YYYY-MM-DD format)
    """
    try:
        query = db.query(CareTaskLog).join(CareTask)
        
        if task_id:
            query = query.filter(CareTaskLog.task_id == task_id)
        
        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(CareTaskLog.completed_at >= start_dt)
        
        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            query = query.filter(CareTaskLog.completed_at <= end_dt)
        
        logs = query.order_by(CareTaskLog.completed_at.desc()).limit(limit).all()
        
        return [
            {
                'id': log.id,
                'task_id': log.task_id,
                'task_name': log.task.name,
                'task_category': log.task.category.name if log.task.category else None,
                'completed_at': log.completed_at.isoformat(),
                'completion_status': log.completion_status,
                'notes': log.notes,
                'completed_by': log.completed_by,
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
        cutoff_date = datetime.now() - timedelta(days=days)
        
        logs = db.query(CareTaskLog).filter(
            CareTaskLog.completed_at >= cutoff_date
        ).join(CareTask).order_by(CareTaskLog.completed_at.desc()).all()
        
        return [
            {
                'id': log.id,
                'task_id': log.task_id,
                'task_name': log.task.name,
                'task_category': log.task.category.name if log.task.category else None,
                'category_color': log.task.category.color if log.task.category else '#3B82F6',
                'completed_at': log.completed_at.isoformat(),
                'completion_status': log.completion_status,
                'notes': log.notes,
                'completed_by': log.completed_by
            }
            for log in logs
        ]
    except Exception as e:
        logger.error(f"Error fetching recent care task completions: {e}")
        return []


def get_care_task_completion_stats(db: Session, days=30):
    """
    Get completion statistics for care tasks over the last N days
    """
    try:
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Get all logs from the period
        logs = db.query(CareTaskLog).filter(
            CareTaskLog.completed_at >= cutoff_date
        ).join(CareTask).all()
        
        # Group by task and completion status
        stats = {}
        for log in logs:
            task_name = log.task.name
            status = log.completion_status
            
            if task_name not in stats:
                stats[task_name] = {
                    'task_id': log.task_id,
                    'task_name': task_name,
                    'category': log.task.category.name if log.task.category else None,
                    'total_logs': 0,
                    'completed': 0,
                    'skipped': 0,
                    'partial': 0,
                    'other': 0
                }
            
            stats[task_name]['total_logs'] += 1
            
            if status == 'completed':
                stats[task_name]['completed'] += 1
            elif status == 'skipped':
                stats[task_name]['skipped'] += 1
            elif status == 'partial':
                stats[task_name]['partial'] += 1
            else:
                stats[task_name]['other'] += 1
        
        # Calculate completion rates
        for task_stats in stats.values():
            total = task_stats['total_logs']
            if total > 0:
                task_stats['completion_rate'] = round((task_stats['completed'] / total) * 100, 1)
            else:
                task_stats['completion_rate'] = 0
        
        return list(stats.values())
    except Exception as e:
        logger.error(f"Error getting care task completion stats: {e}")
        return []


def get_overdue_care_tasks(db: Session):
    """
    Get care tasks that might be overdue based on their frequency
    This is a simplified implementation - would need more sophisticated scheduling logic
    """
    try:
        # Get all active tasks
        tasks = db.query(CareTask).filter(CareTask.active == True).all()
        
        overdue_tasks = []
        now = datetime.now()
        
        for task in tasks:
            if not task.frequency:
                continue
            
            # Get the last completion log for this task
            last_log = db.query(CareTaskLog).filter(
                CareTaskLog.task_id == task.id
            ).order_by(CareTaskLog.completed_at.desc()).first()
            
            if not last_log:
                # Never completed - might be overdue depending on frequency
                overdue_tasks.append({
                    'id': task.id,
                    'name': task.name,
                    'category': task.category.name if task.category else None,
                    'frequency': task.frequency,
                    'last_completed': None,
                    'days_since_completion': None,
                    'reason': 'Never completed'
                })
                continue
            
            # Calculate days since last completion
            days_since = (now - last_log.completed_at).days
            
            # Simple frequency check (this could be more sophisticated)
            is_overdue = False
            reason = None
            
            if 'daily' in task.frequency.lower() and days_since > 1:
                is_overdue = True
                reason = f"Daily task, {days_since} days since last completion"
            elif 'weekly' in task.frequency.lower() and days_since > 7:
                is_overdue = True
                reason = f"Weekly task, {days_since} days since last completion"
            elif 'monthly' in task.frequency.lower() and days_since > 30:
                is_overdue = True
                reason = f"Monthly task, {days_since} days since last completion"
            
            if is_overdue:
                overdue_tasks.append({
                    'id': task.id,
                    'name': task.name,
                    'category': task.category.name if task.category else None,
                    'frequency': task.frequency,
                    'last_completed': last_log.completed_at.isoformat(),
                    'days_since_completion': days_since,
                    'reason': reason
                })
        
        return overdue_tasks
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
