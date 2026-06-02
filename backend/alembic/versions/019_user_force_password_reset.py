"""add force_password_reset to users

Revision ID: 019_user_force_password_reset
Revises: 018_integration_devices_align
Create Date: 2026-05-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '019_user_force_password_reset'
down_revision: Union[str, None] = '018_integration_devices_align'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing users are NOT flagged; sysadmins trigger the reset explicitly.
    op.add_column(
        'users',
        sa.Column(
            'force_password_reset',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Drop the server default so the application-level default (True for new
    # admin-created users) governs going forward.
    op.alter_column('users', 'force_password_reset', server_default=None)


def downgrade() -> None:
    op.drop_column('users', 'force_password_reset')
