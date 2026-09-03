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
"""Dynamic water budget

Revision ID: 053_water_budget
Revises: 052_flush_followups
Create Date: 2026-08-29

Water spots stop being fixed amounts. A hydration schedule flagged
fills_fluid_goal suggests its amount at completion time from what is left
of the daily fluid target — target minus what was logged (juices included)
minus what is still expected from uncompleted feeds — split across the
remaining flagged spots proportionally to their nominal sizes. Suggestions
are computed on read, never stored; these columns only carry the flag and
the optional clamps.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '053_water_budget'
down_revision: Union[str, None] = '052_flush_followups'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('nutrition_schedules',
                  sa.Column('fills_fluid_goal', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('nutrition_schedules', sa.Column('fluid_min_ml', sa.Float(), nullable=True))
    op.add_column('nutrition_schedules', sa.Column('fluid_max_ml', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('nutrition_schedules', 'fluid_max_ml')
    op.drop_column('nutrition_schedules', 'fluid_min_ml')
    op.drop_column('nutrition_schedules', 'fills_fluid_goal')
