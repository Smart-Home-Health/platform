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
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class CareTaskLog(Base):
    __tablename__ = 'care_task_log'
    id = Column(Integer, primary_key=True, autoincrement=True)
    care_task_id = Column(Integer, ForeignKey('care_task.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)  # Always required for logs
    schedule_id = Column(Integer, ForeignKey('care_task_schedule.id'), nullable=True)  # Null if completed without schedule
    
    # Completion details
    completed_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Schedule tracking (only relevant if schedule_id is not null)
    is_scheduled = Column(Boolean, default=False, nullable=False)  # True if this was a scheduled task
    scheduled_time = Column(TIMESTAMP(timezone=True), nullable=True)  # The originally scheduled time for this task
    completed_early = Column(Boolean, default=False, nullable=False)  # True if completed before scheduled time
    completed_late = Column(Boolean, default=False, nullable=False)   # True if completed after scheduled time
    
    # Task completion status
    status = Column(String, default='completed', nullable=False)  # completed, skipped, partial
    
    # Optional details
    notes = Column(Text, nullable=True)  # Any notes about this completion
    performed_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)  # User who completed it
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)

    # Soft delete (undo). When voided_at is set the completion was undone and
    # is excluded from schedule/history by the global soft-delete filter.
    voided_at = Column(TIMESTAMP(timezone=True), nullable=True)
    voided_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)

    # Relationships
    care_task = relationship('CareTask', back_populates='completion_logs')
    patient = relationship('Patient', back_populates='care_task_logs')
    schedule = relationship('CareTaskSchedule', back_populates='completion_logs')
    # User relationship defined in models/users.py to avoid circular imports
    # performed_by_user = relationship('User', back_populates='care_task_logs', foreign_keys=[performed_by])
    nutrition_intake = relationship('NutritionIntake', back_populates='care_task_log')
