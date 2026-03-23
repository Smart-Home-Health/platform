from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class NutritionIntake(Base):
    __tablename__ = 'nutrition_intake'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this intake belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    care_task_log_id = Column(Integer, ForeignKey('care_task_log.id'), nullable=True)  # Link to care task completion
    schedule_id = Column(Integer, ForeignKey('nutrition_schedules.id', ondelete='SET NULL'), nullable=True)  # Link to nutrition schedule
    
    # Item details
    item_name = Column(String, nullable=False)  # e.g., "Peptamen", "Water", "Apple"
    item_type = Column(String, nullable=False)  # 'food', 'liquid', 'supplement'
    
    # Nutritional information
    amount = Column(Float, nullable=False)  # Quantity consumed
    amount_unit = Column(String, nullable=False)  # 'ml', 'oz', 'cups', 'grams', 'servings'
    
    # Optional nutritional data
    calories = Column(Float, nullable=True)  # Calories per serving/amount
    protein_grams = Column(Float, nullable=True)
    carbs_grams = Column(Float, nullable=True)
    fat_grams = Column(Float, nullable=True)
    fiber_grams = Column(Float, nullable=True)
    sodium_mg = Column(Float, nullable=True)
    
    # Timing and context
    consumed_at = Column(TIMESTAMP(timezone=True), nullable=False)  # When it was consumed
    scheduled_time = Column(TIMESTAMP(timezone=True), nullable=True)  # The scheduled time this intake was for (if from schedule)
    meal_type = Column(String, nullable=True)  # 'breakfast', 'lunch', 'dinner', 'snack', 'supplement'
    
    # Additional tracking
    notes = Column(Text, nullable=True)  # Any notes about consumption
    recorded_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)  # User who recorded this entry
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    care_task_log = relationship('CareTaskLog', back_populates='nutrition_intake')
    schedule = relationship('NutritionSchedule', foreign_keys=[schedule_id])
    # User relationship defined in models/users.py to avoid circular imports
    # recorded_by_user = relationship('User', back_populates='nutrition_intakes', foreign_keys=[recorded_by])
