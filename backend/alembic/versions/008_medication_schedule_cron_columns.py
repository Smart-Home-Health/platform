"""Add cron and related columns to medication_schedule

Revision ID: 008_medication_schedule_cron
Revises: 007_integration_type_nullable
Create Date: 2026-03-05

The ORM expects cron_expression, description, dose_amount, notes.
001_initial_schema created medication_schedule with time, days_of_week, is_active only.
This migration adds the missing columns so scheduled medication queries succeed.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '008_medication_schedule_cron'
down_revision: Union[str, None] = '007_integration_type_nullable'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('medication_schedule', sa.Column('cron_expression', sa.String(), nullable=True))
    op.add_column('medication_schedule', sa.Column('description', sa.String(), nullable=True))
    op.add_column('medication_schedule', sa.Column('dose_amount', sa.Float(), nullable=True))
    op.add_column('medication_schedule', sa.Column('notes', sa.Text(), nullable=True))
    # Backfill cron_expression for existing rows (time 08:00 daily)
    op.execute("UPDATE medication_schedule SET cron_expression = '0 8 * * *' WHERE cron_expression IS NULL")
    op.alter_column(
        'medication_schedule',
        'cron_expression',
        existing_type=sa.String(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column('medication_schedule', 'notes')
    op.drop_column('medication_schedule', 'dose_amount')
    op.drop_column('medication_schedule', 'description')
    op.drop_column('medication_schedule', 'cron_expression')
