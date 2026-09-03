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
SQLAlchemy model for patient output logs - bowel movements, urination tracking
"""
from sqlalchemy import Column, Integer, SmallInteger, Float, String, ForeignKey, TIMESTAMP, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from schemas import Base


class NutritionOutput(Base):
    """Output logs for tracking bowel movements, urination, etc."""
    __tablename__ = 'nutrition_outputs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    care_task_log_id = Column(Integer, ForeignKey('care_task_log.id'), nullable=True)  # Link to care task completion
    
    # Output type: 'urine', 'bowel', 'vomit', 'other'
    output_type = Column(String(50), nullable=False)

    # One physical event (e.g. a mixed diaper) is stored as one row per
    # output_type. This groups those rows explicitly instead of re-guessing the
    # association from a time window -- which four separate call sites used to
    # do, with four different rules that disagreed with each other.
    event_group_id = Column(String(36), nullable=True, index=True)

    # Where it happened: 'restroom', 'diaper', 'catheter', 'accident'. Kept in
    # sync with the is_diaper / is_catheter / is_accident booleans below, which
    # remain readable by existing consumers. See nutrition_vocab.
    location = Column(String(20), nullable=True)
    
    # Bowel movement specifics
    # consistency: 'solid', 'soft', 'loose', 'watery', 'diarrhea', 'constipated', 'pellets'
    # Derived from bristol_scale on write (nutrition_vocab.consistency_for_bristol)
    # and still populated for the monitoring timeline and overview renderers.
    consistency = Column(String(50), nullable=True)

    # Standardized Bristol stool scale, 1-7. What the rebuilt sheet collects.
    bristol_scale = Column(SmallInteger, nullable=True)
    
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
