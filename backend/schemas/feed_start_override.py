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
from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint

from schemas import Base


class FeedStartOverride(Base):
    """A caregiver's earliest start for one identified feed occurrence."""
    __tablename__ = 'feed_start_overrides'
    __table_args__ = (UniqueConstraint('patient_id', 'schedule_id', 'scheduled_at',
                                      name='uq_feed_override_occurrence'),)

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False)
    schedule_id = Column(Integer, ForeignKey('nutrition_schedules.id', ondelete='CASCADE'), nullable=False)
    scheduled_at = Column(DateTime(timezone=True), nullable=False)
    earliest_start = Column(DateTime(timezone=True), nullable=False)
    updated_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
    updated_at = Column(DateTime(timezone=True), nullable=False)
