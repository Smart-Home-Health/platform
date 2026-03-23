"""Add is_scheduled, completed_early, completed_late to care_task_log

Revision ID: 012_care_task_log
Revises: 011_med_log_cols
Create Date: 2026-03-05

ORM expects these columns; 001 created care_task_log without them.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '012_care_task_log'
down_revision: Union[str, None] = '011_med_log_cols'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('care_task_log', sa.Column('is_scheduled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('care_task_log', sa.Column('completed_early', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('care_task_log', sa.Column('completed_late', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('care_task_log', 'completed_late')
    op.drop_column('care_task_log', 'completed_early')
    op.drop_column('care_task_log', 'is_scheduled')
