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
"""Recover unambiguous live-board schedule keys written as database local time."""
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from alembic import op
from croniter import croniter

revision = '057_care_task_occurrence_utc'
down_revision = '056_patient_event_diaries'
branch_labels = None
depends_on = None


def _unambiguous_occurrence(row):
    wall = row.scheduled_time
    candidate = row.interpreted.astimezone(timezone.utc).replace(tzinfo=None)
    if wall.second or wall.microsecond or candidate == wall:
        return None
    try:
        if croniter.match(row.cron_expression, wall) or not croniter.match(row.cron_expression, candidate):
            return None
        # The timezone used when the row was written is not recorded. Require a
        # single compatible firing across all modern UTC offsets (-12 to +14).
        # Both fall-back folds and other firings of a frequent schedule may fit.
        possible = croniter(row.cron_expression, wall - timedelta(hours=14, minutes=1))
        match = None
        while (firing := possible.get_next(datetime)) <= wall + timedelta(hours=12):
            delay = row.completed_at - firing.replace(tzinfo=timezone.utc)
            if ((delay < timedelta(minutes=-15)) != row.completed_early
                    or (delay > timedelta(minutes=15)) != row.completed_late):
                continue
            if match is not None:
                return None
            match = firing
        return candidate if match == candidate else None
    except (ValueError, OverflowError):
        return None


def upgrade():
    db = op.get_bind()
    # The default note identifies the affected writer. Custom-note, PRN,
    # voided and subsequently rescheduled records retain their original keys.
    rows = db.execute(sa.text("""
        SELECT l.id, l.patient_id, l.schedule_id, l.scheduled_time, l.completed_at,
               l.completed_early, l.completed_late, s.cron_expression,
               l.scheduled_time AT TIME ZONE current_setting('TimeZone') AS interpreted
        FROM care_task_log l
        JOIN care_task_schedule s ON s.id = l.schedule_id AND s.care_task_id = l.care_task_id
        JOIN care_task t ON t.id = l.care_task_id
        JOIN patients p ON p.id = l.patient_id
        WHERE l.is_scheduled AND l.voided_at IS NULL AND l.scheduled_time IS NOT NULL
          AND l.notes = 'Completed via live dashboard' AND l.status = 'completed'
          AND (s.patient_id IS NULL OR s.patient_id = l.patient_id)
          AND (t.patient_id IS NULL OR t.patient_id = l.patient_id)
          AND (t.account_id IS NULL OR t.account_id = p.account_id)
          AND s.updated_at <= l.created_at
          AND l.scheduled_time = (l.scheduled_time AT TIME ZONE current_setting('TimeZone'))
                                  AT TIME ZONE current_setting('TimeZone')
    """))
    for row in rows:
        candidate = _unambiguous_occurrence(row)
        if candidate is None:
            continue
        db.execute(sa.text("""
            UPDATE care_task_log SET scheduled_time = :candidate
            WHERE id = :id AND scheduled_time = :wall AND NOT EXISTS (
                SELECT 1 FROM care_task_log other
                WHERE other.id <> :id AND other.voided_at IS NULL
                  AND other.patient_id = :patient AND other.schedule_id = :schedule
                  AND other.scheduled_time IN (:wall, :candidate)
            )
        """), dict(id=row.id, patient=row.patient_id, schedule=row.schedule_id,
                   wall=row.scheduled_time, candidate=candidate))


def downgrade():
    # Older code can read canonical UTC occurrence keys too.
    pass
