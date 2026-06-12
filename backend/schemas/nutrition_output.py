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
SQLAlchemy model for patient output logs - bowel movements, urination tracking
"""
from sqlalchemy import Column, Integer, Float, String, ForeignKey, TIMESTAMP, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from schemas import Base


class NutritionOutput(Base):
    """Output logs for tracking bowel movements, urination, etc."""
    __tablename__ = 'nutrition_outputs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    care_task_log_id = Column(Integer, ForeignKey('care_task_log.id'), nullable=True)  # Link to care task completion
    
    # Output type: 'urine', 'bowel', 'vomit', 'other'
    output_type = Column(String(50), nullable=False)
    
    # Bowel movement specifics
    # consistency: 'solid', 'soft', 'loose', 'watery', 'diarrhea', 'constipated', 'pellets'
    consistency = Column(String(50), nullable=True)
    
    # Color tracking (important for health monitoring)
    # 'brown', 'dark_brown', 'light_brown', 'yellow', 'green', 'red', 'black', 'clay', 'other'
    color = Column(String(50), nullable=True)
    
    # Amount/volume
    amount = Column(Float, nullable=True)  # Quantity (if measurable)
    amount_unit = Column(String(20), nullable=True)  # 'ml', 'oz', 'small', 'medium', 'large'
    
    # For urine specifically
    # clarity: 'clear', 'cloudy', 'dark', 'bloody'
    clarity = Column(String(50), nullable=True)
    
    # Diaper specific
    is_diaper = Column(Boolean, default=False, nullable=False)  # Was this a diaper change?
    diaper_wetness = Column(String(20), nullable=True)  # 'dry', 'wet', 'soaked'
    diaper_soiled = Column(Boolean, nullable=True)  # Did diaper have bowel movement?
    
    # Catheter specific
    is_catheter = Column(Boolean, default=False, nullable=False)
    catheter_bag_emptied = Column(Boolean, nullable=True)

    # Uncontained / accident (e.g. on the floor, in clothes). Mutually
    # exclusive with is_diaper / is_catheter in the UI, but stored as an
    # independent flag for query simplicity.
    is_accident = Column(Boolean, default=False, nullable=False)
    
    # Timing
    occurred_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Additional tracking
    notes = Column(Text, nullable=True)
    recorded_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    
    # Concerns/alerts
    has_blood = Column(Boolean, default=False, nullable=False)
    has_mucus = Column(Boolean, default=False, nullable=False)
    pain_reported = Column(Boolean, default=False, nullable=False)
    straining = Column(Boolean, default=False, nullable=False)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Soft delete (undo). When voided_at is set the output was undone and is
    # excluded from schedule/history by the global soft-delete filter.
    voided_at = Column(TIMESTAMP(timezone=True), nullable=True)
    voided_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)

    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    care_task_log = relationship('CareTaskLog', foreign_keys=[care_task_log_id])
