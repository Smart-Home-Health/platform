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
Business SQLAlchemy ORM model
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.orm import relationship
from schemas import Base


class BusinessTypeAssignment(Base):
    """Junction table for many-to-many relationship between businesses and types"""
    __tablename__ = 'business_type_assignments'
    id = Column(Integer, primary_key=True, autoincrement=True)
    business_id = Column(Integer, ForeignKey('businesses.id', ondelete='CASCADE'), nullable=False)
    type_name = Column(String, nullable=False)  # 'hospital', 'pharmacy', 'rehab', 'school', 'therapy', 'lab', 'dme', etc.
    
    # Relationship back to business
    business = relationship('Business', back_populates='type_assignments')


class Business(Base):
    __tablename__ = 'businesses'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this business belongs to
    name = Column(String, nullable=False)
    # Legacy field - kept for backwards compatibility, will be deprecated
    business_type = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    website = Column(String, nullable=True)
    
    # Address information
    address_line1 = Column(String, nullable=True)
    address_line2 = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    zip_code = Column(String, nullable=True)
    country = Column(String, nullable=True, default='USA')
    
    # Business details
    description = Column(Text, nullable=True)
    hours_of_operation = Column(Text, nullable=True)  # JSON or text format
    emergency_contact = Column(String, nullable=True)
    
    # Status
    active = Column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    providers = relationship('Provider', back_populates='business')
    type_assignments = relationship('BusinessTypeAssignment', back_populates='business', cascade='all, delete-orphan')
    
    @property
    def types(self):
        """Get list of type names for this business"""
        return [ta.type_name for ta in self.type_assignments]
