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
"""Caregiver-selected reminders for a single, stable schedule occurrence."""
from datetime import datetime, time, timedelta
from typing import Literal

from croniter import croniter, CroniterBadCronError, CroniterBadDateError
from fastapi import HTTPException
from pydantic import AwareDatetime, BaseModel, PositiveInt

from crud.dose_grace import grace_hours_for
from crud.schedule_manager import lock_patient, read_settings
from schemas.care_task_schedule import CareTaskSchedule
from schemas.medication_schedule import MedicationSchedule
from schemas.nutrition_schedule import NutritionSchedule
from schemas.schedule_reminder import ScheduleReminder
from utils.datetime_utils import make_utc, resolve_tz_for_patient, utc_now


Category = Literal['medications', 'care_tasks', 'nutrition']


class Occurrence(BaseModel):
    patient_id: PositiveInt
    schedule_id: PositiveInt
    scheduled_time: AwareDatetime


class ReminderChange(Occurrence):
    remind_at: AwareDatetime
    confirm_next_at: AwareDatetime | None = None


def reminder_deadline(row, scheduled_at, original_due_at, tz, category):
    """The allowed window is anchored to the original due time, never the selected reminder."""
    minutes = row.get('reminder_window_minutes')
    if minutes is not None:
        return original_due_at + timedelta(minutes=minutes)
    if category == 'medications':
        following = croniter(row['cron_expression'], scheduled_at).get_next(datetime)
        hours = grace_hours_for(row.get('grace_period_hours'), scheduled_at, following)
        return original_due_at + timedelta(hours=hours)
    end_day = original_due_at.astimezone(tz).date() + timedelta(days=2)
    return make_utc(datetime.combine(end_day, time.min, tz))


def _scheduled_rows(db, category, patient_id, day, tz, now):
    from crud.scheduling import get_scheduled_medications, get_scheduled_care_tasks, get_scheduled_nutrition

    if category == 'nutrition':
        return get_scheduled_nutrition(db, day, patient_id, tz=tz, as_of=now, strict=True)
    load = get_scheduled_medications if category == 'medications' else get_scheduled_care_tasks
    return load(db, day, patient_id, tz=tz, strict=True)


def _feed_identity(schedule, managed_ids):
    # The library identity survives renaming a routine. A flush is a separate
    # follow-up and does not determine which feed the routine supplies.
    formula = {c.item_id for c in schedule.components if not c.is_flush and c.item and c.item.item_type == 'tube_feed'}
    contents = formula or {c.item_id for c in schedule.components if not c.is_flush}
    if contents:
        return ('ingredients', frozenset(contents))
    if schedule.default_item_name and schedule.default_item_name.strip():
        return ('item', schedule.schedule_type, schedule.default_item_name.strip().casefold())
    if schedule.id in managed_ids:
        return ('managed feeds',)
    return ('routine', schedule.schedule_type, schedule.name.strip().casefold())


def _related_schedules(db, category, schedule, patient_id):
    if category == 'nutrition':
        settings = read_settings(db, patient_id)
        managed_ids = settings.feed_schedule_ids if settings.feeds_enabled else ()
        identity = _feed_identity(schedule, managed_ids)
        candidates = db.query(NutritionSchedule).filter_by(patient_id=patient_id, is_active=True)
        return [s for s in candidates if _feed_identity(s, managed_ids) == identity]
    if category == 'medications':
        model = MedicationSchedule
        candidates = db.query(model).filter_by(medication_id=schedule.medication_id, active=True)
    else:
        model = CareTaskSchedule
        candidates = db.query(model).filter_by(care_task_id=schedule.care_task_id, active=True)
    return candidates.filter((model.patient_id == patient_id) | model.patient_id.is_(None)).all()


