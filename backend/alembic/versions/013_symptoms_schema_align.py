"""Align symptoms table with Symptom ORM (symptom_type, timestamp, etc.)

Revision ID: 013_symptoms
Revises: 012_care_task_log
Create Date: 2026-03-05

001_initial_schema created symptoms with name, severity string, onset_date,
resolved_date, is_active, updated_at. ORM expects symptom_type, timestamp,
severity integer, location, duration, is_resolved, resolved_at. This migration
adds/migrates columns to match the model.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '013_symptoms'
down_revision: Union[str, None] = '012_care_task_log'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns (nullable first for backfill)
    op.add_column('symptoms', sa.Column('symptom_type', sa.String(100), nullable=True))
    op.add_column('symptoms', sa.Column('timestamp', sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column('symptoms', sa.Column('location', sa.String(100), nullable=True))
    op.add_column('symptoms', sa.Column('duration', sa.String(50), nullable=True))
    op.add_column('symptoms', sa.Column('is_resolved', sa.Boolean(), nullable=True))
    op.add_column('symptoms', sa.Column('resolved_at', sa.TIMESTAMP(timezone=True), nullable=True))

    # Backfill symptom_type from name
    op.execute("UPDATE symptoms SET symptom_type = name WHERE name IS NOT NULL")
    op.execute("UPDATE symptoms SET symptom_type = 'unknown' WHERE symptom_type IS NULL")
    op.alter_column(
        'symptoms', 'symptom_type',
        existing_type=sa.String(100),
        nullable=False
    )
    op.drop_column('symptoms', 'name')

    # Backfill timestamp from created_at
    op.execute("UPDATE symptoms SET timestamp = created_at WHERE created_at IS NOT NULL")
    op.execute("UPDATE symptoms SET timestamp = CURRENT_TIMESTAMP WHERE timestamp IS NULL")
    op.alter_column(
        'symptoms', 'timestamp',
        existing_type=sa.TIMESTAMP(timezone=True),
        nullable=False
    )

    # Backfill is_resolved from is_active (inverse)
    op.execute("UPDATE symptoms SET is_resolved = NOT COALESCE(is_active, true)")
    op.alter_column(
        'symptoms', 'is_resolved',
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.text('false')
    )
    op.drop_column('symptoms', 'is_active')

    # Backfill resolved_at from resolved_date
    op.execute("UPDATE symptoms SET resolved_at = resolved_date WHERE resolved_date IS NOT NULL")
    op.drop_column('symptoms', 'resolved_date')

    # Drop columns not in ORM
    op.drop_column('symptoms', 'onset_date')
    op.drop_column('symptoms', 'updated_at')

    # severity: table has String, ORM has Integer. Add int column, copy, drop old, rename.
    op.add_column('symptoms', sa.Column('severity_int', sa.Integer(), nullable=True))
    op.execute("""
        UPDATE symptoms SET severity_int = NULLIF(regexp_replace(COALESCE(severity, ''), '[^0-9]', '', 'g'), '')::integer
        WHERE severity IS NOT NULL AND regexp_replace(COALESCE(severity, ''), '[^0-9]', '', 'g') ~ '^[0-9]+$'
    """)
    op.drop_column('symptoms', 'severity')
    op.alter_column('symptoms', 'severity_int', new_column_name='severity')


def downgrade() -> None:
    # Restore columns dropped in upgrade (with original types)
    op.add_column('symptoms', sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))
    op.add_column('symptoms', sa.Column('onset_date', sa.DateTime(), nullable=True))
    op.add_column('symptoms', sa.Column('resolved_date', sa.DateTime(), nullable=True))
    op.add_column('symptoms', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')))

    op.execute("UPDATE symptoms SET resolved_date = resolved_at WHERE resolved_at IS NOT NULL")
    op.execute("UPDATE symptoms SET is_active = NOT COALESCE(is_resolved, false)")
    op.drop_column('symptoms', 'resolved_at')
    op.drop_column('symptoms', 'is_resolved')

    op.add_column('symptoms', sa.Column('name', sa.String(), nullable=True))
    op.execute("UPDATE symptoms SET name = symptom_type WHERE symptom_type IS NOT NULL")
    op.alter_column('symptoms', 'name', nullable=False)
    op.drop_column('symptoms', 'symptom_type')
    op.drop_column('symptoms', 'timestamp')
    op.drop_column('symptoms', 'location')
    op.drop_column('symptoms', 'duration')

    op.add_column('symptoms', sa.Column('severity_str', sa.String(), nullable=True))
    op.execute("UPDATE symptoms SET severity_str = severity::text WHERE severity IS NOT NULL")
    op.drop_column('symptoms', 'severity')
    op.alter_column('symptoms', 'severity_str', new_column_name='severity')