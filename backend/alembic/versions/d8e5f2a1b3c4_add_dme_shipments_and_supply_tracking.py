"""add_dme_shipments_and_supply_tracking

Revision ID: d8e5f2a1b3c4
Revises: 43ae558a4aa6
Create Date: 2026-01-29 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8e5f2a1b3c4'
down_revision: Union[str, None] = '43ae558a4aa6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new supply tracking columns to equipment table
    op.add_column('equipment', sa.Column('item_number', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('equipment', sa.Column('category', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('tracking_level', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('default_manufacturer', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('unit_of_measure', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('unit_size', sa.Integer(), nullable=True))
    op.add_column('equipment', sa.Column('unit_description', sa.String(), nullable=True))
    op.add_column('equipment', sa.Column('reorder_point', sa.Integer(), nullable=True))
    op.add_column('equipment', sa.Column('par_level', sa.Integer(), nullable=True))
    
    # Set default category for existing equipment
    op.execute("UPDATE equipment SET category = 'equipment' WHERE category IS NULL")
    op.execute("UPDATE equipment SET tracking_level = 'item' WHERE tracking_level IS NULL")
    
    # Create dme_shipments table
    op.create_table('dme_shipments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('supplier_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('po_number', sa.String(), nullable=True),
        sa.Column('order_number', sa.String(), nullable=True),
        sa.Column('ship_date', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('expected_delivery', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('actual_delivery', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('tracking_number', sa.String(), nullable=True),
        sa.Column('ship_method', sa.String(), nullable=True),
        sa.Column('warehouse_loc', sa.String(), nullable=True),
        sa.Column('is_backorder', sa.Boolean(), nullable=False, default=False),
        sa.Column('parent_shipment_id', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('finalized_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('finalized_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['supplier_id'], ['businesses.id'], ),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['finalized_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['parent_shipment_id'], ['dme_shipments.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create dme_shipment_items table
    op.create_table('dme_shipment_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('shipment_id', sa.Integer(), nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=True),
        sa.Column('item_number', sa.String(), nullable=True),
        sa.Column('item_description', sa.Text(), nullable=True),
        sa.Column('manufacturer_name', sa.String(), nullable=True),
        sa.Column('qty_ordered', sa.Integer(), nullable=False, default=0),
        sa.Column('qty_shipped', sa.Integer(), nullable=False, default=0),
        sa.Column('qty_backordered', sa.Integer(), nullable=False, default=0),
        sa.Column('unit_of_measure', sa.String(), nullable=True),
        sa.Column('unit_description', sa.String(), nullable=True),
        sa.Column('unit_price', sa.Numeric(10, 2), nullable=True),
        sa.Column('lot_number', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['shipment_id'], ['dme_shipments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create dme_receipt_items table
    op.create_table('dme_receipt_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('shipment_item_id', sa.Integer(), nullable=False),
        sa.Column('qty_received', sa.Integer(), nullable=False, default=0),
        sa.Column('received_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('received_by', sa.Integer(), nullable=True),
        sa.Column('condition', sa.String(), nullable=False, default='good'),
        sa.Column('discrepancy_notes', sa.Text(), nullable=True),
        sa.Column('lot_number', sa.String(), nullable=True),
        sa.Column('expiration_date', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['shipment_item_id'], ['dme_shipment_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['received_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create dme_shipment_alerts table
    op.create_table('dme_shipment_alerts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('shipment_id', sa.Integer(), nullable=False),
        sa.Column('shipment_item_id', sa.Integer(), nullable=True),
        sa.Column('alert_type', sa.String(), nullable=False),
        sa.Column('expected_qty', sa.Integer(), nullable=True),
        sa.Column('actual_qty', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('resolved', sa.Boolean(), nullable=False, default=False),
        sa.Column('resolved_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('resolved_by', sa.Integer(), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('followup_shipment_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['shipment_id'], ['dme_shipments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['shipment_item_id'], ['dme_shipment_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resolved_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['followup_shipment_id'], ['dme_shipments.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for common queries
    op.create_index('ix_dme_shipments_patient_id', 'dme_shipments', ['patient_id'])
    op.create_index('ix_dme_shipments_status', 'dme_shipments', ['status'])
    op.create_index('ix_dme_shipments_supplier_id', 'dme_shipments', ['supplier_id'])
    op.create_index('ix_dme_shipment_items_shipment_id', 'dme_shipment_items', ['shipment_id'])
    op.create_index('ix_dme_shipment_items_equipment_id', 'dme_shipment_items', ['equipment_id'])
    op.create_index('ix_dme_receipt_items_shipment_item_id', 'dme_receipt_items', ['shipment_item_id'])
    op.create_index('ix_dme_shipment_alerts_shipment_id', 'dme_shipment_alerts', ['shipment_id'])
    op.create_index('ix_dme_shipment_alerts_resolved', 'dme_shipment_alerts', ['resolved'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_dme_shipment_alerts_resolved', table_name='dme_shipment_alerts')
    op.drop_index('ix_dme_shipment_alerts_shipment_id', table_name='dme_shipment_alerts')
    op.drop_index('ix_dme_receipt_items_shipment_item_id', table_name='dme_receipt_items')
    op.drop_index('ix_dme_shipment_items_equipment_id', table_name='dme_shipment_items')
    op.drop_index('ix_dme_shipment_items_shipment_id', table_name='dme_shipment_items')
    op.drop_index('ix_dme_shipments_supplier_id', table_name='dme_shipments')
    op.drop_index('ix_dme_shipments_status', table_name='dme_shipments')
    op.drop_index('ix_dme_shipments_patient_id', table_name='dme_shipments')
    
    # Drop tables in reverse order (due to foreign keys)
    op.drop_table('dme_shipment_alerts')
    op.drop_table('dme_receipt_items')
    op.drop_table('dme_shipment_items')
    op.drop_table('dme_shipments')
    
    # Remove columns from equipment table
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
