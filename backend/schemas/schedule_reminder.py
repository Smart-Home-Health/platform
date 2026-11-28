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
"""One caregiver-selected reminder for a particular recurring schedule occurrence."""
from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String

from schemas import Base


class ScheduleReminder(Base):
    __tablename__ = 'schedule_reminders'
    __table_args__ = (
        CheckConstraint("category IN ('medications', 'care_tasks', 'nutrition')", name='ck_reminder_category'),
        CheckConstraint('remind_at IS NULL OR remind_at <= deadline_at', name='ck_reminder_deadline'),
        Index('ix_schedule_reminders_pending', 'patient_id', 'category', 'remind_at'),
    )
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), primary_key=True)
    category = Column(String(16), primary_key=True)
    schedule_id = Column(Integer, primary_key=True)
    scheduled_at = Column(DateTime(timezone=True), primary_key=True)
    original_due_at = Column(DateTime(timezone=True), nullable=False)
    deadline_at = Column(DateTime(timezone=True), nullable=False)
    remind_at = Column(DateTime(timezone=True))
    notified_at = Column(DateTime(timezone=True))
    updated_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
    updated_at = Column(DateTime(timezone=True), nullable=False)
