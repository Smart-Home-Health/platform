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
"""Patient-specific audiences for optional bathroom guidance."""
import sqlalchemy as sa
from alembic import op

revision = '061_check_recipients'
down_revision = '060_fixed_bathroom_checks'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('schedule_manager_recipients',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('patient_id', sa.Integer, sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id', ondelete='SET NULL')),
    )
    op.create_index('ix_schedule_manager_recipients_patient_id', 'schedule_manager_recipients', ['patient_id'])


def downgrade():
    op.drop_table('schedule_manager_recipients')
