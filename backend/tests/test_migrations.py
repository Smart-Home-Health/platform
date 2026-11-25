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
"""Wave 6 — Alembic migration-graph integrity.

The whole stack boots with `alembic upgrade head` (compose startup, the test
conftest, CI). The realistic way that breaks is a *graph* problem introduced by
a bad merge: two heads, a duplicate/typo'd revision id, or an unresolvable
down_revision. `alembic upgrade head` then aborts with "multiple head
revisions" before the API ever starts — these checks catch that at PR time
without needing a database.

Note on a *DB* round-trip to base: migration 032 converts tables to TimescaleDB
hypertables and is intentionally a one-way migration (its downgrade is a
documented no-op — a hypertable can't be converted back without a full table
rebuild). So a strict "downgrade to base" assertion would contradict a
deliberate design choice; we assert every migration *defines* a downgrade
instead, and leave the irreversible-by-design step alone.
"""
import os

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="module")
def script_dir():
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    # Constructing the directory parses every version file and raises on a
    # duplicate revision id, so this fixture is itself a smoke check.
    return ScriptDirectory.from_config(cfg)


def test_single_head(script_dir):
    heads = script_dir.get_heads()
    assert len(heads) == 1, f"expected exactly one migration head, found {heads}"


def test_chain_walks_from_head_to_base(script_dir):
    # walk_revisions() raises if any down_revision can't be resolved (orphan/typo).
    revisions = list(script_dir.walk_revisions())
    assert revisions, "no migrations found"
    # Exactly one base (down_revision is None).
    bases = [r for r in revisions if r.down_revision is None]
    assert len(bases) == 1, f"expected exactly one base migration, found {len(bases)}"


def test_every_migration_defines_upgrade_and_downgrade(script_dir):
    missing = []
    for script in script_dir.walk_revisions():
        module = script.module
        if not callable(getattr(module, "upgrade", None)):
            missing.append((script.revision, "upgrade"))
        if not callable(getattr(module, "downgrade", None)):
            missing.append((script.revision, "downgrade"))
    assert not missing, f"migrations missing upgrade/downgrade: {missing}"


def test_revision_count_matches_version_files(script_dir):
    versions_dir = os.path.join(BACKEND_DIR, "alembic", "versions")
    file_count = len([
        f for f in os.listdir(versions_dir)
        if f.endswith(".py") and not f.startswith("__")
    ])
    walked = len(list(script_dir.walk_revisions()))
    assert walked == file_count, (
        f"{file_count} version files but the graph chains {walked} revisions — "
        "a file is likely orphaned or duplicated"
    )


def test_legacy_live_board_repair_requires_an_unambiguous_scheduled_occurrence(
    db_session, patient, script_dir, monkeypatch,
):
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import text
    from schemas.care_task import CareTask
    from schemas.care_task_log import CareTaskLog
    from schemas.care_task_schedule import CareTaskSchedule

    db_session.execute(text("SET LOCAL TIME ZONE 'America/New_York'"))
    performed = datetime(2026, 11, 25, 14, 46, tzinfo=timezone.utc)
    canonical = datetime(2026, 11, 25, 12)
    wall = datetime(2026, 11, 25, 7)
    published = performed - timedelta(days=1)
    task = CareTask(name='Respiratory care', patient_id=patient.id, active=True,
                    created_at=published, updated_at=published)
    db_session.add(task)
    db_session.flush()

    def schedule(cron='0 12 * * *', updated=None):
        row = CareTaskSchedule(care_task_id=task.id, patient_id=patient.id, cron_expression=cron,
                               active=True, created_at=published, updated_at=updated or published)
        db_session.add(row)
        db_session.flush()
        return row.id

    def record(schedule_id, timestamp=wall, **overrides):
        values = dict(care_task_id=task.id, patient_id=patient.id, schedule_id=schedule_id,
                      is_scheduled=schedule_id is not None, status='completed', scheduled_time=timestamp,
                      completed_at=performed, completed_late=True, notes='Completed via live dashboard',
                      created_at=performed)
        row = CareTaskLog(**{**values, **overrides})
        db_session.add(row)
        db_session.flush()
        return row.id

    repaired = record(schedule())
    already_utc = record(schedule(), canonical)
    collision = schedule()
    guards = [
        record(schedule('0 7,12 * * *')),  # The stored time is itself a valid occurrence.
        record(schedule('0 11,12 * * *')),  # Multiple distinct firings fit the timing flags.
        record(schedule(updated=performed + timedelta(minutes=1))),
        record(schedule(), notes='PRN care'),
        record(schedule(), completed_late=False),
        record(collision),
    ]
    record(collision, canonical)
    prn = record(None, None)
    migration = script_dir.get_revision('057_care_task_occurrence_utc').module
    monkeypatch.setattr(migration.op, 'get_bind', lambda: db_session.connection())
    migration.upgrade()
    migration.upgrade()  # Retry preserves both canonical and unresolved logs.
    db_session.expire_all()
    assert db_session.get(CareTaskLog, repaired).scheduled_time == canonical
    assert db_session.get(CareTaskLog, already_utc).scheduled_time == canonical
    assert all(db_session.get(CareTaskLog, i).scheduled_time == wall for i in guards)
    assert db_session.get(CareTaskLog, prn).scheduled_time is None
