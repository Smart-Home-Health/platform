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
"""Initial inventory setup: provider aliases, count log, storage location

Revision ID: 034_inventory_setup
Revises: 033_shipment_template_docs
Create Date: 2026-07-06

Supports the Initial Inventory Setup wizard:
- equipment.storage_location: plain "where it lives" label (Vent shelf,
  Trach cart, ...). A label, not per-location balances — deliveries still
  increment the single equipment.quantity.
- equipment_provider_aliases: the same supply arrives from different DME
  providers under different item numbers (and sometimes several numbers from
  one provider). One row per (equipment, supplier, number); raw_description
  preserves the distributor's exact slip wording so future scans can match.
- equipment_count_log: audit trail for physical stocktakes (old -> new
  quantity). Deliberately separate from equipment_change_log, which means
  "the item was physically replaced" and drives last_changed / the History
  page — a shelf count must not touch either.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '034_inventory_setup'
down_revision: Union[str, None] = '033_shipment_template_docs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ===========================================
    # equipment: "where it lives" label
    # ===========================================
    op.add_column('equipment', sa.Column('storage_location', sa.String(), nullable=True))

    # ===========================================
    # equipment_provider_aliases: per-provider item numbers
    # ===========================================
    op.create_table(
        'equipment_provider_aliases',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('equipment_id', sa.Integer(), nullable=False),
        sa.Column('supplier_id', sa.Integer(), nullable=True),
        sa.Column('item_number', sa.String(), nullable=False),
        sa.Column('raw_description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['supplier_id'], ['businesses.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('equipment_id', 'supplier_id', 'item_number', name='uq_equipment_alias')
    )
    op.create_index('ix_equipment_provider_aliases_account_id', 'equipment_provider_aliases', ['account_id'])
    op.create_index('ix_equipment_provider_aliases_equipment_id', 'equipment_provider_aliases', ['equipment_id'])
    op.create_index('ix_equipment_provider_aliases_item_number', 'equipment_provider_aliases', ['item_number'])

    # ===========================================
    # equipment_count_log: stocktake audit trail
    # ===========================================
    op.create_table(
        'equipment_count_log',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=False),
        sa.Column('quantity_before', sa.Integer(), nullable=False),
        sa.Column('quantity_after', sa.Integer(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('counted_by', sa.Integer(), nullable=True),
        sa.Column('counted_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['counted_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_equipment_count_log_equipment_id', 'equipment_count_log', ['equipment_id'])


def downgrade() -> None:
    op.drop_index('ix_equipment_count_log_equipment_id', table_name='equipment_count_log')
    op.drop_table('equipment_count_log')

    op.drop_index('ix_equipment_provider_aliases_item_number', table_name='equipment_provider_aliases')
    op.drop_index('ix_equipment_provider_aliases_equipment_id', table_name='equipment_provider_aliases')
    op.drop_index('ix_equipment_provider_aliases_account_id', table_name='equipment_provider_aliases')
    op.drop_table('equipment_provider_aliases')

    op.drop_column('equipment', 'storage_location')
