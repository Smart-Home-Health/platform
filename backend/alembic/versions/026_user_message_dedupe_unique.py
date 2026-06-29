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
"""Enforce one open user_message per dedupe_key

Revision ID: 026_user_message_dedupe_unique
Revises: 025_low_stock_threshold_type
Create Date: 2026-06-11

Concurrent GET /api/messages/active calls (e.g. the login auto-pop check and
the modal's own fetch) could both run the message generators before either
committed, inserting duplicate messages for the same dedupe_key. A partial
unique index makes the "at most one open (active/dismissed) message per key"
invariant a database guarantee; create_message() catches the conflict and
falls back to updating the winner.
"""
from typing import Sequence, Union
from alembic import op


revision: str = '026_user_message_dedupe_unique'
down_revision: Union[str, None] = '025_low_stock_threshold_type'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove existing duplicates first (keep the oldest of each open episode;
    # per-user acknowledgements follow via ON DELETE CASCADE)
    op.execute("""
        DELETE FROM user_messages um
        USING user_messages keeper
        WHERE um.dedupe_key IS NOT NULL
          AND um.status IN ('active', 'dismissed')
          AND keeper.dedupe_key = um.dedupe_key
          AND keeper.status IN ('active', 'dismissed')
          AND keeper.id < um.id
    """)
    op.execute("""
        CREATE UNIQUE INDEX uq_user_messages_open_dedupe
        ON user_messages (dedupe_key)
        WHERE dedupe_key IS NOT NULL AND status IN ('active', 'dismissed')
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_user_messages_open_dedupe")
