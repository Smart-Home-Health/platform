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
"""Convert time-series tables to TimescaleDB hypertables

Revision ID: 032_create_hypertables
Revises: 031_ts_composite_pk
Create Date: 2026-06-15

migrate_data => true moves any existing rows into chunks in place. The composite
PKs from migration 031 already include the partition column, which is required
for create_hypertable() to accept the existing unique constraints.

Non-unique secondary indexes (e.g. ix_pulse_ox_data_patient_timestamp) are left
as-is; Timescale only partitions on time, so the per-patient composite index
still serves `WHERE patient_id = ? AND <time> BETWEEN ...`.
"""
from typing import Sequence, Union
from alembic import op


revision: str = '032_create_hypertables'
down_revision: Union[str, None] = '031_ts_composite_pk'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, time column)
_HYPERTABLES = [
    ('pulse_ox_data', 'timestamp'),
    ('vitals',        'timestamp'),
    ('vent_samples',  'recorded_at'),
]


def upgrade() -> None:
    for table, time_col in _HYPERTABLES:
        op.execute(
            f"SELECT create_hypertable('{table}', '{time_col}', "
            f"migrate_data => true, if_not_exists => true)"
        )


def downgrade() -> None:
    # One-way migration (no reverse requested): a hypertable cannot be converted
    # back to a plain table without a full table rebuild.
    pass
