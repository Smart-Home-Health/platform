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
"""Care-profile schedule manager settings, previews, and check history."""
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from crud import schedule_manager as manager
from crud.feed_start_overrides import StartOverrideRequest, save_start_override
from db import get_db
from dependencies import get_current_user, require_read_access
from event_publisher import publish_due_counts_changed
from schemas.patient import AccessLevel, Patient, PatientAccess
from utils.datetime_utils import utc_now

router = APIRouter(prefix='/api/schedule-manager', tags=['Schedule manager'], dependencies=[Depends(require_read_access)])


@dataclass
class ManagerAccess:
    user_id: int
    can_manage: bool
    can_record: bool


def profile_access(patient_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    patient = db.query(Patient.id).filter_by(id=patient_id, account_id=user.account_id, is_active=True).first()
    if patient is None:
        raise HTTPException(404, 'Care profile not found.')
    if user.is_superuser:
        return ManagerAccess(user.id, True, True)
    grant = db.query(PatientAccess).filter(
        PatientAccess.patient_id == patient_id, PatientAccess.user_id == user.id, PatientAccess.is_active.is_(True),
        or_(PatientAccess.expires_at.is_(None), PatientAccess.expires_at > utc_now().replace(tzinfo=None))).first()
    if grant is None:
        raise HTTPException(404, 'Care profile not found.')
    if not user.has_permission('nutrition.read'):
        raise HTTPException(403, 'Nutrition read permission required.')
    writable = grant.access_level != AccessLevel.VIEWER
    return ManagerAccess(user.id, writable and user.has_permission('nutrition.update'),
                         writable and user.has_permission('nutrition.create'))


def manager_state(db, patient_id, access):
    return dict(**manager.manager_state(db, patient_id, user_id=access.user_id, can_record=access.can_record), can_manage=access.can_manage, can_record=access.can_record)


@router.get('/{patient_id}')
def get_manager(patient_id: int, db: Session = Depends(get_db), access: ManagerAccess = Depends(profile_access)):
    return manager_state(db, patient_id, access)


@router.put('/{patient_id}')
async def update_manager(patient_id: int, settings: manager.ManagerSettings, replace_check_recipients: bool | None = None,
                         db: Session = Depends(get_db),
                         access: ManagerAccess = Depends(profile_access)):
    if not access.can_manage:
        raise HTTPException(403, 'Nutrition update permission required.')
    manager.save_settings(db, patient_id, settings, access.user_id, replace_check_recipients=replace_check_recipients)
    publish_due_counts_changed('nutrition', patient_id)
    return manager_state(db, patient_id, access)


@router.post('/{patient_id}/preview')
def preview_manager(patient_id: int, settings: manager.ManagerSettings, replace_check_recipients: bool | None = None,
                    db: Session = Depends(get_db),
                    access: ManagerAccess = Depends(profile_access)):
    if not access.can_manage:
        live = manager.read_settings(db, patient_id)
        ignore = {'check_recipient_ids'} if replace_check_recipients is False else set()
        if settings.model_dump(exclude=ignore) != live.model_dump(exclude=ignore):
            raise HTTPException(403, 'Nutrition update permission is required to preview alternative rules.')
        settings = live
        replace_check_recipients = False
    return manager.preview(db, patient_id, settings, user_id=access.user_id, can_record=access.can_record,
                           replace_check_recipients=replace_check_recipients)


@router.post('/{patient_id}/actions')
async def record_check(patient_id: int, action: manager.BathroomAction, db: Session = Depends(get_db),
                 access: ManagerAccess = Depends(profile_access)):
    if not access.can_record:
        raise HTTPException(403, 'Nutrition recording permission required.')
    manager.record_action(db, patient_id, action, access.user_id)
    if action.action in ('dry', 'changed'):
        publish_due_counts_changed('nutrition', patient_id)
    return manager_state(db, patient_id, access)


@router.put('/{patient_id}/feed-start')
async def move_feed_once(patient_id: int, data: StartOverrideRequest, db: Session = Depends(get_db),
                         access: ManagerAccess = Depends(profile_access)):
    if not access.can_manage:
        raise HTTPException(403, 'Nutrition update permission required.')
    save_start_override(db, patient_id, data, access.user_id)
    publish_due_counts_changed('nutrition', patient_id)
    return {'success': True}
