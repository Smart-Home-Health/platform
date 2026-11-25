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
"""Link a recorded bathroom outcome to a recurring diaper check occurrence."""
import sqlalchemy as sa
from alembic import op

revision = '060_fixed_bathroom_checks'
down_revision = '059_feed_start_override'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('schedule_manager_actions', sa.Column('check_schedule_id', sa.Integer, nullable=True))
    op.add_column('schedule_manager_actions', sa.Column('check_scheduled_time', sa.TIMESTAMP(timezone=True)))
    op.create_foreign_key('fk_manager_fixed_check', 'schedule_manager_actions', 'nutrition_schedules',
                          ['check_schedule_id'], ['id'], ondelete='SET NULL')
    op.create_unique_constraint('uq_manager_fixed_check', 'schedule_manager_actions',
                                ['patient_id', 'check_schedule_id', 'check_scheduled_time'])


def downgrade():
    op.drop_constraint('uq_manager_fixed_check', 'schedule_manager_actions', type_='unique')
    op.drop_constraint('fk_manager_fixed_check', 'schedule_manager_actions', type_='foreignkey')
    op.drop_column('schedule_manager_actions', 'check_scheduled_time')
    op.drop_column('schedule_manager_actions', 'check_schedule_id')
