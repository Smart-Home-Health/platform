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
"""SQLAlchemy model for post-feed flush follow-ups.

The app's first one-off (non-cron) scheduled event: completing a feed whose
mix carries an is_flush component spawns one of these, due at
completed_at + feed duration. Running it logs the water as a liquid intake;
skipping records an explicit "decided against it" (smoothie-heavy mixes
already carry enough water) distinct from "forgot".
"""
from sqlalchemy import Column, Integer, Float, String, Text, ForeignKey, TIMESTAMP
from sqlalchemy.orm import relationship
from datetime import datetime
from schemas import Base


class NutritionFlushFollowup(Base):
    __tablename__ = 'nutrition_flush_followups'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    schedule_id = Column(Integer, ForeignKey('nutrition_schedules.id', ondelete='SET NULL'), nullable=True)

    # The feed occurrence that spawned this — the idempotency key together
    # with schedule_id (a feed completed twice must not queue two flushes).
    feed_scheduled_time = Column(TIMESTAMP(timezone=True), nullable=True)
    # The feed's intake event group; feed undo voids pending follow-ups by it.
    source_event_group_id = Column(String(36), nullable=False, index=True)

    item_id = Column(Integer, ForeignKey('nutrition_items.id', ondelete='SET NULL'), nullable=True)
    item_name = Column(String(200), nullable=False)
    amount = Column(Float, nullable=False)
    amount_unit = Column(String(50), nullable=False, default='ml')

    due_at = Column(TIMESTAMP(timezone=True), nullable=False)
    status = Column(String(20), nullable=False, default='pending')  # pending|completed|skipped

    # The flush's own intake event group; flush undo restores pending by it.
    completed_intake_group_id = Column(String(36), nullable=True, index=True)
    completed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    completed_by = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    # Soft delete (registered in soft_delete._SOFT_DELETE_MODELS): voided
    # follow-ups vanish from every read; skipped ones stay visible.
    voided_at = Column(TIMESTAMP(timezone=True), nullable=True)
    voided_by = Column(Integer, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    patient = relationship('Patient', foreign_keys=[patient_id])
    schedule = relationship('NutritionSchedule', foreign_keys=[schedule_id])
    item = relationship('NutritionItem', foreign_keys=[item_id])
