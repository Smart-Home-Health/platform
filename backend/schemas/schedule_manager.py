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
"""Per-profile scheduling rules and recorded bathroom check decisions."""
from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, JSON, String, TIMESTAMP, UniqueConstraint

from schemas import Base


class ScheduleManagerProfile(Base):
    __tablename__ = 'schedule_manager_profiles'

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, unique=True)
    preferences = Column(JSON, nullable=False)
    overnight_schedule_id = Column(Integer, ForeignKey('nutrition_schedules.id', ondelete='SET NULL'))
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))


class ScheduleManagerFeed(Base):
    __tablename__ = 'schedule_manager_feeds'
    __table_args__ = (UniqueConstraint('patient_id', 'schedule_id', name='uq_manager_feed'),)

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False)
    schedule_id = Column(Integer, ForeignKey('nutrition_schedules.id', ondelete='CASCADE'), nullable=False)
    manage_spacing = Column(Boolean, nullable=False)
    prompt_check = Column(Boolean, nullable=False)


class ScheduleManagerAction(Base):
    __tablename__ = 'schedule_manager_actions'
    __table_args__ = (
        UniqueConstraint('patient_id', 'request_id', name='uq_manager_action_request'),
        UniqueConstraint('patient_id', 'check_schedule_id', 'check_scheduled_time', name='uq_manager_fixed_check'),
        Index('ix_manager_action_time', 'patient_id', 'occurred_at'),
    )

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False)
    action = Column(String(16), nullable=False)
    occurred_at = Column(TIMESTAMP(timezone=True), nullable=False)
    recorded_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
    request_id = Column(String(36))
    trigger_schedule_id = Column(Integer, ForeignKey('nutrition_schedules.id', ondelete='SET NULL'))
    trigger_scheduled_at = Column(TIMESTAMP(timezone=True))
    check_schedule_id = Column(Integer, ForeignKey('nutrition_schedules.id', ondelete='SET NULL'))
    check_scheduled_time = Column(TIMESTAMP(timezone=True))
    snooze_until = Column(TIMESTAMP(timezone=True))

class ScheduleManagerRecipient(Base):
    __tablename__ = 'schedule_manager_recipients'

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    # Keep a missing recipient as an unresolved selection to preserve the audience restriction.
    user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