def _next_due(db, category, schedule, patient_id, slot, target, tz, now):
    candidates = []
    for other in _related_schedules(db, category, schedule, patient_id):
        try:
            following = make_utc(croniter(other.cron_expression, slot).get_next(datetime))
        except (CroniterBadCronError, CroniterBadDateError):
            continue
        if following > target:
            continue
        if category == 'medications' and schedule.medication.end_date:
            if following.astimezone(tz).date() > make_utc(schedule.medication.end_date).astimezone(tz).date():
                continue
        candidates.append((following, other.id))
    if category != 'nutrition':
        return min((t for t, _ in candidates), default=None)
    # A managed feed may start later than its cron slot. Use the same
    # effective start shown on the board so the confirmation names that time.
    by_day = {}
    for t, schedule_id in candidates:
        by_day.setdefault(t.astimezone(tz).date(), set()).add((t, schedule_id))
    following = []
    for day, identities in by_day.items():
        for row in _scheduled_rows(db, category, patient_id, day, tz, now):
            if row.get('row_kind') != 'schedule' or (row['scheduled_time'], row['schedule_id']) not in identities:
                continue
            effective = make_utc(row.get('effective_time') or row['scheduled_time'])
            if effective <= target and not row.get('reminder_superseded'):
                following.append(effective)
    return min(following, default=None)


def save_reminder(db, user, category, data, *, cancel=False):
    from dependencies import require_schedule_record_permission, require_writable_schedule_profile

    require_schedule_record_permission(user, category)
    require_writable_schedule_profile(db, user, data.patient_id)
    lock_patient(db, data.patient_id)
    now = utc_now()
    slot = make_utc(data.scheduled_time)
    tz = resolve_tz_for_patient(db, data.patient_id)
    model = {'medications': MedicationSchedule, 'care_tasks': CareTaskSchedule, 'nutrition': NutritionSchedule}[category]
    # Hold the schedule against concurrent edits/deletion until its decision commits.
    schedule = db.query(model).filter_by(id=data.schedule_id).with_for_update(read=True).one_or_none()
    if schedule is None:
        raise HTTPException(404, 'Scheduled occurrence not found.')
    rows = _scheduled_rows(db, category, data.patient_id, slot.astimezone(tz).date(), tz, now)
    original = next((r for r in rows if r.get('schedule_id') == data.schedule_id
                     and r['scheduled_time'] == slot and not r.get('is_prn')
                     and r.get('row_kind', 'schedule') == 'schedule'), None)
    if original is None:
        raise HTTPException(404, 'Scheduled occurrence not found.')
    if original.get('completed') or original.get('skipped') or original.get('reminder_superseded'):
        raise HTTPException(409, {'code': 'occurrence_closed'})
    key = (data.patient_id, category, data.schedule_id, slot)
    saved = db.get(ScheduleReminder, key)
    original_due = make_utc(original.get('effective_time') or slot)
    if saved:
        original_due = make_utc(saved.original_due_at)
        deadline = make_utc(saved.deadline_at)
    else:
        window = dict(reminder_window_minutes=schedule.reminder_window_minutes,
                      grace_period_hours=getattr(schedule, 'grace_period_hours', None),
                      cron_expression=schedule.cron_expression)
        deadline = reminder_deadline(window, slot, original_due, tz, category)
    if now >= deadline:
        raise HTTPException(409, {'code': 'occurrence_closed', 'deadline_at': deadline.isoformat()})
    target = None if cancel else make_utc(data.remind_at)
    if target is not None:
        if target > deadline:
            raise HTTPException(422, {'code': 'after_deadline', 'deadline_at': deadline.isoformat()})
        if target <= now:
            raise HTTPException(422, {'code': 'reminder_in_past', 'deadline_at': deadline.isoformat()})
        if target < original_due:
            raise HTTPException(422, {'code': 'before_due', 'original_due_at': original_due.isoformat(),
                                      'deadline_at': deadline.isoformat()})
        next_at = _next_due(db, category, schedule, data.patient_id, slot, target, tz, now)
        if next_at is not None and next_at != data.confirm_next_at:
            raise HTTPException(409, {'code': 'overlaps_next', 'next_at': next_at.isoformat(),
                                      'deadline_at': deadline.isoformat()})
    if saved is None and target is not None:
        saved = ScheduleReminder(patient_id=data.patient_id, category=category, schedule_id=data.schedule_id,
                                 scheduled_at=slot, original_due_at=original_due, deadline_at=deadline)
        db.add(saved)
    if saved is not None and saved.remind_at != target:
        saved.remind_at = target
        saved.notified_at = None
        saved.updated_at = now
        saved.updated_by = user.id
    db.commit()
    return {'success': True, 'remind_at': target, 'deadline_at': deadline}
