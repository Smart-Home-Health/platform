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
"""Enable the timescaledb extension

Revision ID: 030_timescaledb_ext
Revises: 029_account_lockout
Create Date: 2026-06-15

Kept isolated and first so the extension exists before any create_hypertable()
call in later migrations. Requires the timescale/timescaledb image (the stock
postgres image does not ship the extension).
"""
from typing import Sequence, Union
from alembic import op


revision: str = '030_timescaledb_ext'
down_revision: Union[str, None] = '029_account_lockout'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")


def downgrade() -> None:
    # One-way migration: dropping the extension would cascade-drop hypertable
    # metadata. Intentionally a no-op.
    pass
