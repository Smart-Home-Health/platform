"""Add dose_amount, is_scheduled, administered_early, administered_late to medication_log

Revision ID: 011_med_log_cols
Revises: 010_schedule_time_null
Create Date: 2026-03-05

ORM expects these columns; 001 created medication_log with dosage_given, status only.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '011_med_log_cols'
down_revision: Union[str, None] = '010_schedule_time_null'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('medication_log', sa.Column('dose_amount', sa.Float(), nullable=False, server_default='0'))
    op.add_column('medication_log', sa.Column('is_scheduled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('medication_log', sa.Column('administered_early', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('medication_log', sa.Column('administered_late', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('medication_log', 'administered_late')
    op.drop_column('medication_log', 'administered_early')
    op.drop_column('medication_log', 'is_scheduled')
    op.drop_column('medication_log', 'dose_amount')
