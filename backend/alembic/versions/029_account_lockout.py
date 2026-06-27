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
"""Add account-level login lockout fields

Revision ID: 029_account_lockout
Revises: 028_user_preferences
Create Date: 2026-06-15

Mirrors the existing per-user lockout (users.failed_login_attempts / locked_until)
on the accounts table so account-level login can't be brute-forced.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '029_account_lockout'
down_revision: Union[str, None] = '028_user_preferences'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'accounts',
        sa.Column('failed_login_attempts', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column(
        'accounts',
        sa.Column('locked_until', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('accounts', 'locked_until')
    op.drop_column('accounts', 'failed_login_attempts')
