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
"""Per-item "missing" flag on shipment items

Revision ID: 035_item_missing_flag
Revises: 034_inventory_setup
Create Date: 2026-07-11

dme_shipment_items.flagged_missing: the invoice says the item shipped, but it
never arrived in the box. Distinct from qty_backordered (supplier admits it's
coming later) — this marks a shipped-quantity claim being disputed, so the
family can chase the supplier about it.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '035_item_missing_flag'
down_revision: Union[str, None] = '034_inventory_setup'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'dme_shipment_items',
        sa.Column('flagged_missing', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('dme_shipment_items', 'flagged_missing')
