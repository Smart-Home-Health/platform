# Smart Home Health Hub
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
Symptom logging schema
"""
from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, TIMESTAMP, Boolean
from sqlalchemy.orm import relationship
from schemas import Base


class Symptom(Base):
    """
    Symptom model for logging patient symptoms.
    Symptoms can be categorized by type, severity, and body location.
    """
    __tablename__ = 'symptoms'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this symptom belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    timestamp = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Symptom details
    symptom_type = Column(String(100), nullable=False)  # e.g., 'pain', 'nausea', 'fatigue', 'cough', etc.
    severity = Column(Integer, nullable=True)  # 1-10 scale
    location = Column(String(100), nullable=True)  # Body location if applicable (e.g., 'head', 'chest', 'abdomen')
    duration = Column(String(50), nullable=True)  # e.g., '30 minutes', '2 hours', 'ongoing'
    
    # Additional details
    description = Column(Text, nullable=True)  # Free-text description
    notes = Column(Text, nullable=True)
    
    # Metadata
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='symptoms')
