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
"""SQLAlchemy model for the reusable nutrition item library.

Replaces the hardcoded `/api/nutrition-presets` dict with something the user
can actually add to. Nutrition values are stored *per unit* rather than per
serving so the logging sheet can scale them to whatever amount was given.
"""
from sqlalchemy import Column, Integer, Float, String, Boolean, ForeignKey, TIMESTAMP, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from schemas import Base


class NutritionItem(Base):
    """A saved food, fluid, supplement or tube-feed formula."""
    __tablename__ = 'nutrition_items'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    # Null means the item is shared across every patient on the account.
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=True, index=True)

    name = Column(String(200), nullable=False)
    item_type = Column(String(20), nullable=False)  # food | liquid | supplement | tube_feed
    brand = Column(String(200), nullable=True)

    # Prefilled when the item is picked in the sheet.
    default_amount = Column(Float, nullable=True)
    default_amount_unit = Column(String(50), nullable=True)

    # Nutrition per ONE default_amount_unit (per ml, per gram, per serving...).
    # The sheet multiplies these by the amount actually logged.
    calories_per_unit = Column(Float, nullable=True)
    protein_per_unit = Column(Float, nullable=True)
    carbs_per_unit = Column(Float, nullable=True)
    fat_per_unit = Column(Float, nullable=True)
    fiber_per_unit = Column(Float, nullable=True)
    sodium_per_unit = Column(Float, nullable=True)

    # Reserved for the barcode lookup work -- the scan dialogs already exist
    # (ExternalScanDialog / BarcodeScanDialog) but are not wired up yet.
    barcode = Column(String(64), nullable=True, index=True)

    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    patient = relationship('Patient', foreign_keys=[patient_id])

    __table_args__ = (
        UniqueConstraint('account_id', 'patient_id', 'name', name='uq_nutrition_item_name'),
    )
