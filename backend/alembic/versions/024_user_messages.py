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
"""Add user_messages table + medication.low_stock_threshold

Revision ID: 024_user_messages
Revises: 023_dx_rx_external_id
Create Date: 2026-06-11

Backs the "obnoxious" user attention-message flow: a blocking modal on login
listing messages the user must dismiss/snooze. Low-medication stock is the
first generator; the threshold column drives it (NULL = not monitored).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '024_user_messages'
down_revision: Union[str, None] = '023_dx_rx_external_id'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_messages',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('type', sa.String(length=50), nullable=False, server_default='general'),
        sa.Column('severity', sa.String(length=20), nullable=False, server_default='info'),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('dismissible', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('snoozable', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('ack_scope', sa.String(length=20), nullable=False, server_default='anyone'),
        sa.Column('dedupe_key', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('snoozed_until', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('dismissed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('dismissed_by_user_id', sa.Integer(), nullable=True),
        sa.Column('resolved_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['dismissed_by_user_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_user_messages_account_id', 'user_messages', ['account_id'])
    op.create_index('ix_user_messages_dedupe_key', 'user_messages', ['dedupe_key'])
    op.create_index('ix_user_messages_status', 'user_messages', ['status'])

    # Per-user dismiss/snooze state for ack_scope='per_user' messages
    op.create_table(
        'user_message_acknowledgements',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('message_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('acknowledged_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('snoozed_until', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['message_id'], ['user_messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('message_id', 'user_id', name='uq_user_message_ack'),
    )
    op.create_index('ix_user_message_acknowledgements_message_id', 'user_message_acknowledgements', ['message_id'])
    op.create_index('ix_user_message_acknowledgements_user_id', 'user_message_acknowledgements', ['user_id'])

    op.add_column('medication', sa.Column('low_stock_threshold', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('medication', 'low_stock_threshold')

    op.drop_index('ix_user_message_acknowledgements_user_id', table_name='user_message_acknowledgements')
    op.drop_index('ix_user_message_acknowledgements_message_id', table_name='user_message_acknowledgements')
    op.drop_table('user_message_acknowledgements')

    op.drop_index('ix_user_messages_status', table_name='user_messages')
    op.drop_index('ix_user_messages_dedupe_key', table_name='user_messages')
    op.drop_index('ix_user_messages_account_id', table_name='user_messages')
    op.drop_table('user_messages')
