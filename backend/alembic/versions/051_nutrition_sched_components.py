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
"""Nutrition schedule components (multi-item feed mixes)

Revision ID: 051_nutrition_sched_components
Revises: 050_avatar_seed_photo
Create Date: 2026-08-29

A scheduled feed used to carry a single default item (default_item_name /
default_amount). Feeds are now a varying mix -- formula plus several juices or
smoothies -- so a schedule gains a component list mirroring
nutrition_preset_components. Completing a feed writes one nutrition_intake row
per component sharing an event_group_id.

Existing default_* columns are NOT backfilled: they are free text with no
guaranteed nutrition_items row, and every consumer falls back to them when a
schedule has no components.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '051_nutrition_sched_components'
down_revision: Union[str, None] = '050_avatar_seed_photo'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'nutrition_schedule_components',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('schedule_id', sa.Integer(), sa.ForeignKey('nutrition_schedules.id', ondelete='CASCADE'), nullable=False),
        sa.Column('item_id', sa.Integer(), sa.ForeignKey('nutrition_items.id', ondelete='CASCADE'), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('amount_unit', sa.String(50), nullable=False),
        sa.Column('feed_route', sa.String(20), nullable=True),
        sa.Column('rate_ml_per_hr', sa.Float(), nullable=True),
        sa.Column('duration_minutes', sa.Float(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_nutrition_schedule_components_schedule_id', 'nutrition_schedule_components', ['schedule_id'])


def downgrade() -> None:
    op.drop_index('ix_nutrition_schedule_components_schedule_id', table_name='nutrition_schedule_components')
    op.drop_table('nutrition_schedule_components')
