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
"""Nutrition presets (reusable combinations)

Revision ID: 044_nutrition_presets
Revises: 043_nutrition_item_library
Create Date: 2026-08-18

A preset is a repeated grouping -- "Peptamen 250 mL + 60 mL flush, pump" --
logged as one tap. Applying it writes one nutrition_intake row per component
sharing an event_group_id, so the records underneath stay correctly separated
for fluid and calorie math rather than collapsing into a single blob.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '044_nutrition_presets'
down_revision: Union[str, None] = '043_nutrition_item_library'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'nutrition_presets',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True),
        sa.Column('patient_id', sa.Integer(), sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('meal_type', sa.String(20), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_nutrition_presets_account_id', 'nutrition_presets', ['account_id'])
    op.create_index('ix_nutrition_presets_patient_id', 'nutrition_presets', ['patient_id'])

    op.create_table(
        'nutrition_preset_components',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('preset_id', sa.Integer(), sa.ForeignKey('nutrition_presets.id', ondelete='CASCADE'), nullable=False),
        sa.Column('item_id', sa.Integer(), sa.ForeignKey('nutrition_items.id', ondelete='CASCADE'), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('amount_unit', sa.String(50), nullable=False),
        sa.Column('feed_route', sa.String(20), nullable=True),
        sa.Column('rate_ml_per_hr', sa.Float(), nullable=True),
        sa.Column('duration_minutes', sa.Float(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_nutrition_preset_components_preset_id', 'nutrition_preset_components', ['preset_id'])


def downgrade() -> None:
    op.drop_index('ix_nutrition_preset_components_preset_id', table_name='nutrition_preset_components')
    op.drop_table('nutrition_preset_components')
    op.drop_index('ix_nutrition_presets_patient_id', table_name='nutrition_presets')
    op.drop_index('ix_nutrition_presets_account_id', table_name='nutrition_presets')
    op.drop_table('nutrition_presets')
