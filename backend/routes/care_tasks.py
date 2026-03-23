"""
Care task management routes
"""
import logging
from fastapi import APIRouter, Depends, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from db import get_db
from dependencies import require_read_access
from models.care_tasks import (
    CareTaskCreate,
    CareTaskUpdate,
    CareTaskResponse,
    CareTaskComplete,
    CareTaskScheduleCreate,
    CareTaskScheduleUpdate,
    CareTaskScheduleResponse,
    CareTaskScheduleComplete,
    CareTaskCategoryCreate,
    CareTaskCategoryUpdate,
    CareTaskCategoryResponse,
    CronValidation,
    CareTaskLogResponse,
)
from crud.care_tasks import (
    add_care_task, get_care_tasks, get_care_task, update_care_task, 
    delete_care_task, toggle_care_task_active, log_care_task,
    add_care_task_category, get_care_task_categories, update_care_task_category, 
    delete_care_task_category, get_care_task_logs, get_recent_care_task_completions,
    get_care_task_completion_stats, get_overdue_care_tasks
)
from crud.scheduling import (
    add_care_task_schedule, get_care_task_schedules, get_all_care_task_schedules,
    update_care_task_schedule, delete_care_task_schedule, toggle_care_task_schedule_active,
    get_daily_care_task_schedule, complete_care_task, get_care_task_schedule,
    validate_cron_expression, get_next_scheduled_times
)
from crud.patients import get_current_patient

logger = logging.getLogger("app")

router = APIRouter(prefix="/api", tags=["care_tasks"])


# Care Task CRUD endpoints
@router.post("/add/care-task")
async def api_add_care_task(data: CareTaskCreate, db: Session = Depends(get_db)):
    """Add a new care task"""
    try:
        # Get current patient if not provided
        patient_id = data.patient_id
        if patient_id is None:
            current_patient = get_current_patient(db)
            patient_id = current_patient.id if current_patient else None
        
        task_id = add_care_task(
            db=db,
            name=data.name,
            category_id=data.category_id,
            description=data.description,
            active=data.active,
            patient_id=patient_id
        )
        if task_id:
            return {"id": task_id, "status": "success"}
        else:
            return JSONResponse(status_code=500, content={"detail": "Failed to create care task"})
    except Exception as e:
        logger.error(f"Error adding care task: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error adding care task: {str(e)}"}
        )


@router.get("/care-tasks/active")
async def get_active_care_tasks_endpoint(patient_id: int = None, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get all active care tasks, optionally filtered by patient"""
    try:
        # If no patient_id provided, use current patient
        if patient_id is None:
            current_patient = get_current_patient(db)
            patient_id = current_patient.id if current_patient else None
        
        tasks = get_care_tasks(db, active_only=True, patient_id=patient_id)
        return {"care_tasks": tasks}
    except Exception as e:
        logger.error(f"Error fetching active care tasks: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/care-tasks/inactive")
async def get_inactive_care_tasks_endpoint(patient_id: int = None, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get all inactive care tasks, optionally filtered by patient"""
    try:
        # If no patient_id provided, use current patient
        if patient_id is None:
            current_patient = get_current_patient(db)
            patient_id = current_patient.id if current_patient else None
        
        tasks = get_care_tasks(db, active_only=False, inactive_only=True, patient_id=patient_id)
        return {"care_tasks": tasks}
    except Exception as e:
        logger.error(f"Error fetching inactive care tasks: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.put("/care-tasks/{task_id}")
async def update_care_task_endpoint(task_id: int, data: CareTaskUpdate, db: Session = Depends(get_db)):
    """Update an existing care task"""
    try:
        # Filter out None values
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        success = update_care_task(db, task_id, **update_data)
        if success:
            return {"status": "success"}
        else:
            return JSONResponse(status_code=404, content={"detail": "Care task not found"})
    except Exception as e:
        logger.error(f"Error updating care task {task_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error updating care task: {str(e)}"}
        )


@router.delete("/care-tasks/{task_id}")
async def delete_care_task_endpoint(task_id: int, db: Session = Depends(get_db)):
    """Delete (deactivate) a care task"""
    try:
        success = delete_care_task(db, task_id)
        if success:
            return {"status": "success"}
        else:
            return JSONResponse(status_code=404, content={"detail": "Care task not found"})
    except Exception as e:
        logger.error(f"Error deleting care task {task_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error deleting care task: {str(e)}"}
        )


