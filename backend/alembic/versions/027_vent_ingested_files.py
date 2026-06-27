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
"""Add vent_ingested_files ledger

Revision ID: 027_vent_ingested_files
Revises: 026_user_message_dedupe_unique
Create Date: 2026-06-11

Tracks which batch CSV files each ventilator integration has already
ingested (by name + sha256 + row count), so overlapping rolling-window
exports skip identical files and only append the tail of the file that
grew since the previous upload.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '027_vent_ingested_files'
down_revision: Union[str, None] = '026_user_message_dedupe_unique'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vent_ingested_files',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('integration_id', sa.Integer(), nullable=False),
        sa.Column('import_id', sa.String(length=36), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('sha256', sa.String(length=64), nullable=False),
        sa.Column('line_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['integration_id'], ['patient_integrations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['import_id'], ['vent_imports.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('integration_id', 'file_name', name='uq_vent_ingested_file'),
    )
    op.create_index('ix_vent_ingested_files_integration_id', 'vent_ingested_files', ['integration_id'])
    op.create_index('ix_vent_ingested_files_import_id', 'vent_ingested_files', ['import_id'])


def downgrade() -> None:
    op.drop_index('ix_vent_ingested_files_import_id', table_name='vent_ingested_files')
    op.drop_index('ix_vent_ingested_files_integration_id', table_name='vent_ingested_files')
    op.drop_table('vent_ingested_files')
