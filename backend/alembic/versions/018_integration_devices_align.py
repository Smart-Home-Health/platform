"""align integration_devices columns with model

Revision ID: 018_integration_devices_align
Revises: 017_custom_vital_definitions
Create Date: 2026-05-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '018_integration_devices_align'
down_revision: Union[str, None] = '017_custom_vital_definitions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'integration_devices',
        sa.Column('device_model', sa.String(length=100), nullable=True),
    )
    op.add_column(
        'integration_devices',
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        'integration_devices',
        sa.Column('last_seen_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        'integration_devices',
        sa.Column('extra_data', sa.JSON(), nullable=True),
    )

    # Copy legacy columns into new ones before dropping (table is currently empty
    # in dev but the copy is cheap and safe in case of populated environments).
    op.execute("UPDATE integration_devices SET is_enabled = is_active")
    op.execute("UPDATE integration_devices SET last_seen_at = last_data AT TIME ZONE 'UTC' WHERE last_data IS NOT NULL")

    op.drop_column('integration_devices', 'is_active')
    op.drop_column('integration_devices', 'last_data')


def downgrade() -> None:
    op.add_column(
        'integration_devices',
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        'integration_devices',
        sa.Column('last_data', sa.TIMESTAMP(), nullable=True),
    )

    op.execute("UPDATE integration_devices SET is_active = is_enabled")
    op.execute("UPDATE integration_devices SET last_data = last_seen_at AT TIME ZONE 'UTC' WHERE last_seen_at IS NOT NULL")

    op.drop_column('integration_devices', 'extra_data')
    op.drop_column('integration_devices', 'last_seen_at')
    op.drop_column('integration_devices', 'is_enabled')
    op.drop_column('integration_devices', 'device_model')
