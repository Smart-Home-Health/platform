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
Dashboard routes - API for admin dashboard data
"""
import logging
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db import get_db
from dependencies import require_read_access, get_current_user
from crud.patients import get_visible_patient_ids
from models.users import User
from schemas.patient import Patient
from schemas.equipment import Equipment
from schemas.integration import Integration as IntegrationModel, PatientIntegration
from crud.medications import get_medication_schedule_counts
from crud.scheduling import get_care_task_schedule_counts, get_nutrition_schedule_counts
from models.readers import Reader

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

        # Patients with an active SHH Reader (pulse ox) device — drives whether
        # the dashboard card shows the SpO2 vital at all.
        pulse_ox_patient_ids = {
            pid for (pid,) in db.query(Reader.patient_id)
            .filter(Reader.patient_id != None, Reader.is_active == True)
            .distinct()
            .all()
        }

        patient_list = []
        total_meds_due = 0
        total_tasks_due = 0
        total_equipment_due = 0
        total_nutrition_due = 0

        for patient in patients:
            med_counts = get_medication_schedule_counts(db, patient_id=patient.id)
            task_counts = get_care_task_schedule_counts(db, patient_id=patient.id)
            nutrition_counts = get_nutrition_schedule_counts(db, patient_id=patient.id)
            equipment_due = get_equipment_due_count(db, patient.id, today)

            meds_due = med_counts['due']
            tasks_due = task_counts['due']
            nutrition_due = nutrition_counts['due']

            total_meds_due += meds_due
            total_tasks_due += tasks_due
            total_equipment_due += equipment_due
            total_nutrition_due += nutrition_due

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
                "has_pulse_ox": patient.id in pulse_ox_patient_ids,
                "due_counts": {
                    "medications": meds_due,
                    "tasks": tasks_due,
                    "equipment": equipment_due,
                    "nutrition": nutrition_due
                },
                # Overdue (scheduled hour fully passed, not done) — drives the
                # red "urgent" treatment on the schedule-based badges.
                "overdue_counts": {
                    "medications": med_counts['overdue'],
                    "tasks": task_counts['overdue'],
                    "nutrition": nutrition_counts['overdue']
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
                "equipment_due": total_equipment_due,
                "nutrition_due": total_nutrition_due
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
                "equipment_due": 0,
                "nutrition_due": 0
            },
            "error": str(e)
        }


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
