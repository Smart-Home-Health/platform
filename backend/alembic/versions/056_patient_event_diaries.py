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
"""Patient event diaries and their timestamped observations."""
import sqlalchemy as sa
from alembic import op

revision = '056_patient_event_diaries'
down_revision = '055_alert_recovery_start'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('event_diaries',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('patient_id', sa.Integer, sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('starts_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('ends_at', sa.TIMESTAMP(timezone=True)),
        sa.Column('buttons', sa.JSON, nullable=False),
        sa.Column('include_medications', sa.Boolean, nullable=False),
        sa.Column('include_nutrition', sa.Boolean, nullable=False),
    )
    op.create_index('ix_event_diaries_patient_id', 'event_diaries', ['patient_id'])
    op.create_table('diary_events',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('diary_id', sa.Integer, sa.ForeignKey('event_diaries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('request_id', sa.String(36), nullable=False),
        sa.Column('observed_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('label', sa.String(80), nullable=False),
        sa.Column('question', sa.String(160)),
        sa.Column('answer', sa.String(8)),
        sa.Column('note', sa.Text, nullable=False),
        sa.Column('recorded_by', sa.Integer, sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.UniqueConstraint('diary_id', 'request_id', name='uq_diary_event_request'),
    )
    op.create_index('ix_diary_event_time', 'diary_events', ['diary_id', 'observed_at'])


def downgrade():
    op.drop_table('diary_events')
    op.drop_table('event_diaries')
