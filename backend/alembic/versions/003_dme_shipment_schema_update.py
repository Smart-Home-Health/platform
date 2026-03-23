"""Update DME shipment schema with full tracking support

Revision ID: 003_dme_shipment_update
Revises: 002_equipment_supply
Create Date: 2026-02-21

Updates dme_shipments table with new columns and creates supporting tables:
- dme_shipment_items: Line items in a shipment
- dme_receipt_items: Records of items received
- dme_shipment_alerts: Discrepancy tracking
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '003_dme_shipment_update'
down_revision: Union[str, None] = '002_equipment_supply'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ===========================================
    # UPDATE dme_shipments TABLE
    # ===========================================
    
    # Add new columns
    op.add_column('dme_shipments', sa.Column('po_number', sa.String(), nullable=True))
    op.add_column('dme_shipments', sa.Column('order_number', sa.String(), nullable=True))
    op.add_column('dme_shipments', sa.Column('ship_method', sa.String(), nullable=True))
    op.add_column('dme_shipments', sa.Column('warehouse_loc', sa.String(), nullable=True))
    op.add_column('dme_shipments', sa.Column('is_backorder', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('dme_shipments', sa.Column('parent_shipment_id', sa.Integer(), nullable=True))
    op.add_column('dme_shipments', sa.Column('created_by', sa.Integer(), nullable=True))
    op.add_column('dme_shipments', sa.Column('finalized_at', sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column('dme_shipments', sa.Column('finalized_by', sa.Integer(), nullable=True))
    
    # Add foreign keys for new columns
    op.create_foreign_key(
        'fk_dme_shipments_parent_shipment',
        'dme_shipments', 'dme_shipments',
        ['parent_shipment_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_dme_shipments_created_by',
        'dme_shipments', 'users',
        ['created_by'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_dme_shipments_finalized_by',
        'dme_shipments', 'users',
        ['finalized_by'], ['id'],
        ondelete='SET NULL'
    )
    
    # Update status default from 'pending' to 'draft'
    op.alter_column('dme_shipments', 'status', server_default='draft')
    
    # Drop deprecated columns (carrier replaced by ship_method, order_date removed, items JSON replaced by items table)
    op.drop_column('dme_shipments', 'carrier')
    op.drop_column('dme_shipments', 'order_date')
    op.drop_column('dme_shipments', 'items')
    
    # ===========================================
    # CREATE dme_shipment_items TABLE
    # ===========================================
    
    op.create_table('dme_shipment_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('shipment_id', sa.Integer(), nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=True),
        sa.Column('item_number', sa.String(), nullable=True),
        sa.Column('item_description', sa.Text(), nullable=True),
        sa.Column('manufacturer_name', sa.String(), nullable=True),
        sa.Column('qty_ordered', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('qty_shipped', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('qty_backordered', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('unit_of_measure', sa.String(), nullable=True),
        sa.Column('unit_description', sa.String(), nullable=True),
        sa.Column('unit_price', sa.Numeric(10, 2), nullable=True),
        sa.Column('lot_number', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['shipment_id'], ['dme_shipments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_dme_shipment_items_shipment_id', 'dme_shipment_items', ['shipment_id'])
    op.create_index('ix_dme_shipment_items_equipment_id', 'dme_shipment_items', ['equipment_id'])
    
    # ===========================================
    # CREATE dme_receipt_items TABLE
    # ===========================================
    
    op.create_table('dme_receipt_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('shipment_item_id', sa.Integer(), nullable=False),
        sa.Column('qty_received', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('received_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('received_by', sa.Integer(), nullable=True),
        sa.Column('condition', sa.String(), nullable=False, server_default="'good'"),
        sa.Column('discrepancy_notes', sa.Text(), nullable=True),
        sa.Column('lot_number', sa.String(), nullable=True),
        sa.Column('expiration_date', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['shipment_item_id'], ['dme_shipment_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['received_by'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_dme_receipt_items_shipment_item_id', 'dme_receipt_items', ['shipment_item_id'])
    
    # ===========================================
    # CREATE dme_shipment_alerts TABLE
    # ===========================================
    
    op.create_table('dme_shipment_alerts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('shipment_id', sa.Integer(), nullable=False),
        sa.Column('shipment_item_id', sa.Integer(), nullable=True),
        sa.Column('alert_type', sa.String(), nullable=False),
        sa.Column('expected_qty', sa.Integer(), nullable=True),
        sa.Column('actual_qty', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('resolved', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('resolved_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('resolved_by', sa.Integer(), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('followup_shipment_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['shipment_id'], ['dme_shipments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['shipment_item_id'], ['dme_shipment_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resolved_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['followup_shipment_id'], ['dme_shipments.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_dme_shipment_alerts_shipment_id', 'dme_shipment_alerts', ['shipment_id'])
    op.create_index('ix_dme_shipment_alerts_resolved', 'dme_shipment_alerts', ['resolved'])


def downgrade() -> None:
    # Drop new tables
    op.drop_table('dme_shipment_alerts')
    op.drop_table('dme_receipt_items')
    op.drop_table('dme_shipment_items')
    
    # Drop foreign keys
    op.drop_constraint('fk_dme_shipments_finalized_by', 'dme_shipments', type_='foreignkey')
    op.drop_constraint('fk_dme_shipments_created_by', 'dme_shipments', type_='foreignkey')
    op.drop_constraint('fk_dme_shipments_parent_shipment', 'dme_shipments', type_='foreignkey')
    
    # Re-add deprecated columns
    op.add_column('dme_shipments', sa.Column('items', sa.JSON(), nullable=True))
    op.add_column('dme_shipments', sa.Column('order_date', sa.DateTime(), nullable=True))
    op.add_column('dme_shipments', sa.Column('carrier', sa.String(), nullable=True))
    
    # Remove new columns
    op.drop_column('dme_shipments', 'finalized_by')
    op.drop_column('dme_shipments', 'finalized_at')
    op.drop_column('dme_shipments', 'created_by')
    op.drop_column('dme_shipments', 'parent_shipment_id')
    op.drop_column('dme_shipments', 'is_backorder')
    op.drop_column('dme_shipments', 'warehouse_loc')
    op.drop_column('dme_shipments', 'ship_method')
    op.drop_column('dme_shipments', 'order_number')
    op.drop_column('dme_shipments', 'po_number')
    
    # Restore status default
    op.alter_column('dme_shipments', 'status', server_default="'pending'")
