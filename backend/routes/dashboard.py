"""
Dashboard routes - API for admin dashboard data
"""
import logging
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from db import get_db
from dependencies import require_read_access, get_current_user
from crud.patients import get_visible_patient_ids
from models.users import User
from schemas.patient import Patient
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog
from schemas.care_task import CareTask
from schemas.care_task_schedule import CareTaskSchedule
from schemas.care_task_log import CareTaskLog
from schemas.equipment import Equipment
from schemas.integration import Integration as IntegrationModel, PatientIntegration
from croniter import croniter

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/patient-readings")
async def get_patient_readings(_: bool = Depends(require_read_access)):
    """
    Return current per-patient sensor readings (spo2, bpm, ts) from connected readers.
    Used by care dashboard to show live readings on patient cards.
    """
    try:
        from main import get_modules
        modules = get_modules()
        ws = modules.get("websocket")
        if not ws or not hasattr(ws, "patient_readings"):
            return {}
        return {str(pid): data for pid, data in ws.patient_readings.items()}
    except Exception as e:
        logger.error(f"Error getting patient readings: {e}")
        return {}


@router.get("/summary")
async def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: bool = Depends(require_read_access),
):
    """
    Get dashboard summary data with due counts, scoped to the patients the
    current user is allowed to see (system admins see all; other users see only
    patients granted to them via PatientAccess).
    """
    try:
        today = date.today()
        now = datetime.now()

        allowed_ids = get_visible_patient_ids(db, current_user)
        if allowed_ids is not None and not allowed_ids:
            patients = []
        else:
            query = db.query(Patient).filter(Patient.is_active == True)
            if allowed_ids is not None:
                query = query.filter(Patient.id.in_(allowed_ids))
            patients = query.order_by(Patient.first_name, Patient.last_name).all()

        # One query for all Frigate-enabled patient integrations.
        frigate_rows = (
            db.query(PatientIntegration.patient_id, PatientIntegration.settings)
            .join(IntegrationModel, PatientIntegration.integration_id == IntegrationModel.id)
            .filter(
                PatientIntegration.is_enabled == True,
                IntegrationModel.slug == "frigate",
            )
            .all()
        )
        camera_by_patient = {
            pid: (settings or {}).get("camera")
            for pid, settings in frigate_rows
        }

        patient_list = []
        total_meds_due = 0
        total_tasks_due = 0
        total_equipment_due = 0

        for patient in patients:
            meds_due = get_medications_due_count(db, patient.id, today, now)
            tasks_due = get_care_tasks_due_count(db, patient.id, today, now)
            equipment_due = get_equipment_due_count(db, patient.id, today)

            total_meds_due += meds_due
            total_tasks_due += tasks_due
            total_equipment_due += equipment_due

            camera_name = camera_by_patient.get(patient.id)

            patient_list.append({
                "id": patient.id,
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "name": f"{patient.first_name} {patient.last_name}",
                "date_of_birth": patient.date_of_birth.isoformat() if patient.date_of_birth else None,
                "room": None,
                "is_active": patient.is_active,
                "status": "active",
                "has_camera": bool(camera_name),
                "camera_name": camera_name,
                "due_counts": {
                    "medications": meds_due,
                    "tasks": tasks_due,
                    "equipment": equipment_due
                }
            })

        total_patients = len(patients)
        active_patients = total_patients
        
        return {
            "patients": patient_list,
            "summary": {
                "total_patients": total_patients,
                "active_patients": active_patients,
                "medications_due": total_meds_due,
                "tasks_due": total_tasks_due,
                "equipment_due": total_equipment_due
            },
            "generated_at": now.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting dashboard summary: {e}")
        return {
            "patients": [],
            "summary": {
                "total_patients": 0,
                "active_patients": 0,
                "medications_due": 0,
                "tasks_due": 0,
                "equipment_due": 0
            },
            "error": str(e)
        }


def get_medications_due_count(db: Session, patient_id: int, target_date: date, current_time: datetime) -> int:
    """
    Count medications that are due (scheduled but not yet administered) for today.
    Only counts medications scheduled before the current time that haven't been logged.
    """
    try:
        # Get all active medication schedules for this patient
        schedules = db.query(MedicationSchedule).filter(
            MedicationSchedule.active == True,
            (MedicationSchedule.patient_id == patient_id) | (MedicationSchedule.patient_id == None)
        ).join(Medication).filter(
            Medication.active == True,
            (Medication.patient_id == patient_id) | (Medication.patient_id == None),
            (Medication.start_date == None) | (Medication.start_date <= datetime.combine(target_date, datetime.max.time())),
            (Medication.end_date == None) | (Medication.end_date >= datetime.combine(target_date, datetime.min.time()))
        ).all()
        
        # Get today's medication logs for this patient
        today_logs = db.query(MedicationLog).filter(
            MedicationLog.patient_id == patient_id,
            MedicationLog.administered_at >= datetime.combine(target_date, datetime.min.time()),
            MedicationLog.administered_at <= datetime.combine(target_date, datetime.max.time())
        ).all()
        
        # Create set of completed schedule_id + time combinations
        completed_times = set()
        for log in today_logs:
            if log.schedule_id and log.scheduled_time:
                key = f"{log.schedule_id}_{log.scheduled_time.strftime('%H:%M')}"
                completed_times.add(key)
        
        due_count = 0
        
        for schedule in schedules:
            try:
                start_of_day = datetime.combine(target_date, datetime.min.time())
                base_time = start_of_day - timedelta(days=1)
                cron = croniter(schedule.cron_expression, base_time)
                
                while True:
                    next_time = cron.get_next(datetime)
                    if next_time.date() > target_date:
                        break
                    if next_time.date() == target_date and next_time <= current_time:
                        # Check if this scheduled time was completed
                        key = f"{schedule.id}_{next_time.strftime('%H:%M')}"
                        if key not in completed_times:
                            due_count += 1
            except Exception as cron_error:
                logger.debug(f"Error processing cron for schedule {schedule.id}: {cron_error}")
                continue
        
        return due_count
        
    except Exception as e:
        logger.error(f"Error counting medications due for patient {patient_id}: {e}")
        return 0


def get_care_tasks_due_count(db: Session, patient_id: int, target_date: date, current_time: datetime) -> int:
    """
    Count care tasks that are due (scheduled but not yet completed) for today.
    Only counts tasks scheduled before the current time that haven't been logged.
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
        
        # Get today's care task logs for this patient
        today_logs = db.query(CareTaskLog).filter(
            CareTaskLog.patient_id == patient_id,
            CareTaskLog.completed_at >= datetime.combine(target_date, datetime.min.time()),
            CareTaskLog.completed_at <= datetime.combine(target_date, datetime.max.time())
        ).all()
        
        # Create set of completed schedule_id + time combinations
        completed_times = set()
        for log in today_logs:
            if log.schedule_id and log.scheduled_time:
                key = f"{log.schedule_id}_{log.scheduled_time.strftime('%H:%M')}"
                completed_times.add(key)
        
        due_count = 0
        
        for schedule in schedules:
            try:
                start_of_day = datetime.combine(target_date, datetime.min.time())
                base_time = start_of_day - timedelta(days=1)
                cron = croniter(schedule.cron_expression, base_time)
                
                while True:
                    next_time = cron.get_next(datetime)
                    if next_time.date() > target_date:
                        break
                    if next_time.date() == target_date and next_time <= current_time:
                        # Check if this scheduled time was completed
                        key = f"{schedule.id}_{next_time.strftime('%H:%M')}"
                        if key not in completed_times:
                            due_count += 1
            except Exception as cron_error:
                logger.debug(f"Error processing cron for schedule {schedule.id}: {cron_error}")
                continue
        
        return due_count
        
    except Exception as e:
        logger.error(f"Error counting care tasks due for patient {patient_id}: {e}")
        return 0


def get_equipment_due_count(db: Session, patient_id: int, target_date: date) -> int:
    """
    Count equipment items that are due for replacement (past their useful_days since last_changed).
    """
    try:
        # Get all equipment for this patient that has scheduled replacement
        equipment_items = db.query(Equipment).filter(
            (Equipment.patient_id == patient_id) | (Equipment.patient_id == None),
            Equipment.scheduled_replacement == True,
            Equipment.last_changed != None,
            Equipment.useful_days != None
        ).all()
        
        due_count = 0
        
        for item in equipment_items:
            if item.last_changed and item.useful_days:
                # Calculate when replacement is due
                due_date = item.last_changed.date() + timedelta(days=item.useful_days)
                if due_date <= target_date:
                    due_count += 1
        
        return due_count
        
    except Exception as e:
        logger.error(f"Error counting equipment due for patient {patient_id}: {e}")
        return 0