@router.post("/care-tasks/{task_id}/toggle-active")
async def toggle_care_task_active_endpoint(task_id: int, db: Session = Depends(get_db)):
    """Toggle active status of a care task"""
    try:
        success, new_active_status = toggle_care_task_active(db, task_id)
        
        if success:
            return {"status": "success", "active": new_active_status}
        else:
            return JSONResponse(status_code=404, content={"detail": "Care task not found"})
    except Exception as e:
        logger.error(f"Error toggling care task {task_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error toggling care task status: {str(e)}"}
        )


@router.post("/care-tasks/{task_id}/complete")
async def complete_care_task_endpoint(task_id: int, data: CareTaskComplete, db: Session = Depends(get_db)):
    """Complete a care task"""
    try:
        log_id = log_care_task(
            db=db,
            task_id=task_id,
            completion_status=data.status,
            notes=data.notes,
            completed_by=data.completed_by
        )
        if log_id:
            return {"id": log_id, "status": "success"}
        else:
            return JSONResponse(status_code=500, content={"detail": "Failed to complete care task"})
    except Exception as e:
        logger.error(f"Error completing care task {task_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error completing care task: {str(e)}"}
        )


# Care Task Schedule endpoints
@router.post("/add/care-task-schedule/{care_task_id}")
async def api_add_care_task_schedule(
    care_task_id: int, 
    data: CareTaskScheduleCreate, 
    db: Session = Depends(get_db)
):
    """Add a schedule to a care task"""
    try:
        # Validate cron expression first
        is_valid, error_msg = validate_cron_expression(data.cron_expression)
        if not is_valid:
            return JSONResponse(status_code=400, content={"detail": f"Invalid cron expression: {error_msg}"})
        
        # If patient_id not provided, get current patient
        patient_id = data.patient_id
        if patient_id is None:
            current_patient = get_current_patient(db)
            patient_id = current_patient.id if current_patient else None
        
        schedule_id = add_care_task_schedule(
            db=db,
            care_task_id=care_task_id,
            cron_expression=data.cron_expression,
            description=data.description,
            active=data.active,
            notes=data.notes,
            patient_id=patient_id
        )
        if schedule_id:
            return {"id": schedule_id, "status": "success"}
        else:
            return JSONResponse(status_code=500, content={"detail": "Failed to create care task schedule"})
    except Exception as e:
        logger.error(f"Error adding care task schedule: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error adding care task schedule: {str(e)}"}
        )


@router.get("/care-tasks/{care_task_id}/schedules")
async def get_care_task_schedules_endpoint(care_task_id: int, patient_id: int = None, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get all schedules for a specific care task"""
    try:
        # If no patient_id provided, use current patient
        if patient_id is None:
            current_patient = get_current_patient(db)
            patient_id = current_patient.id if current_patient else None
        
        schedules = get_care_task_schedules(db, care_task_id, patient_id=patient_id)
        return {"schedules": schedules}
    except Exception as e:
        logger.error(f"Error fetching care task schedules for task {care_task_id}: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/care-task-schedules")
async def get_all_care_task_schedules_endpoint(active_only: bool = True, patient_id: int = None, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get all care task schedules, optionally filtered by patient"""
    try:
        schedules = get_all_care_task_schedules(db, active_only, patient_id)
        return {"schedules": schedules}
    except Exception as e:
        logger.error(f"Error getting all care task schedules: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving care task schedules: {str(e)}"}
        )


@router.get("/care-task-schedules/daily")
async def get_daily_care_task_schedule_endpoint(patient_id: int = None, db: Session = Depends(get_db)):
    """Get daily care task schedule"""
    try:
        # If no patient_id provided, use current patient
        if patient_id is None:
            current_patient = get_current_patient(db)
            patient_id = current_patient.id if current_patient else None
        
        schedule = get_daily_care_task_schedule(db, patient_id=patient_id)
        return schedule
    except Exception as e:
        logger.error(f"Error getting daily care task schedule: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/care-task-schedules/{schedule_id}")
