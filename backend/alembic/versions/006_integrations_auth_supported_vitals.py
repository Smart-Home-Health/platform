"""Add auth_type and supported_vitals to integrations table

Revision ID: 006_integrations_auth
Revises: 005_patient_integrations
Create Date: 2026-03-04

Aligns integrations table with schemas.integration.Integration:
adds auth_type (schema expects it; 001 had integration_type) and supported_vitals.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '006_integrations_auth'
down_revision: Union[str, None] = '005_patient_integrations'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'integrations',
        sa.Column('auth_type', sa.String(20), nullable=False, server_default='oauth2')
    )
    op.add_column('integrations', sa.Column('supported_vitals', sa.JSON(), nullable=True))

    # Backfill auth_type from integration_type where it matches allowed values
    op.execute("""
        UPDATE integrations
        SET auth_type = integration_type
        WHERE integration_type IN ('oauth2', 'api_key', 'local', 'none')
    """)


def downgrade() -> None:
    op.drop_column('integrations', 'supported_vitals')
    op.drop_column('integrations', 'auth_type')
