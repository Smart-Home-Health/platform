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
from datetime import timedelta

from crud.dose_grace import find_grace_period_doses
from crud.patients import patient_account_scope
from crud.scheduling import get_scheduled_care_tasks, get_scheduled_medications, get_scheduled_nutrition
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
            due = due + snapshot['upcoming']
        counts[f'{prefix}_due_now'] = sum(i['category'] == category for i in due)
        counts[f'{prefix}_late'] = sum(i['category'] == category for i in snapshot['late'])
    return counts


def get_schedule_status(db, patient_id, now=None, *, sections=None):
    """Return late, due now and upcoming items. Timed items look ahead one hour,
    replacements seven calendar days. Each open occurrence appears exactly once.
    """
    now = make_utc(now) if now is not None else utc_now()
    account_id, = db.query(Patient.account_id).filter_by(id=patient_id, is_active=True).one()
    tz = get_account_tz(db, account_id)
    bounds = local_day_bounds(tz, now)
    hour = timedelta(hours=1)
    horizon = now + hour
    days = [bounds['local_yesterday'], bounds['local_today']]
    if horizon >= bounds['today_end_utc']:
        days.append(horizon.astimezone(tz).date())

    sections = SCHEDULE_BADGES if sections is None else sections
    groups = {'late': [], 'due_now': [], 'upcoming': []}
    for section, name_field, load in (
        ('meds_counts', 'medication_name', get_scheduled_medications),
        ('nutrition_counts', 'name', get_scheduled_nutrition),
        ('care_task_counts', 'care_task_name', get_scheduled_care_tasks),
    ):
        if section not in sections:
            continue
        _, category = SCHEDULE_BADGES[section]
        rows = []
        for day in days:
            rows.extend(load(db, day, patient_id, tz=tz, strict=True))
        if category == 'Medication':
            rows.extend(find_grace_period_doses(
                db, patient_id, before_utc=bounds['yesterday_start_utc'], now_utc=now, strict=True,
            ))
        for row in rows:
            if row.get('completed') or row.get('skipped') or row.get('is_prn'):
                continue
            due = make_utc(row['scheduled_time'])
            if due > horizon:
                continue
            if due < now - hour:
                group = 'late'
            elif due <= now:
                group = 'due_now'
            else:
                group = 'upcoming'
            groups[group].append({'category': category, 'name': row[name_field], 'due_at': due.isoformat()})

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
    return {'generated_at': now.isoformat(), 'late_count': len(groups['late']), **groups}
