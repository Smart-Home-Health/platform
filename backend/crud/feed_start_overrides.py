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
from datetime import timedelta

from croniter import croniter
from fastapi import HTTPException
from pydantic import AwareDatetime, BaseModel, PositiveInt

from crud.schedule_manager import eligible_schedules, lock_patient, read_settings
from schemas.feed_start_override import FeedStartOverride
from schemas.nutrition_intake import NutritionIntake
from utils.datetime_utils import make_utc, utc_now


class StartOverrideRequest(BaseModel):
    schedule_id: PositiveInt
    scheduled_time: AwareDatetime
    earliest_start: AwareDatetime | None


def get_start_overrides(db, patient_id, day_start, times):
    if not times:
        return {}
    rows = db.query(FeedStartOverride).filter(
        FeedStartOverride.patient_id == patient_id,
        FeedStartOverride.scheduled_at >= day_start,
        FeedStartOverride.scheduled_at.in_(times),
    )
    return {(row.schedule_id, make_utc(row.scheduled_at)): make_utc(row.earliest_start) for row in rows}


def save_start_override(db, patient_id, data, user_id):
    lock_patient(db, patient_id)
    settings = read_settings(db, patient_id)
    if not settings.feeds_enabled or data.schedule_id not in settings.feed_schedule_ids:
        raise HTTPException(422, 'Choose a feed managed by this care profile.')
    schedule = eligible_schedules(db, patient_id).filter_by(id=data.schedule_id).one_or_none()
    slot = make_utc(data.scheduled_time)
    if not schedule or slot.second or slot.microsecond or not croniter.match(schedule.cron_expression, slot):
        raise HTTPException(422, 'That feed occurrence is no longer on the schedule.')
    if data.earliest_start and not slot <= data.earliest_start <= slot + timedelta(days=1):
        raise HTTPException(422, 'Choose a time from the usual start through the next 24 hours.')
    if db.query(NutritionIntake.id).filter(
        NutritionIntake.patient_id == patient_id, NutritionIntake.schedule_id == schedule.id,
        NutritionIntake.scheduled_time >= slot, NutritionIntake.scheduled_time < slot + timedelta(minutes=1),
        NutritionIntake.voided_at.is_(None),
    ).first():
        raise HTTPException(409, 'This feed already has a recorded start.')
    row = db.query(FeedStartOverride).filter_by(patient_id=patient_id, schedule_id=schedule.id, scheduled_at=slot).first()
    if data.earliest_start is None:
        if row:
            db.delete(row)
    else:
        if row is None:
            row = FeedStartOverride(patient_id=patient_id, schedule_id=schedule.id, scheduled_at=slot)
            db.add(row)
        row.earliest_start = make_utc(data.earliest_start)
        row.updated_at = utc_now()
        row.updated_by = user_id
    db.commit()
