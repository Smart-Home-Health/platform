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
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    care_task_log = relationship('CareTaskLog', foreign_keys=[care_task_log_id])
