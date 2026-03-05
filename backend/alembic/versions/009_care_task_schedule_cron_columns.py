"""Add cron and related columns to care_task_schedule

Revision ID: 009_care_task_schedule_cron
Revises: 008_medication_schedule_cron
Create Date: 2026-03-05

The ORM expects cron_expression, description, notes, active.
001_initial_schema created care_task_schedule with time, days_of_week, is_active only.
This migration adds the missing columns so scheduled care task queries succeed.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '009_care_task_schedule_cron'
down_revision: Union[str, None] = '008_medication_schedule_cron'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('care_task_schedule', sa.Column('cron_expression', sa.String(), nullable=True))
    op.add_column('care_task_schedule', sa.Column('description', sa.String(), nullable=True))
    op.add_column('care_task_schedule', sa.Column('notes', sa.Text(), nullable=True))
    op.execute("UPDATE care_task_schedule SET cron_expression = '0 8 * * *' WHERE cron_expression IS NULL")
    op.alter_column(
        'care_task_schedule',
        'cron_expression',
        existing_type=sa.String(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column('care_task_schedule', 'notes')
    op.drop_column('care_task_schedule', 'description')
    op.drop_column('care_task_schedule', 'cron_expression')
