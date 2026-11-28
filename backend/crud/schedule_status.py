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
"""Outstanding care occurrences for schedule reminders, with one clock per snapshot."""
from datetime import datetime, timedelta

from crud.reminder_timeline import timeline_rows
from crud.patients import get_active_patient, patient_account_scope
from schemas.schedule_reminder import ScheduleReminder
from schemas.equipment import Equipment
from schemas.patient import Patient
from utils.datetime_utils import get_account_tz, local_day_bounds, make_utc, utc_now


# Section id, combined-state key prefix, display category.
SCHEDULE_BADGES = {
    'meds_counts': ('meds', 'Medication'),
    'nutrition_counts': ('nutrition', 'Nutrition'),
    'care_task_counts': ('care_tasks', 'Care task'),
    'equipment_counts': ('equipment', 'Equipment'),
}


def schedule_badge_counts(snapshot, sections):
    """The timed due-now badges include the hour ahead. Equipment uses whole days."""
    counts = {}
    for section in sections:
        prefix, category = SCHEDULE_BADGES[section]
        due = snapshot['due_now']
        if category != 'Equipment':
            due = due + [item for item in snapshot['upcoming'] if not item.get('managed_feed')]
        counts[f'{prefix}_due_now'] = sum(i['category'] == category for i in due)
        counts[f'{prefix}_late'] = sum(i['category'] == category for i in snapshot['late'])
    return counts


def get_schedule_status(db, patient_id, now=None, *, sections=None, include_alerts=False, tz=None):
    """Return late, due now and upcoming items. Timed items look ahead one hour,
    replacements seven calendar days. Each open occurrence appears exactly once.
    """
    now = make_utc(now) if now is not None else utc_now()
    account = db.query(Patient.account_id).filter_by(id=patient_id, is_active=True).one_or_none()
    if account is None:
        return {'generated_at': now.isoformat(), 'late_count': 0, 'due_now': [], 'upcoming': [], 'late': []}
    account_id, = account
    tz = tz or get_account_tz(db, account_id)
    bounds = local_day_bounds(tz, now)
    hour = timedelta(hours=1)
    horizon = now + hour
    days = [bounds['local_yesterday'], bounds['local_today']]
    if horizon >= bounds['today_end_utc']:
        days.append(horizon.astimezone(tz).date())

    sections = SCHEDULE_BADGES if sections is None else sections
    groups = {'late': [], 'due_now': [], 'upcoming': []}
    alerts = []
    for section, name_field, key in (
        ('meds_counts', 'medication_name', 'medications'),
        ('nutrition_counts', 'name', 'nutrition'),
        ('care_task_counts', 'care_task_name', 'care_tasks'),
    ):
        if section not in sections:
            continue
        _, category = SCHEDULE_BADGES[section]
        rows = timeline_rows(db, patient_id, key, days, tz, now, active=True, alerts=include_alerts,
                             grace_before=bounds['yesterday_start_utc'], strict=True)
        for row in rows:
            if row.get('completed') or row.get('skipped') or row.get('is_prn') or row.get('reminder_superseded'):
                continue
            if include_alerts and row.get('_reminder_alert'):
                firing = row['scheduled_time'].isoformat()
                alerts.append({'category': category, 'name': row[name_field],
                               'due_at': row['remind_at'].isoformat(), 'scheduled_time': firing,
                               'at_deadline': row['remind_at'] == row['deadline_at'],
                               'occurrence_id': f"{key}/{row['schedule_id']}/{firing}"})
            if row.get('reminder_state') in ('missed', 'snoozed'):
                continue
            due = make_utc(row.get('effective_time', row['scheduled_time']))
            if due > horizon:
                continue
            if due < now - hour:
                group = 'late'
            elif due <= now:
                group = 'due_now'
            else:
                group = 'upcoming'
            item = {'category': category, 'name': row[name_field], 'due_at': due.isoformat()}
            if row.get('managed_feed'):
                item.update(managed_feed=True, effective_time=due.isoformat(),
                            scheduled_time=row['scheduled_time'].isoformat(),
                            timing_reason=row['timing_reason'])
                if row.get('overnight_target_at'):
                    item.update(overnight_target_at=row['overnight_target_at'].isoformat(),
                                overnight_delayed=row['overnight_delayed'])
            groups[group].append(item)

    if 'equipment_counts' in sections:
        # A date-only change becomes late at the care profile's next local midnight.
        today = bounds['local_today']
        equipment = db.query(Equipment).filter(
            Equipment.scheduled_replacement.is_(True),
            Equipment.last_changed.isnot(None),
            Equipment.useful_days > 0,
            (Equipment.patient_id == patient_id) | Equipment.patient_id.is_(None),
            patient_account_scope(db, Equipment, patient_id),
        )
        for item in equipment:
            due = make_utc(item.last_changed).astimezone(tz).date() + timedelta(days=item.useful_days)
            if due > today + timedelta(days=7):
                continue
            if due < today:
                group = 'late'
            elif due == today:
                group = 'due_now'
            else:
                group = 'upcoming'
            groups[group].append({'category': 'Equipment', 'name': item.name, 'due_date': due.isoformat()})

    for items in groups.values():
        items.sort(key=lambda item: (item.get('due_at') or item['due_date'], item['category'], item['name']))
    snapshot = {'generated_at': now.isoformat(), 'late_count': len(groups['late']), **groups}
    if alerts:
        snapshot['reminder_alerts'] = sorted(alerts, key=lambda item: (item['due_at'], item['occurrence_id']))
    return snapshot



def pending_alert_records(db, patient_id, alerts):
    """Lock and recheck the chosen instants before handing them to the broker."""
    now = utc_now()
    result = []
    # A consistent lock order also permits overlapping publisher processes.
    for item in sorted(alerts, key=lambda item: item['occurrence_id']):
        category, schedule_id, firing = item['occurrence_id'].split('/', 2)
        record = db.query(ScheduleReminder).filter_by(
            patient_id=patient_id, category=category, schedule_id=int(schedule_id),
            scheduled_at=datetime.fromisoformat(firing), remind_at=datetime.fromisoformat(item['due_at']),
            notified_at=None,
        ).with_for_update().one_or_none()
        if not record or now < record.remind_at:
            continue
        if now < record.deadline_at or record.remind_at == record.deadline_at:
            result.append((record, item))
    return result


def dashboard_schedule_counts(db, patient_id, section, now, tz=None):
    """Dashboard overdue begins at the previous full hour; MQTT late is a rolling hour."""
    if patient_id is None:
        patient = get_active_patient(db)
        patient_id = patient.id if patient else None
    if patient_id is None:
        return {'due': 0, 'overdue': 0, 'due_now': 0, 'late': 0}
    snapshot = get_schedule_status(db, patient_id, now, sections=[section], tz=tz)
    rolling = schedule_badge_counts(snapshot, [section])
    prefix = SCHEDULE_BADGES[section][0]
    due_now, late = rolling[f'{prefix}_due_now'], rolling[f'{prefix}_late']
    hour_start = now.replace(minute=0, second=0, microsecond=0)
    overdue = sum(datetime.fromisoformat(item['due_at']) < hour_start
                  for item in snapshot['late'] + snapshot['due_now'])
    return {'due': due_now + late, 'overdue': overdue, 'due_now': due_now, 'late': late}
