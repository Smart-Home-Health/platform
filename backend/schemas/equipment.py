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
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class Equipment(Base):
    __tablename__ = 'equipment'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this equipment belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # NULL = shared equipment
    name = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    scheduled_replacement = Column(Boolean, nullable=False, default=True)
    last_changed = Column(TIMESTAMP(timezone=True), nullable=True)  # Nullable when scheduled_replacement is False
    useful_days = Column(Integer, nullable=True)  # Nullable when scheduled_replacement is False
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Supply/inventory tracking fields
    item_number = Column(String, nullable=True)  # Supplier SKU/reference number
    description = Column(Text, nullable=True)  # Detailed item description
    category = Column(String, nullable=True, default='equipment')  # equipment, supply, consumable
    tracking_level = Column(String, nullable=True, default='item')  # item, box, none
    default_manufacturer = Column(String, nullable=True)  # Usual manufacturer name
    unit_of_measure = Column(String, nullable=True)  # EA, BX, PK, etc.
    unit_size = Column(Integer, nullable=True)  # Pieces per unit (e.g., 100 for BX)
    unit_description = Column(String, nullable=True)  # e.g., "BX = 100 EA", "PK = 10 EA"
    reorder_point = Column(Integer, nullable=True)  # Low stock alert threshold
    par_level = Column(Integer, nullable=True)  # Target stock level
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    change_logs = relationship('EquipmentChangeLog', back_populates='equipment')
    shipment_items = relationship('DMEShipmentItem', back_populates='equipment')
