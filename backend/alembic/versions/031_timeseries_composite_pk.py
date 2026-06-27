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
"""Composite PKs on time-series tables for hypertable conversion

Revision ID: 031_ts_composite_pk
Revises: 030_timescaledb_ext
Create Date: 2026-06-15

TimescaleDB requires the partition (time) column in every PK/UNIQUE constraint.
Recreate each PK as (id, <time column>). The `id` column keeps its own sequence,
so autoincrement and existing id-based filters/ordering are unaffected. No
incoming FKs reference these tables, so dropping/recreating the PK is safe.
"""
from typing import Sequence, Union
from alembic import op


revision: str = '031_ts_composite_pk'
down_revision: Union[str, None] = '030_timescaledb_ext'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, default pkey name, composite columns)
_TABLES = [
    ('pulse_ox_data', 'pulse_ox_data_pkey', ['id', 'timestamp']),
    ('vitals',        'vitals_pkey',        ['id', 'timestamp']),
    ('vent_samples',  'vent_samples_pkey',  ['id', 'recorded_at']),
]


def upgrade() -> None:
    for table, pkey, cols in _TABLES:
        op.drop_constraint(pkey, table, type_='primary')
        op.create_primary_key(pkey, table, cols)


def downgrade() -> None:
    # One-way migration (no reverse requested). Reverting would require these
    # tables not to be hypertables yet.
    pass
