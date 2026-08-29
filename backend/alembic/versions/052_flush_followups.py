# Smart Home Health
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""Post-feed flush follow-ups

Revision ID: 052_flush_followups
Revises: 051_nutrition_sched_components
Create Date: 2026-08-29

A feed and its water flush used to be two separate cron schedules. Now one
schedule carries both: a mix component flagged is_flush is NOT logged with
the meal — completing the feed spawns a one-off follow-up row due at
completed_at + (tube-feed volume / rate), which is then run (logging the
water as a liquid intake) or explicitly skipped (smoothie-heavy mixes
already carry enough water).

nutrition_flush_followups is the app's first non-cron scheduled event, so it
is a standalone table rather than a nutrition_schedules variant.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '052_flush_followups'
down_revision: Union[str, None] = '051_nutrition_sched_components'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'nutrition_schedule_components',
        sa.Column('is_flush', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        'nutrition_flush_followups',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True),
        sa.Column('patient_id', sa.Integer(), sa.ForeignKey('patients.id'), nullable=False),
        sa.Column('schedule_id', sa.Integer(), sa.ForeignKey('nutrition_schedules.id', ondelete='SET NULL'), nullable=True),
        # The feed occurrence that spawned this (idempotency key with schedule_id).
        sa.Column('feed_scheduled_time', sa.TIMESTAMP(timezone=True), nullable=True),
        # The feed's intake event; feed undo voids pending follow-ups through it.
        sa.Column('source_event_group_id', sa.String(36), nullable=False),
        sa.Column('item_id', sa.Integer(), sa.ForeignKey('nutrition_items.id', ondelete='SET NULL'), nullable=True),
        sa.Column('item_name', sa.String(200), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('amount_unit', sa.String(50), nullable=False, server_default='ml'),
        sa.Column('due_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),  # pending|completed|skipped
        # The flush's own intake event; flush undo restores pending through it.
        sa.Column('completed_intake_group_id', sa.String(36), nullable=True),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('completed_by', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('voided_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('voided_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
    )
    op.create_index('ix_nutrition_flush_followups_patient_due',
                    'nutrition_flush_followups', ['patient_id', 'due_at'])
    op.create_index('ix_nutrition_flush_followups_source_group',
                    'nutrition_flush_followups', ['source_event_group_id'])
    op.create_index('ix_nutrition_flush_followups_completed_group',
                    'nutrition_flush_followups', ['completed_intake_group_id'])


def downgrade() -> None:
    op.drop_index('ix_nutrition_flush_followups_completed_group', table_name='nutrition_flush_followups')
    op.drop_index('ix_nutrition_flush_followups_source_group', table_name='nutrition_flush_followups')
    op.drop_index('ix_nutrition_flush_followups_patient_due', table_name='nutrition_flush_followups')
    op.drop_table('nutrition_flush_followups')
    op.drop_column('nutrition_schedule_components', 'is_flush')
