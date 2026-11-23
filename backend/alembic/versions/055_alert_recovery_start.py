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
"""Record the first normal sample in a confirmed alert recovery."""
from alembic import op
import sqlalchemy as sa

revision = '055_alert_recovery_start'
down_revision = '054_grace_period_doses'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('monitoring_alerts', sa.Column('recovery_start_time', sa.TIMESTAMP(timezone=True)))


def downgrade() -> None:
    op.drop_column('monitoring_alerts', 'recovery_start_time')
