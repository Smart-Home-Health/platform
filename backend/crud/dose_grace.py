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
Grace-period doses.

A scheduled dose that was not given does not vanish when its day rolls over.
It stays on the schedule, actionable, until it is administered or its grace
expires; only then is it a plain "missed". The grace is per schedule row: an
explicit ``grace_period_hours`` override, or 60% of the gap between that
firing and the schedule's next one. Weekly doses therefore stay for about
four days, daily ones for about fourteen hours. Irregular cadences
(Mon/Wed/Fri) get a per-firing grace because the gap varies.

Everything here is computed on read. Nothing is written.
"""
import logging
from datetime import datetime, timedelta, timezone

from croniter import croniter
from sqlalchemy.orm import Session

from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog
from utils.datetime_utils import utc_now, make_utc

logger = logging.getLogger('crud')

GRACE_FRACTION = 0.6

# How far back a firing can be and still be considered. A monthly schedule's
# default grace is 60% of ~30 days (18 days); this cap covers that with room
# for a longer explicit override without walking cron history forever.
MAX_LOOKBACK = timedelta(days=35)

# Per-schedule safety valve on the backward cron walk (an every-hour cron
# over 35 days is 840 firings; nothing sensible for a medication goes past this).
MAX_FIRINGS_PER_SCHEDULE = 1000

# A log without an exact scheduled_time still counts as this dose when it was
# administered near the firing. Mirrors get_daily_medication_schedule.
LOG_MATCH_WINDOW = timedelta(hours=4)


def grace_hours_for(override_hours, firing_utc, next_firing_utc):
    """Hours a firing stays actionable. The explicit override wins; otherwise
    60% of the gap to the schedule's next firing after this one."""
    if override_hours is not None and override_hours > 0:
        return float(override_hours)
    gap_hours = (next_firing_utc - firing_utc).total_seconds() / 3600.0
    return GRACE_FRACTION * gap_hours


def _prev_firings(cron_expression, before_utc):
    """Yield the schedule's firings strictly before ``before_utc``, newest first,
    as aware UTC datetimes."""
    it = croniter(cron_expression, before_utc)
    for _ in range(MAX_FIRINGS_PER_SCHEDULE):
        yield make_utc(it.get_prev(datetime))


def _next_firing(cron_expression, firing_utc):
    return make_utc(croniter(cron_expression, firing_utc).get_next(datetime))


def _log_matches(logs_for_schedule, firing_utc):
    """True when one of the schedule's logs records this firing: an exact
    scheduled_time match (what the completion endpoints write), or an
    administration close enough to the firing to be it."""
    for log in logs_for_schedule:
        st = log.scheduled_time
        if st is not None and abs((make_utc(st) - firing_utc).total_seconds()) < 60:
            return True
        at = log.administered_at
        if at is not None and abs(make_utc(at) - firing_utc) <= LOG_MATCH_WINDOW:
            return True
    return False


