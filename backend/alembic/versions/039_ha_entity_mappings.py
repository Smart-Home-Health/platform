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
"""Inbound HA entity mappings

Revision ID: 039_ha_entity_mappings
Revises: 038_patient_ha_identity
Create Date: 2026-08-15

ha_entity_mappings routes selected Home Assistant entities into SHH:
target_kind "vital" (patient vitals) or "environment" (environmental
observations). See backend/homeassistant/.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '039_ha_entity_mappings'
down_revision: Union[str, None] = '038_patient_ha_identity'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ha_entity_mappings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('entity_id', sa.String(length=255), nullable=False),
        sa.Column('friendly_name', sa.String(length=255), nullable=True),
        sa.Column('device_class', sa.String(length=50), nullable=True),
        sa.Column('source_unit', sa.String(length=50), nullable=True),
        sa.Column('target_kind', sa.String(length=20), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('vital_type', sa.String(length=50), nullable=True),
        sa.Column('vital_group', sa.String(length=50), nullable=True),
        sa.Column('metric', sa.String(length=50), nullable=True),
        sa.Column('scope', sa.String(length=20), nullable=True),
        sa.Column('location', sa.String(length=100), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('min_interval_seconds', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_seen_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('last_value', sa.Float(), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('entity_id', name='uq_ha_entity_mappings_entity_id'),
    )
    op.create_index('ix_ha_entity_mappings_account_id', 'ha_entity_mappings', ['account_id'])
    op.create_index('ix_ha_entity_mappings_patient_id', 'ha_entity_mappings', ['patient_id'])


def downgrade() -> None:
    op.drop_index('ix_ha_entity_mappings_patient_id', table_name='ha_entity_mappings')
    op.drop_index('ix_ha_entity_mappings_account_id', table_name='ha_entity_mappings')
    op.drop_table('ha_entity_mappings')
