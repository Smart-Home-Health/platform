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
"""Add medication.low_stock_threshold_type

Revision ID: 025_low_stock_threshold_type
Revises: 024_user_messages
Create Date: 2026-06-11

Lets the low-stock threshold be expressed either as a raw on-hand quantity
('quantity') or as days of supply left ('days'), projected from the med's
active schedules.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '025_low_stock_threshold_type'
down_revision: Union[str, None] = '024_user_messages'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'medication',
        sa.Column('low_stock_threshold_type', sa.String(length=20), nullable=False, server_default='quantity'),
    )


def downgrade() -> None:
    op.drop_column('medication', 'low_stock_threshold_type')
