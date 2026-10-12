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
"""Grace-period doses

Revision ID: 054_grace_period_doses
Revises: 053_water_budget
Create Date: 2026-09-04

A missed scheduled dose no longer drops off the schedule when its day
rolls over. It stays visible and actionable until it is administered or
its grace period expires. The grace is per schedule row: an explicit
override in hours, or, when NULL, 60% of the gap to that schedule's next
firing (weekly ~4.2 days, daily ~14 hours). Computed on read; this
column only carries the override.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '054_grace_period_doses'
down_revision: Union[str, None] = '053_water_budget'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('medication_schedule', sa.Column('grace_period_hours', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('medication_schedule', 'grace_period_hours')
