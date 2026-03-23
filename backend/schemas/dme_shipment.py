"""
DME Shipment tracking tables for supplies and equipment deliveries
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, TIMESTAMP, Numeric
from sqlalchemy.orm import relationship
from schemas import Base


class DMEShipment(Base):
    """
    Tracks DME shipments/orders from suppliers
    """
    __tablename__ = 'dme_shipments'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this shipment belongs to
    
    # Supplier and patient links
    supplier_id = Column(Integer, ForeignKey('businesses.id'), nullable=True)  # DME provider
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    
    # Order identifiers
    po_number = Column(String, nullable=True)  # Purchase order number
    order_number = Column(String, nullable=True)  # Supplier's order number
    
    # Dates
    ship_date = Column(TIMESTAMP(timezone=True), nullable=True)  # When shipped
    expected_delivery = Column(TIMESTAMP(timezone=True), nullable=True)
    actual_delivery = Column(TIMESTAMP(timezone=True), nullable=True)
    
    # Status: draft, ordered, shipped, receiving, complete, partial, verified
    status = Column(String, nullable=False, default='draft')
    
    # Shipping details
    tracking_number = Column(String, nullable=True)
    ship_method = Column(String, nullable=True)  # e.g., "FedEx-Ground-Residential"
    warehouse_loc = Column(String, nullable=True)  # e.g., "OH1"
    
    # Backorder tracking
    is_backorder = Column(Boolean, nullable=False, default=False)
    parent_shipment_id = Column(Integer, ForeignKey('dme_shipments.id'), nullable=True)
    
    # Notes and metadata
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Finalization
    finalized_at = Column(TIMESTAMP(timezone=True), nullable=True)
    finalized_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    
    # Relationships
    supplier = relationship('Business', foreign_keys=[supplier_id])
    patient = relationship('Patient', foreign_keys=[patient_id])
    created_by_user = relationship('User', foreign_keys=[created_by])
    finalized_by_user = relationship('User', foreign_keys=[finalized_by])
    parent_shipment = relationship('DMEShipment', remote_side=[id], backref='backorder_shipments')
    items = relationship('DMEShipmentItem', back_populates='shipment', cascade='all, delete-orphan')
    alerts = relationship('DMEShipmentAlert', back_populates='shipment', cascade='all, delete-orphan', foreign_keys='DMEShipmentAlert.shipment_id')


class DMEShipmentItem(Base):
    """
    Line items in a DME shipment - matches packing slip format
    """
    __tablename__ = 'dme_shipment_items'
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    shipment_id = Column(Integer, ForeignKey('dme_shipments.id', ondelete='CASCADE'), nullable=False)
    equipment_id = Column(Integer, ForeignKey('equipment.id'), nullable=True)  # Link to equipment/supply
    
    # Item details (can differ from equipment defaults per shipment)
    item_number = Column(String, nullable=True)  # Supplier SKU for this shipment
    item_description = Column(Text, nullable=True)  # Description on packing slip
    manufacturer_name = Column(String, nullable=True)  # Can vary per shipment
    
    # Quantities
    qty_ordered = Column(Integer, nullable=False, default=0)
    qty_shipped = Column(Integer, nullable=False, default=0)
    qty_backordered = Column(Integer, nullable=False, default=0)
    
    # Unit info (text to handle variations like "BX = 100 EA" vs "BX = 100 OP")
    unit_of_measure = Column(String, nullable=True)  # EA, BX, PK, etc.
    unit_description = Column(String, nullable=True)  # e.g., "BX = 100 EA"
    
    # Pricing and lot
    unit_price = Column(Numeric(10, 2), nullable=True)
    lot_number = Column(String, nullable=True)
    
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    shipment = relationship('DMEShipment', back_populates='items')
    equipment = relationship('Equipment', back_populates='shipment_items')
    receipts = relationship('DMEReceiptItem', back_populates='shipment_item', cascade='all, delete-orphan')
    alerts = relationship('DMEShipmentAlert', back_populates='shipment_item')


class DMEReceiptItem(Base):
    """
    Records of items received - supports multiple receipt sessions per shipment item
    """
    __tablename__ = 'dme_receipt_items'
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    shipment_item_id = Column(Integer, ForeignKey('dme_shipment_items.id', ondelete='CASCADE'), nullable=False)
    
    # What was received
    qty_received = Column(Integer, nullable=False, default=0)
    received_at = Column(TIMESTAMP(timezone=True), nullable=False)
    received_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    
    # Condition: good, damaged, wrong_item, short, extra
    condition = Column(String, nullable=False, default='good')
    discrepancy_notes = Column(Text, nullable=True)
    
    # Tracking details
    lot_number = Column(String, nullable=True)
    expiration_date = Column(TIMESTAMP(timezone=True), nullable=True)
    
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    shipment_item = relationship('DMEShipmentItem', back_populates='receipts')
    received_by_user = relationship('User', foreign_keys=[received_by])


class DMEShipmentAlert(Base):
    """
    Tracks discrepancies that need follow-up (short, wrong item, damaged)
    """
    __tablename__ = 'dme_shipment_alerts'
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    shipment_id = Column(Integer, ForeignKey('dme_shipments.id', ondelete='CASCADE'), nullable=False)
    shipment_item_id = Column(Integer, ForeignKey('dme_shipment_items.id', ondelete='CASCADE'), nullable=True)
    
    # Alert type: short, wrong_item, damaged, extra, backorder
    alert_type = Column(String, nullable=False)
    
    # Quantities for context
    expected_qty = Column(Integer, nullable=True)
    actual_qty = Column(Integer, nullable=True)
    
    notes = Column(Text, nullable=True)
    
    # Resolution tracking
    resolved = Column(Boolean, nullable=False, default=False)
    resolved_at = Column(TIMESTAMP(timezone=True), nullable=True)
    resolved_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    
    # Link to follow-up order if created
    followup_shipment_id = Column(Integer, ForeignKey('dme_shipments.id'), nullable=True)
    
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    shipment = relationship('DMEShipment', foreign_keys=[shipment_id], back_populates='alerts')
    shipment_item = relationship('DMEShipmentItem', back_populates='alerts')
    resolved_by_user = relationship('User', foreign_keys=[resolved_by])
    followup_shipment = relationship('DMEShipment', foreign_keys=[followup_shipment_id])
