"""Make integrations.integration_type nullable

Revision ID: 007_integration_type_nullable
Revises: 006_integrations_auth
Create Date: 2026-03-04

The ORM uses auth_type only; INSERTs do not set integration_type, causing
NotNullViolation. Make integration_type nullable so inserts succeed.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '007_integration_type_nullable'
down_revision: Union[str, None] = '006_integrations_auth'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'integrations',
        'integration_type',
        existing_type=sa.String(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'integrations',
        'integration_type',
        existing_type=sa.String(),
        nullable=False,
    )
