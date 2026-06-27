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
Provider SQLAlchemy ORM model
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.orm import relationship
from schemas import Base


class Provider(Base):
    __tablename__ = 'providers'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this provider belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    business_id = Column(Integer, ForeignKey('businesses.id'), nullable=True)  # Optional association with business
    
    # Provider details
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    title = Column(String, nullable=True)  # Dr., RN, PT, OT, etc.
    specialty = Column(String, nullable=True)  # Cardiologist, Physical Therapist, etc.
    provider_type = Column(String, nullable=False)  # 'medical', 'therapy', 'rehab', 'school', 'pharmacy', etc.
    
    # Contact information
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    fax = Column(String, nullable=True)
    
    # Professional details
    license_number = Column(String, nullable=True)
    npi_number = Column(String, nullable=True)  # National Provider Identifier
    department = Column(String, nullable=True)
    
    # Notes and status
    notes = Column(Text, nullable=True)
    is_primary = Column(Boolean, default=False, nullable=False)  # Primary provider for this type
    active = Column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='providers')
    business = relationship('Business', back_populates='providers')
