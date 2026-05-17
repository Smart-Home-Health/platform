"""Add is_accident flag to nutrition_outputs

Revision ID: 015_nutrition_output_is_accident
Revises: 014_pulse_ox_idx
Create Date: 2026-05-16

The output-logging flow now starts by capturing where the event happened
(toilet / diaper / accident / catheter). Toilet, diaper, and catheter were
already representable via existing flags (none, is_diaper, is_catheter).
'Accident' had no representation, so we add a dedicated boolean.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '015_nutrition_output_is_accident'
down_revision: Union[str, None] = '014_pulse_ox_idx'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'nutrition_outputs',
        sa.Column('is_accident', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('nutrition_outputs', 'is_accident')
