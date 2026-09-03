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
    
    # Dynamic water budget: a flagged spot has no fixed amount — its
    # suggestion is computed on read from what is left of the daily fluid
    # target, clamped to [fluid_min_ml, fluid_max_ml] (max defaults to the
    # spot's nominal amount).
    fills_fluid_goal = Column(Boolean, default=False, nullable=False)
    fluid_min_ml = Column(Float, nullable=True)
    fluid_max_ml = Column(Float, nullable=True)

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
    components = relationship(
        'NutritionScheduleComponent',
        back_populates='schedule',
        cascade='all, delete-orphan',
        order_by='NutritionScheduleComponent.sort_order',
    )


class NutritionScheduleComponent(Base):
    """One item of a scheduled feed's default mix.

    Mirrors NutritionPresetComponent: completing the schedule expands each
    component into its own nutrition_intake row sharing an event_group_id.
    Schedules without components fall back to the legacy default_* columns.
    """
    __tablename__ = 'nutrition_schedule_components'

    id = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id = Column(Integer, ForeignKey('nutrition_schedules.id', ondelete='CASCADE'), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey('nutrition_items.id', ondelete='CASCADE'), nullable=False)

    amount = Column(Float, nullable=False)
    amount_unit = Column(String(50), nullable=False)

    # Tube-feed delivery, when this component is a feed.
    feed_route = Column(String(20), nullable=True)
    rate_ml_per_hr = Column(Float, nullable=True)
    duration_minutes = Column(Float, nullable=True)

    # Post-feed water flush: not logged with the meal — completing the feed
    # spawns a follow-up event due after the feed has run.
    is_flush = Column(Boolean, default=False, nullable=False)

    sort_order = Column(Integer, default=0, nullable=False)

    schedule = relationship('NutritionSchedule', back_populates='components')
    item = relationship('NutritionItem', foreign_keys=[item_id])

    # Denormalized from the saved item so Pydantic's from_attributes picks
    # them up directly and the completion form can prefill names and scaled
    # facts without a second request.
    @property
    def item_name(self):
        return self.item.name if self.item else None

    @property
    def item_type(self):
        return self.item.item_type if self.item else None

    @property
    def calories_per_unit(self):
        return self.item.calories_per_unit if self.item else None

    @property
    def protein_per_unit(self):
        return self.item.protein_per_unit if self.item else None

    @property
    def carbs_per_unit(self):
        return self.item.carbs_per_unit if self.item else None

    @property
    def fat_per_unit(self):
        return self.item.fat_per_unit if self.item else None

    @property
    def fiber_per_unit(self):
        return self.item.fiber_per_unit if self.item else None

    @property
    def sodium_per_unit(self):
        return self.item.sodium_per_unit if self.item else None
