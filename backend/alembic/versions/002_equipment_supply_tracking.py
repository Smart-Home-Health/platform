"""Add supply tracking columns to equipment table

Revision ID: 002_equipment_supply
Revises: 001_initial
Create Date: 2026-02-20

Adds scheduled_replacement, item_number, description, category,
tracking_level, default_manufacturer, unit_of_measure, unit_size,
unit_description, reorder_point, par_level columns to equipment table.
Also removes deprecated scheduled_change_date and notes columns.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '002_equipment_supply'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns to equipment table
    op.add_column('equipment', sa.Column('scheduled_replacement', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('equipment', sa.Column('item_number', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('equipment', sa.Column('category', sa.String(), nullable=True, server_default="'equipment'"))
    op.add_column('equipment', sa.Column('tracking_level', sa.String(), nullable=True, server_default="'quantity'"))
    op.add_column('equipment', sa.Column('default_manufacturer', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('unit_of_measure', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('unit_size', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('unit_description', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('reorder_point', sa.Integer(), nullable=True))
    op.add_column('equipment', sa.Column('par_level', sa.Integer(), nullable=True))
    
    # Make last_changed and useful_days nullable (for non-scheduled items)
    op.alter_column('equipment', 'last_changed', nullable=True)
    op.alter_column('equipment', 'useful_days', nullable=True)
    
    # Drop deprecated columns if they exist
    op.drop_column('equipment', 'scheduled_change_date')
    op.drop_column('equipment', 'notes')


def downgrade() -> None:
    # Re-add deprecated columns
    op.add_column('equipment', sa.Column('scheduled_change_date', sa.DateTime(), nullable=True))
    op.add_column('equipment', sa.Column('notes', sa.Text(), nullable=True))
    
    # Make last_changed and useful_days non-nullable again
    op.alter_column('equipment', 'last_changed', nullable=False)
    op.alter_column('equipment', 'useful_days', nullable=False)
    
    # Remove new columns
    op.drop_column('equipment', 'par_level')
    op.drop_column('equipment', 'reorder_point')
    op.drop_column('equipment', 'unit_description')
    op.drop_column('equipment', 'unit_size')
    op.drop_column('equipment', 'unit_of_measure')
    op.drop_column('equipment', 'default_manufacturer')
    op.drop_column('equipment', 'tracking_level')
    op.drop_column('equipment', 'category')
    op.drop_column('equipment', 'description')
    op.drop_column('equipment', 'item_number')
    op.drop_column('equipment', 'scheduled_replacement')
