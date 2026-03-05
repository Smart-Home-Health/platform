"""Add encryption and pairing columns to readers table

Revision ID: 004_readers_encryption
Revises: 003_dme_shipment_update
Create Date: 2026-03-04

Adds encryption_key, is_paired, paired_at, last_data_at to readers
for reader pairing and encrypted WebSocket support.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '004_readers_encryption'
down_revision: Union[str, None] = '003_dme_shipment_update'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('readers', sa.Column('encryption_key', sa.Text(), nullable=True))
    op.add_column('readers', sa.Column('is_paired', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('readers', sa.Column('paired_at', sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column('readers', sa.Column('last_data_at', sa.TIMESTAMP(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('readers', 'last_data_at')
    op.drop_column('readers', 'paired_at')
    op.drop_column('readers', 'is_paired')
    op.drop_column('readers', 'encryption_key')
