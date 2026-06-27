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
