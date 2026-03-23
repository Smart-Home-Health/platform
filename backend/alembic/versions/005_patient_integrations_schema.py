"""Align patient_integrations table with schema (settings, last_sync_at, etc.)

Revision ID: 005_patient_integrations
Revises: 004_readers_encryption
Create Date: 2026-03-04

Adds columns expected by schemas.integration.PatientIntegration:
settings, last_sync_at, last_sync_status, last_sync_error, sync_count, is_enabled.
Backfills from existing config, last_sync, sync_status, is_active.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '005_patient_integrations'
down_revision: Union[str, None] = '004_readers_encryption'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('patient_integrations', sa.Column('settings', sa.JSON(), nullable=True))
    op.add_column('patient_integrations', sa.Column('last_sync_at', sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column('patient_integrations', sa.Column('last_sync_status', sa.String(20), nullable=True))
    op.add_column('patient_integrations', sa.Column('last_sync_error', sa.Text(), nullable=True))
    op.add_column('patient_integrations', sa.Column('sync_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('patient_integrations', sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='true'))

    # Backfill from existing columns so existing rows work
    op.execute("""
        UPDATE patient_integrations
        SET
            settings = config,
            last_sync_at = last_sync,
            last_sync_status = sync_status,
            is_enabled = is_active
    """)


def downgrade() -> None:
    op.drop_column('patient_integrations', 'is_enabled')
    op.drop_column('patient_integrations', 'sync_count')
    op.drop_column('patient_integrations', 'last_sync_error')
    op.drop_column('patient_integrations', 'last_sync_status')
    op.drop_column('patient_integrations', 'last_sync_at')
    op.drop_column('patient_integrations', 'settings')
