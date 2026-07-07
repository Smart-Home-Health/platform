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
from sqlalchemy import Column, Integer, String, Text, ForeignKey, TIMESTAMP, UniqueConstraint
from sqlalchemy.orm import relationship
from schemas import Base


class EquipmentProviderAlias(Base):
    """A provider-specific item number for a tracked supply.

    The same supply arrives from different DME providers under different item
    numbers (and occasionally under several numbers from one provider — e.g.
    a provider SKU and a manufacturer/customer number on the same slip line).
    Scan matching checks Equipment.item_number first, then these aliases, so
    slips from any provider auto-link to "what we call it".
    """
    __tablename__ = 'equipment_provider_aliases'
    __table_args__ = (
        UniqueConstraint('equipment_id', 'supplier_id', 'item_number', name='uq_equipment_alias'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    equipment_id = Column(Integer, ForeignKey('equipment.id', ondelete='CASCADE'), nullable=False, index=True)
    # Nullable: old packing slips may predate the provider existing as a Business
    supplier_id = Column(Integer, ForeignKey('businesses.id', ondelete='SET NULL'), nullable=True)
    item_number = Column(String, nullable=False, index=True)
    raw_description = Column(Text, nullable=True)  # Distributor's exact slip wording, preserved
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)

    # Relationships
    equipment = relationship('Equipment', back_populates='provider_aliases')
    supplier = relationship('Business', foreign_keys=[supplier_id])
