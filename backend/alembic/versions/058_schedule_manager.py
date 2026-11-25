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
"""Opt-in adaptive feeds and post-feed bathroom guidance per care profile."""
import sqlalchemy as sa
from alembic import op

revision = '058_schedule_manager'
down_revision = '057_care_task_occurrence_utc'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('schedule_manager_profiles',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('patient_id', sa.Integer, sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('preferences', sa.JSON, nullable=False),
        sa.Column('overnight_schedule_id', sa.Integer, sa.ForeignKey('nutrition_schedules.id', ondelete='SET NULL')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_by', sa.Integer, sa.ForeignKey('users.id', ondelete='SET NULL')),
    )
    op.create_table('schedule_manager_feeds',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('patient_id', sa.Integer, sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('schedule_id', sa.Integer, sa.ForeignKey('nutrition_schedules.id', ondelete='CASCADE'), nullable=False),
        sa.Column('manage_spacing', sa.Boolean, nullable=False),
        sa.Column('prompt_check', sa.Boolean, nullable=False),
        sa.UniqueConstraint('patient_id', 'schedule_id', name='uq_manager_feed'),
    )
    op.create_table('schedule_manager_actions',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('patient_id', sa.Integer, sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('action', sa.String(16), nullable=False),
        sa.Column('occurred_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('recorded_by', sa.Integer, sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('request_id', sa.String(36)),
        sa.Column('trigger_schedule_id', sa.Integer, sa.ForeignKey('nutrition_schedules.id', ondelete='SET NULL')),
        sa.Column('trigger_scheduled_at', sa.TIMESTAMP(timezone=True)),
        sa.Column('snooze_until', sa.TIMESTAMP(timezone=True)),
        sa.UniqueConstraint('patient_id', 'request_id', name='uq_manager_action_request'),
    )
    op.create_index('ix_manager_action_time', 'schedule_manager_actions', ['patient_id', 'occurred_at'])


def downgrade():
    op.drop_table('schedule_manager_actions')
    op.drop_table('schedule_manager_feeds')
    op.drop_table('schedule_manager_profiles')
