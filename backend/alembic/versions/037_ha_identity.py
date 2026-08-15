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
"""Home Assistant identity mapping

Revision ID: 037_ha_identity
Revises: 036_env_observations
Create Date: 2026-08-14

Two pieces for HA-ingress auto-login:

- users.ha_user_id: the HA user id (uuid4().hex, 32 hex chars) an app user is
  linked to. Unique — an HA identity signs in as at most one app user.
- ha_seen_identities: every HA user observed arriving via ingress, with the
  display metadata Supervisor forwards. Feeds the admin mapping UI without
  needing any Supervisor API privileges.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '037_ha_identity'
down_revision: Union[str, None] = '036_env_observations'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('ha_user_id', sa.String(length=32), nullable=True))
    op.create_index('ix_users_ha_user_id', 'users', ['ha_user_id'], unique=True)

    op.create_table(
        'ha_seen_identities',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ha_user_id', sa.String(length=32), nullable=False),
        sa.Column('username', sa.String(length=100), nullable=True),
        sa.Column('display_name', sa.String(length=100), nullable=True),
        sa.Column('first_seen', sa.DateTime(), nullable=False),
        sa.Column('last_seen', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ha_seen_identities_ha_user_id', 'ha_seen_identities', ['ha_user_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_ha_seen_identities_ha_user_id', table_name='ha_seen_identities')
    op.drop_table('ha_seen_identities')
    op.drop_index('ix_users_ha_user_id', table_name='users')
    op.drop_column('users', 'ha_user_id')
