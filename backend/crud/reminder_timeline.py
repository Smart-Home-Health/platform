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
"""Join original schedule firings with patient-specific reminder times."""
from datetime import datetime, timedelta

from croniter import CroniterBadCronError, CroniterBadDateError, croniter
from sqlalchemy import and_, or_, tuple_

from crud.dose_grace import MAX_LOOKBACK, find_grace_period_doses, merge_grace_rows
from crud.patients import patient_account_scope
from crud.schedule_reminders import reminder_deadline
from crud.scheduling import get_scheduled_care_tasks, get_scheduled_medications, get_scheduled_nutrition, nutrition_occurrences
from schemas.care_task import CareTask
from schemas.care_task_schedule import CareTaskSchedule
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.nutrition_schedule import NutritionSchedule
from schemas.schedule_reminder import ScheduleReminder
from utils.datetime_utils import local_day_range_utc, make_utc


LOADERS = {
    'medications': get_scheduled_medications,
    'nutrition': get_scheduled_nutrition,
    'care_tasks': get_scheduled_care_tasks,
}


def _older_window_firings(db, patient_id, category, now, before):
    """An explicitly extended window can cross several midnights without a snooze."""
    if category == 'nutrition':
        model = NutritionSchedule
        query = db.query(model).filter_by(patient_id=patient_id, is_active=True)
    else:
        model, owner = ((MedicationSchedule, Medication) if category == 'medications' else
                        (CareTaskSchedule, CareTask))
        query = db.query(model).join(owner).filter(
            model.active.is_(True), owner.active.is_(True),
            or_(model.patient_id == patient_id, model.patient_id.is_(None)),
            or_(owner.patient_id == patient_id, owner.patient_id.is_(None)),
            patient_account_scope(db, owner, patient_id))
    if category != 'medications':
        query = query.filter(model.reminder_window_minutes.isnot(None))
    for schedule in query:
        if schedule.reminder_window_minutes is None:
            # The legacy grace walk covers 35 days. For a rare cadence (e.g.
            # annually) only its latest firing can be within automatic grace.
            try:
                slot = make_utc(croniter(schedule.cron_expression, now + timedelta(microseconds=1)).get_prev(datetime))
                if slot >= before or slot >= now - MAX_LOOKBACK or slot < make_utc(schedule.created_at):
                    continue
                settings = {'grace_period_hours': schedule.grace_period_hours,
                            'cron_expression': schedule.cron_expression}
                if now < reminder_deadline(settings, slot, slot, None, 'medications'):
                    yield schedule.id, slot
            except (CroniterBadCronError, CroniterBadDateError):
                continue
            continue
        # Limit the walk to real firings while the schedule existed. Clamping
        # before subtraction also handles very large caller-defined windows.
        age = max(now - make_utc(schedule.created_at), timedelta())
        start = now - min(timedelta(minutes=schedule.reminder_window_minutes), age)
        if start >= before:
            continue
        for scheduled_at in nutrition_occurrences(schedule, start, before):
            yield schedule.id, scheduled_at


def _decorate(row, category, override, tz, now):
    if row.get('is_prn') or not row.get('schedule_id') or row.get('row_kind', 'schedule') != 'schedule':
        return
    firing = make_utc(row['scheduled_time'])
    due = make_utc(row.get('effective_time') or firing)
    deadline = make_utc(override.deadline_at) if override else reminder_deadline(row, firing, due, tz, category)
    remind_at = make_utc(override.remind_at) if override and override.remind_at else None
    if remind_at:
        due = make_utc(override.original_due_at)
    if row.get('skipped') or row.get('status') == 'skipped':
        state = 'skipped'
    elif row.get('completed'):
        state = 'completed'
    elif row.get('reminder_superseded') or now >= deadline:
        state = 'missed'
    elif remind_at and now < remind_at:
        state = 'snoozed'
    elif now < (remind_at or due):
        state = 'pending'
    else:
        state = 'due'
    row.update(original_due_at=due, deadline_at=deadline, remind_at=remind_at,
               effective_time=remind_at or due, reminder_state=state,
               can_remind_later=state in ('snoozed', 'pending', 'due'))
    if remind_at and not override.notified_at and remind_at <= now:
        row['_reminder_alert'] = state == 'due' or (state == 'missed' and remind_at == deadline
                                                     and not row.get('reminder_superseded'))


