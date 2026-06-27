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
"""Add users.preferences

Revision ID: 028_user_preferences
Revises: 027_vent_ingested_files
Create Date: 2026-06-14

Per-user UI preferences stored as a JSON blob, e.g. {"theme": "light|dark|system"}.
Mirrors the existing Account.settings JSON pattern so future per-user prefs fit
without further migrations.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '028_user_preferences'
down_revision: Union[str, None] = '027_vent_ingested_files'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('preferences', sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'preferences')
