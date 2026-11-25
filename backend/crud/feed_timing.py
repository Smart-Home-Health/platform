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
"""Day-specific start times for the feeds a caregiver has chosen to manage."""
from collections import defaultdict
from datetime import datetime, time, timedelta

from crud.nutrition import known_feed_duration_minutes, schedule_components_as_intake_items
from crud.scheduling import nutrition_occurrences
from nutrition_vocab import SCHEDULE_TYPE_TO_ITEM_TYPE
from schemas.nutrition_intake import NutritionIntake
from utils.datetime_utils import local_day_range_utc, make_utc


def _duration(schedule, components, logs):
    if logs:
        actual = [
            {key: getattr(log, key) for key in
             ('amount', 'amount_unit', 'duration_minutes', 'rate_ml_per_hr')}
            for log in logs
        ]
        duration = known_feed_duration_minutes(actual, schedule)
        if duration is not None:
            return duration
    return known_feed_duration_minutes(components, schedule) or 0


def _target_for(original, target, tz):
    """Choose the local clock occurrence belonging to this overnight start.

    A target just after midnight belongs to the evening whose recurring
    overnight start is just before midnight, and vice versa.
    """
    day = original.astimezone(tz).date()
    clock = time.fromisoformat(target)
    candidates = [make_utc(datetime.combine(day + timedelta(days=delta), clock, tz))
                  for delta in (-1, 0, 1)]
    return min(candidates, key=lambda instant: abs(instant - original))


def _reservation(start, duration, name, gap):
    end = start + timedelta(minutes=max(gap, duration))
    reason = (f"Allows {name} to finish its {duration:g}-minute run."
              if duration > gap else f"Keeps {gap} minutes between starts after {name}.")
    return end, reason


def _plan_day(rows, schedules, logs_by_slot, settings, overrides, tz, now, reservation):
    """Apply actual starts first, then place pending starts in template order."""
    gap = settings['min_gap_minutes']
    rows.sort(key=lambda r: (r['scheduled_time'], r['schedule_id']))
    duration = {}
    for row in rows:
        slot = row['schedule_id'], row['scheduled_time']
        duration[slot] = _duration(schedules[row['schedule_id']], row['components'], logs_by_slot[slot])
        row['managed_feed'] = True
        if row['completed']:
            actual = make_utc(datetime.fromisoformat(row['completed_at']))
            row.update(effective_time=actual, timing_reason="Recorded start.")
            end = _reservation(actual, duration[slot], row['name'], gap)
            if reservation is None or end[0] > reservation[0]:
                reservation = end

    for row in rows:
        original = row['scheduled_time']
        today = now.astimezone(tz).date()
        live_day = original.astimezone(tz).date() == today
        if not row['completed']:
            effective, reason = original, "Usual start time."
            override = overrides.get((row['schedule_id'], original))
            if override:
                row['start_override_at'] = override
                if override > effective:
                    effective, reason = override, "Moved for this day."
            if reservation and reservation[0] > effective:
                effective, reason = reservation
            row.update(effective_time=effective, timing_reason=reason)
            # Avoid counting the next feed as due while the previous one is
            # still outstanding. The first overdue feed itself stays put.
            live_day = live_day or effective.astimezone(tz).date() == today
            projected = max(effective, now) if live_day else effective
            reservation = _reservation(projected, duration[row['schedule_id'], original], row['name'], gap)
        if row['schedule_id'] == settings.get('overnight_schedule_id') and settings.get('overnight_target'):
            target = _target_for(original, settings['overnight_target'], tz)
            projected = row['effective_time']
            if live_day and not row['completed']:
                projected = max(projected, now)
            row.update(overnight_target_at=target, overnight_delayed=projected > target)
    return reservation


def apply_feed_timing(db, rows, patient_id, settings, schedules, day_start, tz, now):
    """Adjust selected occurrences, preserving each one's original log key.

    Include the previous care evening so an overnight start that moves past
    midnight also reserves the pump on the following morning.
    """
    if hasattr(settings, 'model_dump'):
        settings = settings.model_dump()
    if not settings or not settings.get('feeds_enabled'):
        return
    ids = settings.get('feed_schedule_ids') or []
    selected = {s.id: s for s in schedules if s.id in ids and s.schedule_type in SCHEDULE_TYPE_TO_ITEM_TYPE}
    managed = [r for r in rows if r['row_kind'] == 'schedule' and r['schedule_id'] in selected]
    if not managed:
        return

    day = day_start.astimezone(tz).date()
    previous_start, _ = local_day_range_utc(day - timedelta(days=1), tz=tz)
    _, day_end = local_day_range_utc(day, tz=tz)
    # Flush logs share a schedule ID but have no original scheduled_time.
    query = db.query(NutritionIntake).filter(NutritionIntake.patient_id == patient_id,
                                            NutritionIntake.schedule_id.in_(selected),
                                            NutritionIntake.voided_at.is_(None))
    logs = defaultdict(list)
    for log in query.filter(NutritionIntake.scheduled_time >= previous_start,
                            NutritionIntake.scheduled_time < day_end).order_by(NutritionIntake.id):
        slot = make_utc(log.scheduled_time).replace(second=0, microsecond=0)
        logs[log.schedule_id, slot].append(log)

    reservation = None
    prior = query.filter(NutritionIntake.scheduled_time < previous_start).order_by(
        NutritionIntake.consumed_at.desc(), NutritionIntake.id.desc()).first()
    if prior:
        schedule = selected[prior.schedule_id]
        prior_logs = query.filter_by(schedule_id=schedule.id, scheduled_time=prior.scheduled_time).all()
        duration = _duration(schedule, schedule_components_as_intake_items(schedule), prior_logs)
        reservation = _reservation(make_utc(prior.consumed_at), duration, schedule.name, settings['min_gap_minutes'])

    previous = []
    # Once a feed on the new care day actually starts, earlier outstanding
    # entries are history. Only recorded previous-day runs still occupy the
    # pump. Before that, an outstanding overnight can still bridge midnight.
    new_day_started = any(r['completed'] and make_utc(datetime.fromisoformat(r['completed_at'])) <= now
                          for r in managed)
    for schedule in selected.values():
        components = schedule_components_as_intake_items(schedule)
        for instant in nutrition_occurrences(schedule, previous_start, day_start):
            entries = logs[schedule.id, instant]
            if new_day_started and not entries:
                continue
            previous.append(dict(schedule_id=schedule.id, name=schedule.name, components=components,
                                 scheduled_time=instant, completed=bool(entries),
                                 completed_at=entries[-1].consumed_at.isoformat() if entries else None))
    from crud.feed_start_overrides import get_start_overrides
    previous_overrides = get_start_overrides(db, patient_id, previous_start, [r['scheduled_time'] for r in previous])
    reservation = _plan_day(previous, selected, logs, settings, previous_overrides, tz, now, reservation)
    overrides = get_start_overrides(db, patient_id, day_start, [r['scheduled_time'] for r in managed])
    _plan_day(managed, selected, logs, settings, overrides, tz, now, reservation)
    if day < now.astimezone(tz).date():
        newer_actual = query.filter(NutritionIntake.scheduled_time >= day_end,
                                    NutritionIntake.consumed_at <= now).first()
        if newer_actual:
            for row in managed:
                if not row['completed']:
                    row['reminder_superseded'] = True
