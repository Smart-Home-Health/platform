"""add voided_at/voided_by (soft delete) to completion log tables

Lets a completed dose/feed/care-task be "undone" without losing the record:
the row is marked voided instead of hard-deleted, so undos stay auditable.

Revision ID: 020_soft_delete_completion_logs
Revises: 019_user_force_password_reset
Create Date: 2026-06-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '020_soft_delete_completion_logs'
down_revision: Union[str, None] = '019_user_force_password_reset'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, FK constraint name for voided_by -> users.id)
_TABLES = [
    ('medication_log', 'fk_medication_log_voided_by_users'),
    ('nutrition_intake', 'fk_nutrition_intake_voided_by_users'),
    ('nutrition_outputs', 'fk_nutrition_outputs_voided_by_users'),
    ('care_task_log', 'fk_care_task_log_voided_by_users'),
]


def upgrade() -> None:
    for table, fk_name in _TABLES:
        op.add_column(table, sa.Column('voided_at', sa.TIMESTAMP(timezone=True), nullable=True))
        op.add_column(table, sa.Column('voided_by', sa.Integer(), nullable=True))
        op.create_foreign_key(
            fk_name, table, 'users', ['voided_by'], ['id'], ondelete='SET NULL'
        )


def downgrade() -> None:
    for table, fk_name in _TABLES:
        op.drop_constraint(fk_name, table, type_='foreignkey')
        op.drop_column(table, 'voided_by')
        op.drop_column(table, 'voided_at')
