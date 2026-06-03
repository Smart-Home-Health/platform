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