def reminder_fields(row):
    """JSON fields shared by the three daily schedule row shapes."""
    if 'reminder_state' not in row:
        return {}
    result = {key: row[key].isoformat() if row[key] is not None else None
              for key in ('original_due_at', 'deadline_at', 'remind_at', 'effective_time')}
    result.update(reminder_state=row['reminder_state'], can_remind_later=row['can_remind_later'])
    return result


def timeline_rows(db, patient_id, category, days, tz, now, *, active=False, alerts=False,
                  grace_before=None, load=None, strict=False, tz_offset_minutes=None):
    """Load original days plus the specific firings needed at their moved time.

    A calendar view selects snoozed rows by their destination day. An active
    snapshot additionally needs open long windows and unacknowledged alerts,
    including a chosen end-of-window reminder that fell between refreshes.
    """
    start, _ = local_day_range_utc(min(days), tz=tz)
    _, end = local_day_range_utc(max(days), tz=tz)
    r = ScheduleReminder
    ranges = [r.scheduled_at.between(start, end), r.remind_at.between(start, end)]
    if active:
        # A cancelled reminder still pins the occurrence's original window,
        # including when its recurring schedule was subsequently shortened.
        ranges.append(and_(r.original_due_at <= now, r.deadline_at > now))
    if alerts:
        ranges.append(and_(r.remind_at == r.deadline_at, r.deadline_at <= now, r.notified_at.is_(None)))
    overrides = {(s.schedule_id, make_utc(s.scheduled_at)): s for s in db.query(r).filter(
        r.patient_id == patient_id, r.category == category, or_(*ranges))}
    window_keys = set()
    if active or (category == 'medications' and grace_before is not None):
        window_keys.update(_older_window_firings(db, patient_id, category, now, start))
    extra_keys = set(overrides) | window_keys
    days = set(days)
    source_days = days | {when.astimezone(tz).date() for _, when in extra_keys}
    loader = load or LOADERS[category]
    options = {'as_of': now} if category == 'nutrition' else {}
    rows = []
    for source_day in sorted(source_days):
        for row in loader(db, source_day, patient_id, tz=tz, tz_offset_minutes=tz_offset_minutes, strict=strict, **options):
            key = row['schedule_id'], make_utc(row['scheduled_time'])
            if source_day in days or key in extra_keys:
                rows.append(row)
    if grace_before is not None and category == 'medications':
        merge_grace_rows(rows, find_grace_period_doses(db, patient_id, before_utc=grace_before, now_utc=now, strict=strict))
    # A grace dose can have both its original firing and its *future* chosen
    # reminder outside this view. Load that override before treating it as due.
    extra = list({(row['schedule_id'], make_utc(row['scheduled_time'])) for row in rows
                  if row.get('schedule_id') and not start <= make_utc(row['scheduled_time']) < end} - overrides.keys())
    for offset in range(0, len(extra), 1000):
        records = db.query(r).filter(r.patient_id == patient_id, r.category == category,
                                     tuple_(r.schedule_id, r.scheduled_at).in_(extra[offset:offset + 1000]))
        overrides.update({(s.schedule_id, make_utc(s.scheduled_at)): s for s in records})
    result = []
    for row in rows:
        original = make_utc(row['scheduled_time'])
        override = overrides.get((row['schedule_id'], original))
        _decorate(row, category, override, tz, now)
        display_day = (row.get('remind_at') or original).astimezone(tz).date()
        if row.get('remind_at') or row.get('reminder_state') in ('missed', 'completed', 'skipped'):
            row['in_grace'] = False
        elif category == 'medications' and grace_before and original < grace_before and (row['schedule_id'], original) in window_keys:
            row.update(in_grace=True, grace_expires_at=row['deadline_at'],
                       overdue_minutes=int((now - original).total_seconds() // 60))
        if not active and display_day not in days and not row.get('in_grace'):
            continue
        row['is_yesterday'] = display_day in days and display_day < max(days)
        result.append(row)
    return result