def find_grace_period_doses(db: Session, patient_id: int, before_utc: datetime, now_utc: datetime = None):
    """Unfilled firings before ``before_utc`` that are still inside their grace.

    ``before_utc`` is the start of the earliest day the caller already shows,
    so nothing here duplicates a row the caller has. Returns rows in the shape
    of ``crud.scheduling.get_scheduled_medications`` plus:

        in_grace        True
        grace_hours     the grace applied to this firing
        grace_expires_at aware UTC datetime
        overdue_minutes minutes since the firing, as of ``now_utc``

    Rules, in order, per firing (walking backward from ``before_utc``):
      - stop at MAX_LOOKBACK, at the schedule's creation, or before the
        medication's start_date (a schedule created today has no history);
      - skip a firing that has been logged (given or skipped);
      - drop a firing whose grace has expired: it is missed, not overdue;
      - drop a firing whose next firing has already come due (auto-skip):
        with an override longer than the gap the newer dose takes precedence.
    """
    if patient_id is None:
        return []
    now_utc = make_utc(now_utc) if now_utc is not None else utc_now()
    before_utc = make_utc(before_utc)
    lookback_start = now_utc - MAX_LOOKBACK

    try:
        schedules = db.query(MedicationSchedule).filter(
            MedicationSchedule.active == True,  # noqa: E712
            (MedicationSchedule.patient_id == patient_id) | (MedicationSchedule.patient_id == None),  # noqa: E711
        ).join(Medication).filter(
            Medication.active == True,  # noqa: E712
            (Medication.patient_id == patient_id) | (Medication.patient_id == None),  # noqa: E711
        ).all()
        if not schedules:
            return []

        schedule_ids = [s.id for s in schedules]
        logs = db.query(MedicationLog).filter(
            MedicationLog.schedule_id.in_(schedule_ids),
            (MedicationLog.scheduled_time >= lookback_start)
            | (MedicationLog.administered_at >= lookback_start - LOG_MATCH_WINDOW),
        ).all()
        logs_by_schedule = {}
        for log in logs:
            logs_by_schedule.setdefault(log.schedule_id, []).append(log)

        rows = []
        for schedule in schedules:
            med = schedule.medication
            floor = lookback_start
            if schedule.created_at is not None:
                floor = max(floor, make_utc(schedule.created_at))
            if med.start_date is not None:
                floor = max(floor, make_utc(med.start_date))
            end = make_utc(med.end_date) if med.end_date is not None else None

            try:
                for firing in _prev_firings(schedule.cron_expression, before_utc):
                    if firing < floor:
                        break
                    if end is not None and firing > end:
                        continue
                    if _log_matches(logs_by_schedule.get(schedule.id, ()), firing):
                        continue
                    next_firing = _next_firing(schedule.cron_expression, firing)
                    grace_h = grace_hours_for(schedule.grace_period_hours, firing, next_firing)
                    expires = firing + timedelta(hours=grace_h)
                    if now_utc >= expires:
                        continue
                    if now_utc >= next_firing:
                        continue
                    rows.append({
                        'schedule_id': schedule.id,
                        'medication_id': schedule.medication_id,
                        'medication_name': med.name,
                        'dose_amount': schedule.dose_amount,
                        'dose_unit': med.quantity_unit,
                        'scheduled_time': firing,
                        'description': schedule.description,
                        'cron_expression': schedule.cron_expression,
                        'completed': False,
                        'skipped': False,
                        'completed_at': None,
                        'completed_by': None,
                        'log_id': None,
                        'in_grace': True,
                        'grace_hours': grace_h,
                        'grace_expires_at': expires,
                        'overdue_minutes': int((now_utc - firing).total_seconds() // 60),
                    })
            except Exception as cron_error:
                logger.error(f"Grace walk failed for schedule {schedule.id} ({schedule.cron_expression}): {cron_error}")
                continue

        rows.sort(key=lambda r: r['scheduled_time'])
        return rows
    except Exception as e:
        logger.error(f"Error finding grace-period doses for patient {patient_id}: {e}")
        return []


def merge_grace_rows(rows, grace_rows, key=None):
    """Fold grace rows into an existing day list in place.

    A grace row whose (schedule_id, scheduled_time) is already present (the
    caller shows the prior day) annotates that row; the rest are appended.
    ``key`` extracts the scheduled_time from an existing row when it is not
    stored under 'scheduled_time' as an aware datetime.
    """
    def _k(row):
        st = key(row) if key else row.get('scheduled_time')
        if isinstance(st, str):
            st = datetime.fromisoformat(st.replace('Z', '+00:00'))
        return (row.get('schedule_id'), make_utc(st).replace(microsecond=0) if st else None)

    existing = {_k(r): r for r in rows if r.get('schedule_id') is not None}
    for g in grace_rows:
        hit = existing.get(_k(g))
        if hit is not None:
            if hit.get('completed') or hit.get('is_completed'):
                continue
            hit['in_grace'] = True
            hit['grace_hours'] = g['grace_hours']
            hit['grace_expires_at'] = g['grace_expires_at']
            hit['overdue_minutes'] = g['overdue_minutes']
        else:
            rows.append(g)
    return rows