async def get_care_task_schedule_endpoint(schedule_id: int, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get a specific care task schedule"""
    try:
        schedule = get_care_task_schedule(db, schedule_id)
        if schedule:
            return {"schedule": schedule}
        else:
            return JSONResponse(status_code=404, content={"detail": "Care task schedule not found"})
    except Exception as e:
        logger.error(f"Error getting care task schedule {schedule_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving care task schedule: {str(e)}"}
        )


@router.put("/care-task-schedules/{schedule_id}")
async def update_care_task_schedule_endpoint(schedule_id: int, data: CareTaskScheduleUpdate, db: Session = Depends(get_db)):
    """Update an existing care task schedule"""
    try:
        # Filter out None values
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        
        # Validate cron expression if provided
        if "cron_expression" in update_data:
            is_valid, error_msg = validate_cron_expression(update_data["cron_expression"])
            if not is_valid:
                return JSONResponse(status_code=400, content={"detail": f"Invalid cron expression: {error_msg}"})
        
        success = update_care_task_schedule(db, schedule_id, **update_data)
        if success:
            return {"status": "success"}
        else:
            return JSONResponse(status_code=404, content={"detail": "Care task schedule not found"})
    except Exception as e:
        logger.error(f"Error updating care task schedule {schedule_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error updating care task schedule: {str(e)}"}
        )


@router.delete("/care-task-schedules/{schedule_id}")
async def delete_care_task_schedule_endpoint(schedule_id: int, db: Session = Depends(get_db)):
    """Delete a care task schedule"""
    try:
        success = delete_care_task_schedule(db, schedule_id)
        if success:
            return {"status": "success"}
        else:
            return JSONResponse(status_code=404, content={"detail": "Care task schedule not found"})
    except Exception as e:
        logger.error(f"Error deleting care task schedule {schedule_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error deleting care task schedule: {str(e)}"}
        )


@router.post("/care-task-schedules/{schedule_id}/toggle-active")
async def toggle_care_task_schedule_active_endpoint(schedule_id: int, db: Session = Depends(get_db)):
    """Toggle active status of a care task schedule"""
    try:
        success, new_active_status = toggle_care_task_schedule_active(db, schedule_id)
        if success:
            return {"status": "success", "active": new_active_status}
        else:
            return JSONResponse(status_code=404, content={"detail": "Care task schedule not found"})
    except Exception as e:
        logger.error(f"Error toggling care task schedule {schedule_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error toggling care task schedule status: {str(e)}"}
        )


@router.post("/care-task-schedule/{schedule_id}/complete")
async def complete_care_task_schedule_endpoint(schedule_id: int, data: CareTaskScheduleComplete, db: Session = Depends(get_db)):
    """Complete a scheduled care task"""
    try:
        # Get the schedule to find the care task ID
        schedule = get_care_task_schedule(db, schedule_id)
        if not schedule:
            return JSONResponse(status_code=404, content={"detail": "Care task schedule not found"})
        
        # Get the care task details to check if it's nutrition-related
        from crud.care_tasks import get_care_task
        care_task = get_care_task(db, schedule['care_task_id'])
        
        log_id = complete_care_task(
            db=db,
            task_id=schedule['care_task_id'],
            schedule_id=schedule_id,
            scheduled_time=data.scheduled_time,
            notes=data.notes,
            status="completed",
            completed_by=data.completed_by
        )
        
        if log_id:
            # Check if this is a nutrition-related task
            is_nutrition_task = False
            nutrition_data = None
            
            if care_task and care_task.get('category_name'):
                nutrition_keywords = ['nutrition', 'feeding', 'meal', 'food', 'drink', 'supplement']
                is_nutrition_task = any(keyword in care_task['category_name'].lower() for keyword in nutrition_keywords)
            
            # Extract nutrition data from schedule notes if available
            if is_nutrition_task and schedule.get('notes'):
                try:
                    import json
                    notes_data = json.loads(schedule['notes'])
                    if 'nutrition' in notes_data:
                        nutrition_data = notes_data['nutrition']
                except (json.JSONDecodeError, KeyError):
                    # If notes aren't JSON or don't contain nutrition data, that's ok
                    pass
            
            response_data = {
                "id": log_id, 
                "status": "success",
                "care_task": {
                    "id": care_task['id'],
                    "name": care_task['name'],
                    "category": care_task.get('category_name'),
                    "is_nutrition_related": is_nutrition_task
                } if care_task else None,
                "requires_nutrition_tracking": is_nutrition_task,
                "nutrition_data": nutrition_data  # Include prefill data
            }
            return response_data
        else:
            return JSONResponse(status_code=500, content={"detail": "Failed to complete care task"})
    except Exception as e:
        logger.error(f"Error completing care task schedule {schedule_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error completing care task: {str(e)}"}
        )


@router.post("/care-task-schedule/{schedule_id}/skip")
async def skip_care_task_schedule_endpoint(schedule_id: int, data: CareTaskScheduleComplete, db: Session = Depends(get_db)):
    """Skip a scheduled care task"""
    try:
        # Get the schedule to find the care task ID
        schedule = get_care_task_schedule(db, schedule_id)
        if not schedule:
            return JSONResponse(status_code=404, content={"detail": "Care task schedule not found"})
        
        log_id = complete_care_task(
            db=db,
            task_id=schedule['care_task_id'],
            schedule_id=schedule_id,
            scheduled_time=data.scheduled_time,
            notes=data.notes or "Task skipped",
            status="skipped",
            completed_by=data.completed_by
        )
        if log_id:
            return {"id": log_id, "status": "success"}
        else:
            return JSONResponse(status_code=500, content={"detail": "Failed to skip care task"})
    except Exception as e:
        logger.error(f"Error skipping care task schedule {schedule_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error skipping care task: {str(e)}"}
        )


# Admin Care Task endpoints
@router.get("/admin/care-tasks/active")
async def get_admin_active_care_tasks_endpoint(patient_id: int = None, db: Session = Depends(get_db)):
    """Get active care tasks for admin view - can filter by patient_id or show all"""
    try:
        if patient_id:
            # Get care tasks for specific patient + global care tasks
            tasks = get_care_tasks(db, active_only=True, patient_id=patient_id)
        else:
            # Get all active care tasks (admin overview) - pass None to get all
            tasks = get_care_tasks(db, active_only=True, patient_id=-1)  # Use -1 to indicate "show all"
        
        return {"care_tasks": tasks}
    except Exception as e:
        logger.error(f"Error fetching admin active care tasks: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/admin/care-tasks/inactive")
async def get_admin_inactive_care_tasks_endpoint(patient_id: int = None, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get inactive care tasks for admin view - can filter by patient_id or show all"""
    try:
        if patient_id:
            # Get inactive care tasks for specific patient + global care tasks
            tasks = get_care_tasks(db, active_only=False, inactive_only=True, patient_id=patient_id)
        else:
            # Get all inactive care tasks (admin overview) - pass None to get all
            tasks = get_care_tasks(db, active_only=False, inactive_only=True, patient_id=-1)  # Use -1 to indicate "show all"
        
        return {"care_tasks": tasks}
    except Exception as e:
        logger.error(f"Error fetching admin inactive care tasks: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


# Care Task Category endpoints
@router.post("/add/care-task-category")
async def api_add_care_task_category(data: CareTaskCategoryCreate, db: Session = Depends(get_db)):
    """Add a new care task category"""
    try:
        category_id = add_care_task_category(
            db=db,
            name=data.name,
            description=data.description,
            color=data.color
        )
        if category_id:
            return {"id": category_id, "status": "success"}
        else:
            return JSONResponse(status_code=500, content={"detail": "Failed to create care task category"})
    except Exception as e:
        logger.error(f"Error adding care task category: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error adding care task category: {str(e)}"}
        )


@router.get("/care-task-categories")
async def get_care_task_categories_endpoint(db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get all care task categories"""
    try:
        categories = get_care_task_categories(db)
        return {"categories": categories}
    except Exception as e:
        logger.error(f"Error getting care task categories: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving care task categories: {str(e)}"}
        )


@router.put("/care-task-categories/{category_id}")
async def update_care_task_category_endpoint(category_id: int, data: CareTaskCategoryUpdate, db: Session = Depends(get_db)):
    """Update an existing care task category"""
    try:
        # Filter out None values
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        success = update_care_task_category(db, category_id, **update_data)
        if success:
            return {"status": "success"}
        else:
            return JSONResponse(status_code=404, content={"detail": "Care task category not found"})
    except Exception as e:
        logger.error(f"Error updating care task category {category_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error updating care task category: {str(e)}"}
        )


@router.delete("/care-task-categories/{category_id}")
async def delete_care_task_category_endpoint(category_id: int, db: Session = Depends(get_db)):
    """Delete a care task category (only if not default and no tasks assigned)"""
    try:
        success = delete_care_task_category(db, category_id)
        if success:
            return {"status": "success"}
        else:
            return JSONResponse(status_code=400, content={"detail": "Cannot delete default category or category with assigned tasks"})
    except Exception as e:
        logger.error(f"Error deleting care task category {category_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error deleting care task category: {str(e)}"}
        )


# History and stats endpoints - MUST be before /care-tasks/{task_id} to avoid route conflicts
@router.get("/care-tasks/history")
async def get_care_task_history_endpoint(
    patient_id: int = None,
    task_id: int = None,
    task_name: str = None,
    category_id: int = None,
    status_filter: str = None,
    limit: int = 50,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """
    Get care task completion history with filtering options
    
    Query parameters:
    - patient_id: Filter by patient ID
    - task_id: Filter by specific task ID
    - task_name: Filter by task name (partial match)
    - category_id: Filter by category ID
    - status_filter: Filter by status ('completed', 'skipped')
    - limit: Maximum number of records (default 50)
    - start_date: Filter by start date (YYYY-MM-DD format)
    - end_date: Filter by end date (YYYY-MM-DD format)
    """
    try:
        history = get_care_task_logs(
            db=db,
            task_id=task_id,
            limit=limit,
            start_date=start_date,
            end_date=end_date,
            patient_id=patient_id,
            task_name=task_name,
            category_id=category_id,
            status_filter=status_filter
        )
        return {"history": history, "count": len(history)}
    except Exception as e:
        logger.error(f"Error getting care task history: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving care task history: {str(e)}"}
        )


@router.get("/care-tasks/completions/recent")
async def get_recent_completions_endpoint(days: int = 7, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get recent care task completions"""
    try:
        completions = get_recent_care_task_completions(db, days)
        return {"completions": completions}
    except Exception as e:
        logger.error(f"Error getting recent care task completions: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving recent completions: {str(e)}"}
        )


@router.get("/care-tasks/stats/completion")
async def get_completion_stats_endpoint(days: int = 30, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get care task completion statistics"""
    try:
        stats = get_care_task_completion_stats(db, days)
        return {"stats": stats}
    except Exception as e:
        logger.error(f"Error getting care task completion stats: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving completion stats: {str(e)}"}
        )


@router.get("/care-tasks/overdue")
async def get_overdue_tasks_endpoint(db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get overdue care tasks"""
    try:
        overdue_tasks = get_overdue_care_tasks(db)
        return {"overdue_tasks": overdue_tasks}
    except Exception as e:
        logger.error(f"Error getting overdue care tasks: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving overdue tasks: {str(e)}"}
        )


# Dynamic task_id endpoint - MUST be after static routes like /history, /completions/recent, etc.
@router.get("/care-tasks/{task_id}")
async def get_care_task_endpoint(task_id: int, db: Session = Depends(get_db)):
    """Get a specific care task by ID"""
    try:
        task = get_care_task(db, task_id)
        if task:
            return {"care_task": task}
        else:
            return JSONResponse(status_code=404, content={"detail": "Care task not found"})
    except Exception as e:
        logger.error(f"Error getting care task {task_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving care task: {str(e)}"}
        )


# Additional scheduling utility endpoints
@router.post("/care-task-schedules/validate-cron")
async def validate_cron_expression_endpoint(data: CronValidation):
    """Validate a cron expression"""
    try:
        is_valid, error_msg = validate_cron_expression(data.cron_expression)
        
        if is_valid:
            return {
                "valid": True,
                "message": "Cron expression is valid"
            }
        else:
            return {
                "valid": False,
                "error": error_msg
            }
    except Exception as e:
        logger.error(f"Error validating cron expression: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error validating cron expression: {str(e)}"}
        )


@router.get("/care-task-schedules/{schedule_id}/next-times")
async def get_next_scheduled_times_endpoint(schedule_id: int, count: int = 5, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get the next N scheduled times for a specific schedule"""
    try:
        next_times = get_next_scheduled_times(db, schedule_id, count)
        return {
            "schedule_id": schedule_id,
            "next_times": [time.isoformat() for time in next_times],
            "count": len(next_times)
        }
    except Exception as e:
        logger.error(f"Error getting next scheduled times for schedule {schedule_id}: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error getting next scheduled times: {str(e)}"}
        )
