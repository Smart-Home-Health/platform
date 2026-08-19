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
"""Record how a monitoring alert's end_time was arrived at

Revision ID: 047_monitoring_alert_end_source
Revises: 046_shipment_account_scope
Create Date: 2026-08-19

An alert's end_time used to be a bare timestamp with no indication of where it
came from, which mattered once we started reconstructing ends from the stored
pulse-ox stream: "we watched them recover" and "the sensor stopped and we
stopped knowing" are different clinical statements and should not look alike.

end_source carries that. Existing rows stay NULL, meaning "closed before this
was tracked" -- a real and distinct state, and the flag the reconstruction pass
uses to know which rows it has already considered. Backfilling 'live' onto them
would assert something we cannot verify, including onto the rows we know are
wrong.

end_time_superseded holds whatever value a reconstruction replaced, so an
overwritten clinical record is never silently lost.

The partial index matches the sweeper's every-five-minutes predicate exactly;
it holds only currently-open alerts, which is approximately none of them.

Note for anyone querying alerts against their samples: end_time is stamped from
a timestamp captured before the sample row is written, so the sample that
triggered the close can land a few hundred microseconds AFTER end_time. A plain
BETWEEN start_time AND end_time silently drops it. Widen the upper bound.
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op


revision: str = '047_monitoring_alert_end_source'
down_revision: Union[str, None] = '046_shipment_account_scope'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('monitoring_alerts', sa.Column('end_source', sa.String(), nullable=True))
    op.add_column(
        'monitoring_alerts',
        sa.Column('end_time_superseded', sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index(
        'ix_monitoring_alerts_open',
        'monitoring_alerts',
        ['start_time'],
        postgresql_where=sa.text('end_time IS NULL AND end_source IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_monitoring_alerts_open', table_name='monitoring_alerts')
    op.drop_column('monitoring_alerts', 'end_time_superseded')
    op.drop_column('monitoring_alerts', 'end_source')
