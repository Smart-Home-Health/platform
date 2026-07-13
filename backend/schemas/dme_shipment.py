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

    # Standing order ("usual monthly order") support: a template shipment holds
    # the recurring expected line items and never receives inventory itself.
    # Deliveries created from a template link back via template_source_id.
    is_template = Column(Boolean, nullable=False, default=False)
    template_source_id = Column(Integer, ForeignKey('dme_shipments.id', ondelete='SET NULL'), nullable=True)
    
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
    parent_shipment = relationship('DMEShipment', remote_side=[id], foreign_keys=[parent_shipment_id], backref='backorder_shipments')
    template_source = relationship('DMEShipment', remote_side=[id], foreign_keys=[template_source_id], backref='deliveries')
    items = relationship('DMEShipmentItem', back_populates='shipment', cascade='all, delete-orphan')
    alerts = relationship('DMEShipmentAlert', back_populates='shipment', cascade='all, delete-orphan', foreign_keys='DMEShipmentAlert.shipment_id')
    documents = relationship('DMEShipmentDocument', back_populates='shipment', cascade='all, delete-orphan')


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

    # The invoice says it shipped, but it never showed up in the box. Distinct
    # from backordered (supplier admits it's coming later) — this is a claim
    # we're disputing, flagged so it can be chased with the supplier.
    flagged_missing = Column(Boolean, nullable=False, default=False)
    
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


class DMEShipmentDocument(Base):
    """
    Packing-slip images/documents attached to a shipment.
    Multiple rows per shipment support multi-page slips ("Page 1 of 3").
    Blobs live on the ./data volume via document_store; this row is metadata,
    mirroring the ClinicalDocument pattern.
    """
    __tablename__ = 'dme_shipment_documents'
    id = Column(Integer, primary_key=True, autoincrement=True)

    shipment_id = Column(Integer, ForeignKey('dme_shipments.id', ondelete='CASCADE'), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)

    document_type = Column(String, nullable=False, default='packing-slip')
    title = Column(String, nullable=True)
    content_type = Column(String, nullable=True)  # MIME type (image/jpeg, application/pdf, ...)
    storage = Column(String, nullable=False, default='file')
    file_path = Column(String(500), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    page_number = Column(Integer, nullable=True)  # e.g. "Page 1 of 3"

    uploaded_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)

    # Relationships
    shipment = relationship('DMEShipment', back_populates='documents')
    uploaded_by_user = relationship('User', foreign_keys=[uploaded_by])
