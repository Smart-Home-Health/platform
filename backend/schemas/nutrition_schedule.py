"""
SQLAlchemy model for nutrition schedules - meals, hydration, bathroom checks
"""
from sqlalchemy import Column, Integer, Float, String, ForeignKey, TIMESTAMP, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from schemas import Base


class NutritionSchedule(Base):
    """Schedules for meals, hydration, and bathroom checks"""
    __tablename__ = 'nutrition_schedules'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    
    # Schedule type: 'meal', 'hydration', 'snack', 'supplement', 'diaper_check', 'bathroom_assist', 'catheter_care'
    schedule_type = Column(String(50), nullable=False)
    
    # Schedule name/label (e.g., "Morning Feed", "Afternoon Water", "Bedtime Diaper Check")
    name = Column(String(200), nullable=False)
    
    # Cron expression for schedule timing (same format as medications)
    cron_expression = Column(String(100), nullable=False)
    
    # For meals/hydration - default amounts
    default_item_name = Column(String(200), nullable=True)  # e.g., "Peptamen", "Water"
    default_amount = Column(Float, nullable=True)
    default_amount_unit = Column(String(50), nullable=True)  # 'ml', 'oz', 'cups'
    default_calories = Column(Float, nullable=True)
    
    # Configuration
    is_active = Column(Boolean, default=True, nullable=False)
    create_care_task = Column(Boolean, default=True, nullable=False)  # Auto-create care task?
    
    # Reminder settings
    reminder_minutes_before = Column(Integer, default=15, nullable=True)
    
    # Instructions
    instructions = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
