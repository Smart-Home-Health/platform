"""Make medication_schedule and care_task_schedule.time nullable

Revision ID: 010_medication_schedule_time_null
Revises: 009_care_task_schedule_cron
Create Date: 2026-03-05

Scheduling now uses cron_expression; time/days_of_week are legacy.
Making time nullable on both tables so INSERTs that only set cron_expression succeed.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '010_schedule_time_null'
down_revision: Union[str, None] = '009_care_task_schedule_cron'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'medication_schedule',
        'time',
        existing_type=sa.Time(),
        nullable=True,
    )
    op.alter_column(
        'care_task_schedule',
        'time',
        existing_type=sa.Time(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'medication_schedule',
        'time',
        existing_type=sa.Time(),
        nullable=False,
    )
    op.alter_column(
        'care_task_schedule',
        'time',
        existing_type=sa.Time(),
        nullable=False,
    )
