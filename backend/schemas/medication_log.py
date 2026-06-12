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
from sqlalchemy import Column, Integer, Float, Text, ForeignKey, Boolean, TIMESTAMP, String
from sqlalchemy.orm import relationship
from schemas import Base


class MedicationLog(Base):
    __tablename__ = 'medication_log'
    id = Column(Integer, primary_key=True, autoincrement=True)
    medication_id = Column(Integer, ForeignKey('medication.id'), nullable=False)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)  # Always required for logs
    schedule_id = Column(Integer, ForeignKey('medication_schedule.id'), nullable=True)  # Null if administered without schedule
    
    # Administration details
    administered_at = Column(TIMESTAMP(timezone=True), nullable=False)
    dose_amount = Column(Float, nullable=False)  # Amount actually given - unit inherited from medication
    
    # Schedule tracking (only relevant if schedule_id is not null)
    is_scheduled = Column(Boolean, default=False, nullable=False)  # True if this was a scheduled dose
    scheduled_time = Column(TIMESTAMP(timezone=True), nullable=True)  # The originally scheduled time for this dose
    administered_early = Column(Boolean, default=False, nullable=False)  # True if given before scheduled time
    administered_late = Column(Boolean, default=False, nullable=False)   # True if given after scheduled time
    
    # Optional details
    notes = Column(Text, nullable=True)  # Any notes about this administration
    administered_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)  # User who administered it
    
    # Timestamps
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)

    # Soft delete (undo). When voided_at is set the administration was undone and
    # is excluded from schedule/history/adherence by the global soft-delete filter.
    voided_at = Column(TIMESTAMP(timezone=True), nullable=True)
    voided_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)

    # Relationships
    medication = relationship('Medication', back_populates='administration_logs')
    patient = relationship('Patient', back_populates='medication_logs')
    schedule = relationship('MedicationSchedule', back_populates='administration_logs')
    # User relationship defined in models/users.py to avoid circular imports
    # administered_by_user = relationship('User', back_populates='medication_logs', foreign_keys=[administered_by])
