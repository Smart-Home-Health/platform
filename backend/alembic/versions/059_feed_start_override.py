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
"""Allow a caregiver to move a single planned feed on an appointment day."""
from alembic import op
import sqlalchemy as sa

revision = '059_feed_start_override'
down_revision = '058_schedule_manager'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'feed_start_overrides',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('patient_id', sa.Integer, sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('schedule_id', sa.Integer, sa.ForeignKey('nutrition_schedules.id', ondelete='CASCADE'), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('earliest_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_by', sa.Integer, sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('patient_id', 'schedule_id', 'scheduled_at', name='uq_feed_override_occurrence'),
    )


def downgrade():
    op.drop_table('feed_start_overrides')
