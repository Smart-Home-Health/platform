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
"""Match administration logs to scheduled medication occurrences for both boards and grace periods."""
from datetime import datetime, timedelta

from croniter import croniter
from sqlalchemy import TIMESTAMP, cast

from schemas.medication_log import MedicationLog
from utils.datetime_utils import make_utc

LOG_MATCH_WINDOW = timedelta(hours=4)


def nearest_logged_firing(cron_expression, administered_at):
    """Resolve a legacy scheduled log with no due timestamp to at most one firing."""
    at = make_utc(administered_at)
    before = croniter(cron_expression, at + timedelta(seconds=1)).get_prev(datetime)
    after = croniter(cron_expression, at).get_next(datetime)
    nearest = min((before, after), key=lambda firing: abs(firing - at))
    return nearest if abs(nearest - at) <= LOG_MATCH_WINDOW else None


def medication_logs_for_window(db, schedules, patient_id, start, end):
    """Group candidate logs by schedule for a half-open UTC occurrence window."""
    if not schedules:
        return {}
    # Migration 001 stores naive UTC. Older medication-board writes could
    # store the database session's local clock instead. Fetch that alternative
    # only as a candidate; it must pass the checks below to receive credit.
    stored = MedicationLog.scheduled_time
    as_db_local = cast(stored, TIMESTAMP(timezone=True))
    logs = db.query(MedicationLog, as_db_local).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.schedule_id.in_([s.id for s in schedules]),
        ((stored >= start.replace(tzinfo=None)) & (stored < end.replace(tzinfo=None)))
        | ((as_db_local >= start) & (as_db_local < end))
        | (stored.is_(None) & (MedicationLog.administered_at >= start - LOG_MATCH_WINDOW)
           & (MedicationLog.administered_at < end + LOG_MATCH_WINDOW)),
    ).order_by(MedicationLog.id)
    by_schedule = {}
    for log, local_candidate in logs:
        by_schedule.setdefault(log.schedule_id, []).append((log, local_candidate))
    return by_schedule


def _legacy_board_firing(schedule, log, stored, local_candidate):
    """Recover a local-clock board entry only when its firing is unambiguous."""
    candidate = make_utc(local_candidate)
    if (candidate == stored or not log.is_scheduled or schedule.updated_at > log.created_at
            or local_candidate.replace(tzinfo=None) != stored.replace(tzinfo=None)):
        return None
    # Take Now saved the same instant in both fields. Skip saved the scheduled
    # instant as the actual time. Other workflows cannot establish this origin.
    skipped = log.dose_amount == 0 and log.notes == 'Skipped'
    taken = log.dose_amount > 0 and log.notes == '' and log.created_at == log.administered_at
    if not (taken or skipped) or stored.second or stored.microsecond:
        return None
    cron = schedule.cron_expression
    if croniter.match(cron, stored) or not croniter.match(cron, candidate):
        return None
    actual = make_utc(log.administered_at)
    if skipped:
        return candidate if candidate == actual else None

    # The original session timezone wasn't saved. Across all possible UTC
    # offsets, only credit the candidate if no other firing fits the recorded
    # early/late flags. A valid explicit UTC key always takes precedence.
    window_start = stored - timedelta(hours=14)
    window_end = stored + timedelta(hours=12)
    matches = []
    for firing in croniter(cron, window_start - timedelta(minutes=1)).all_next(datetime):
        if firing > window_end:
            break
        delay = actual - firing
        if ((delay < -timedelta(minutes=15)) == log.administered_early
                and (delay > timedelta(minutes=15)) == log.administered_late):
            matches.append(firing)
            if len(matches) > 1:
                return None
    return candidate if matches == [candidate] else None


def medication_logs_by_firing(schedule, logs):
    """Map each log to one UTC occurrence, preferring explicit UTC keys."""
    exact = {}
    fallback = {}
    for log, local_candidate in logs:
        if log.medication_id != schedule.medication_id:
            continue
        if log.scheduled_time is None:
            firing = nearest_logged_firing(schedule.cron_expression, log.administered_at)
        else:
            stored = make_utc(log.scheduled_time)
            firing = _legacy_board_firing(schedule, log, stored, local_candidate)
            if firing is None:
                exact[stored.replace(second=0, microsecond=0)] = log
                continue
        if firing is not None:
            fallback.setdefault(firing, log)
    return {**fallback, **exact}
