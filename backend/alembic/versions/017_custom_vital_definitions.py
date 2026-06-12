"""Custom vital definitions table

Revision ID: 017_custom_vital_definitions
Revises: 016_vent_logs
Create Date: 2026-05-26

Per-patient custom vital definitions so caregivers can track
condition-specific metrics (e.g. blood glucose, insulin, HbA1c)
alongside the built-in vital types.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '017_custom_vital_definitions'
down_revision: Union[str, None] = '016_vent_logs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'custom_vital_definitions',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('patient_id', sa.Integer(),
                  sa.ForeignKey('patients.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('unit', sa.VARCHAR(20), nullable=True),
        sa.Column('display_label', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('custom_vital_definitions')
