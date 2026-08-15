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
"""Environmental observations hypertable

Revision ID: 036_env_observations
Revises: 035_item_missing_flag
Create Date: 2026-07-13

Normalized home-level environmental readings (weather, indoor air quality) for
the env-data platform (#46). Created as a TimescaleDB hypertable from day one:
the composite PK (id, timestamp) and the dedup unique constraint both include
the partition column, which create_hypertable() requires (see migrations
030-032 for the precedent). The extension itself was installed by 030, and the
table is new/empty, so no migrate_data is needed.

The unique constraint (source_type, source_id, metric, scope, location,
timestamp) is the idempotency backbone: ingest inserts with ON CONFLICT DO
NOTHING, so connector re-polls and repeated historical backfills are no-ops.
source_id (e.g. Open-Meteo's "lat,lon") is part of the key so changing a
connector's coordinates starts a new series rather than silently discarding
readings that overlap the old one.

Unlike 031/032 this migration has a real downgrade: dropping a hypertable is
an ordinary DROP TABLE; only converting one back to a plain table is not.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '036_env_observations'
down_revision: Union[str, None] = '035_item_missing_flag'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'environmental_observations',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('timestamp', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('metric', sa.String(length=50), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('unit', sa.String(length=20), nullable=False),
        sa.Column('scope', sa.String(length=10), nullable=False),
        sa.Column('location', sa.String(length=100), nullable=False, server_default=''),
        sa.Column('source_type', sa.String(length=50), nullable=False),
        sa.Column('source_id', sa.String(length=100), nullable=False, server_default=''),
        sa.Column('quality', sa.String(length=10), nullable=False, server_default='measured'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', 'timestamp'),
        sa.UniqueConstraint(
            'source_type', 'source_id', 'metric', 'scope', 'location', 'timestamp',
            name='uq_env_obs_source_metric_place_ts',
        ),
    )
    op.create_index('ix_environmental_observations_account_id',
                    'environmental_observations', ['account_id'])
    op.create_index('ix_env_obs_metric_time',
                    'environmental_observations', ['metric', 'timestamp'])
    op.create_index('ix_env_obs_scope_loc_time',
                    'environmental_observations', ['scope', 'location', 'timestamp'])

    op.execute(
        "SELECT create_hypertable('environmental_observations', 'timestamp', "
        "if_not_exists => true)"
    )


def downgrade() -> None:
    op.drop_table('environmental_observations')
