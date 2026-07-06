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
"""Shipment standing-order templates and packing-slip documents

Revision ID: 033_shipment_template_docs
Revises: 032_create_hypertables
Create Date: 2026-07-05

Supports the shipments rework (delivery-confirmation flow):
- dme_shipments.is_template / template_source_id: the recurring "usual monthly
  order" is stored as a template shipment; deliveries link back to it.
- dme_shipment_documents: packing-slip images attached to a shipment (multiple
  rows per shipment for multi-page slips). Blobs live on the ./data volume via
  document_store; rows here are metadata (ClinicalDocument pattern).
- equipment.unit_size: created as VARCHAR by migration 002 but declared Integer
  on the ORM model and multiplied against received quantities — convert to a
  real INTEGER (empty strings become NULL).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '033_shipment_template_docs'
down_revision: Union[str, None] = '032_create_hypertables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ===========================================
    # dme_shipments: standing-order template support
    # ===========================================
    op.add_column('dme_shipments', sa.Column('is_template', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('dme_shipments', sa.Column('template_source_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_dme_shipments_template_source',
        'dme_shipments', 'dme_shipments',
        ['template_source_id'], ['id'],
        ondelete='SET NULL'
    )

    # ===========================================
    # dme_shipment_documents: packing-slip attachments
    # ===========================================
    op.create_table(
        'dme_shipment_documents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('shipment_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('document_type', sa.String(), nullable=False, server_default='packing-slip'),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('content_type', sa.String(), nullable=True),
        sa.Column('storage', sa.String(), nullable=False, server_default='file'),
        sa.Column('file_path', sa.String(length=500), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('page_number', sa.Integer(), nullable=True),
        sa.Column('uploaded_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['shipment_id'], ['dme_shipments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_dme_shipment_documents_shipment_id', 'dme_shipment_documents', ['shipment_id'])

    # ===========================================
    # equipment.unit_size: VARCHAR -> INTEGER (fixes string-multiply bug)
    # ===========================================
    op.alter_column(
        'equipment', 'unit_size',
        type_=sa.Integer(),
        existing_type=sa.String(),
        existing_nullable=True,
        postgresql_using="NULLIF(unit_size, '')::integer"
    )


def downgrade() -> None:
    op.alter_column(
        'equipment', 'unit_size',
        type_=sa.String(),
        existing_type=sa.Integer(),
        existing_nullable=True,
        postgresql_using='unit_size::varchar'
    )

    op.drop_index('ix_dme_shipment_documents_shipment_id', table_name='dme_shipment_documents')
    op.drop_table('dme_shipment_documents')

    op.drop_constraint('fk_dme_shipments_template_source', 'dme_shipments', type_='foreignkey')
    op.drop_column('dme_shipments', 'template_source_id')
    op.drop_column('dme_shipments', 'is_template')
