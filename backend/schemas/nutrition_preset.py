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
"""SQLAlchemy models for reusable nutrition *combinations*.

A preset is a repeated grouping of items -- "Peptamen 250 mL + 60 mL flush,
pump" -- that a caregiver logs as one tap. Applying it still writes one
nutrition_intake row per component, sharing an event_group_id, so the
underlying records stay correctly separated for fluid and calorie math.
"""
from sqlalchemy import Column, Integer, Float, String, Boolean, Text, ForeignKey, TIMESTAMP
from sqlalchemy.orm import relationship
from datetime import datetime
from schemas import Base


class NutritionPreset(Base):
    """A named, reusable set of intake components."""
    __tablename__ = 'nutrition_presets'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    # Null means the preset is shared across every patient on the account.
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=True, index=True)

    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    # Optional meal context applied to every component when logged.
    meal_type = Column(String(20), nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    patient = relationship('Patient', foreign_keys=[patient_id])
    components = relationship(
        'NutritionPresetComponent',
        back_populates='preset',
        cascade='all, delete-orphan',
        order_by='NutritionPresetComponent.sort_order',
    )


class NutritionPresetComponent(Base):
    """One intake row that a preset expands into."""
    __tablename__ = 'nutrition_preset_components'

    id = Column(Integer, primary_key=True, autoincrement=True)
    preset_id = Column(Integer, ForeignKey('nutrition_presets.id', ondelete='CASCADE'), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey('nutrition_items.id', ondelete='CASCADE'), nullable=False)

    amount = Column(Float, nullable=False)
    amount_unit = Column(String(50), nullable=False)

    # Tube-feed delivery, when this component is a feed.
    feed_route = Column(String(20), nullable=True)
    rate_ml_per_hr = Column(Float, nullable=True)
    duration_minutes = Column(Float, nullable=True)

    sort_order = Column(Integer, default=0, nullable=False)

    preset = relationship('NutritionPreset', back_populates='components')
    item = relationship('NutritionItem', foreign_keys=[item_id])
