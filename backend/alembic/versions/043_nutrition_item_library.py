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
"""Nutrition item library (reusable saved items)

Revision ID: 043_nutrition_item_library
Revises: 042_nutrition_output_event_group
Create Date: 2026-08-18

Replaces the hardcoded /api/nutrition-presets dict with a real, editable
library. Nutrition values are stored per unit rather than per serving so the
logging sheet can scale them to whatever amount was actually given.

patient_id NULL means the item is shared across the account.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '043_nutrition_item_library'
down_revision: Union[str, None] = '042_nutrition_output_event_group'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'nutrition_items',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True),
        sa.Column('patient_id', sa.Integer(), sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('item_type', sa.String(20), nullable=False),
        sa.Column('brand', sa.String(200), nullable=True),
        sa.Column('default_amount', sa.Float(), nullable=True),
        sa.Column('default_amount_unit', sa.String(50), nullable=True),
        sa.Column('calories_per_unit', sa.Float(), nullable=True),
        sa.Column('protein_per_unit', sa.Float(), nullable=True),
        sa.Column('carbs_per_unit', sa.Float(), nullable=True),
        sa.Column('fat_per_unit', sa.Float(), nullable=True),
        sa.Column('fiber_per_unit', sa.Float(), nullable=True),
        sa.Column('sodium_per_unit', sa.Float(), nullable=True),
        sa.Column('barcode', sa.String(64), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('account_id', 'patient_id', 'name', name='uq_nutrition_item_name'),
    )
    op.create_index('ix_nutrition_items_account_id', 'nutrition_items', ['account_id'])
    op.create_index('ix_nutrition_items_patient_id', 'nutrition_items', ['patient_id'])
    op.create_index('ix_nutrition_items_barcode', 'nutrition_items', ['barcode'])


def downgrade() -> None:
    op.drop_index('ix_nutrition_items_barcode', table_name='nutrition_items')
    op.drop_index('ix_nutrition_items_patient_id', table_name='nutrition_items')
    op.drop_index('ix_nutrition_items_account_id', table_name='nutrition_items')
    op.drop_table('nutrition_items')
