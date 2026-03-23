"""
SQLAlchemy model for patient nutrition goals - daily targets for calories, water, etc.
"""
from sqlalchemy import Column, Integer, Float, ForeignKey, TIMESTAMP, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from schemas import Base


class NutritionGoal(Base):
    """Daily nutrition goals for a patient"""
    __tablename__ = 'nutrition_goals'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this goal belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    
    # Fluid targets
    water_ml_target = Column(Float, nullable=True)  # Daily water target in ml
    total_fluid_ml_target = Column(Float, nullable=True)  # Total fluid target (includes food liquids)
    
    # Caloric targets
    calories_target = Column(Float, nullable=True)  # Daily calorie target
    calories_min = Column(Float, nullable=True)  # Minimum calories
    calories_max = Column(Float, nullable=True)  # Maximum calories (for restrictions)
    
    # Macronutrient targets
    protein_grams_target = Column(Float, nullable=True)
    carbs_grams_target = Column(Float, nullable=True)
    fat_grams_target = Column(Float, nullable=True)
    fiber_grams_target = Column(Float, nullable=True)
    
    # Restriction targets (maximums)
    sodium_mg_max = Column(Float, nullable=True)  # Max sodium (for low-sodium diets)
    sugar_grams_max = Column(Float, nullable=True)  # Max sugar
    potassium_mg_max = Column(Float, nullable=True)  # Max potassium (kidney patients)
    phosphorus_mg_max = Column(Float, nullable=True)  # Max phosphorus (kidney patients)
    
    # Output targets (for tracking)
    urine_output_ml_min = Column(Float, nullable=True)  # Minimum expected daily urine output
    bowel_movements_target = Column(Integer, nullable=True)  # Expected bowel movements per day
    
    # Configuration
    is_active = Column(Boolean, default=True, nullable=False)
    effective_date = Column(TIMESTAMP(timezone=True), nullable=False)  # When these goals take effect
    end_date = Column(TIMESTAMP(timezone=True), nullable=True)  # When goals expire (null = ongoing)
    
    notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
