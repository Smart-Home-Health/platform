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
"""Change when a single occurrence next reminds its caregivers."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from crud.schedule_reminders import Category, Occurrence, ReminderChange, save_reminder
from db import get_db
from dependencies import get_current_user, require_read_access, schedule_profile_level
from event_publisher import publish_due_counts_changed
from schemas.patient import AccessLevel, Patient

router = APIRouter(prefix='/api/schedule', tags=['schedule'])


class ReminderDefaults(BaseModel):
    reminder_window_minutes: int | None = Field(..., gt=0, le=2147483647)


@router.put('/reminders/{category}')
def set_occurrence_reminder(category: Category, data: ReminderChange, db: Session = Depends(get_db), user=Depends(get_current_user)):
    result = save_reminder(db, user, category, data)
    publish_due_counts_changed(category, data.patient_id)
    return result


@router.delete('/reminders/{category}')
def cancel_occurrence_reminder(category: Category, data: Occurrence, db: Session = Depends(get_db), user=Depends(get_current_user)):
    result = save_reminder(db, user, category, data, cancel=True)
    publish_due_counts_changed(category, data.patient_id)
    return result


@router.get('/reminder-defaults/{patient_id}', dependencies=[Depends(require_read_access)])
def get_reminder_default(patient_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    level = schedule_profile_level(db, user, patient_id)
    return {'reminder_window_minutes': db.get(Patient, patient_id).reminder_window_minutes,
            'can_edit': level in (AccessLevel.ADMIN, AccessLevel.OWNER)}


@router.put('/reminder-defaults/{patient_id}', dependencies=[Depends(require_read_access)])
def set_reminder_default(patient_id: int, data: ReminderDefaults, db: Session = Depends(get_db), user=Depends(get_current_user)):
    level = schedule_profile_level(db, user, patient_id)
    if level not in (AccessLevel.ADMIN, AccessLevel.OWNER):
        raise HTTPException(403, 'Care profile administration permission required.')
    db.get(Patient, patient_id).reminder_window_minutes = data.reminder_window_minutes
    db.commit()
    return {'reminder_window_minutes': data.reminder_window_minutes, 'can_edit': True}
