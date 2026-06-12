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


class CareTask(Base):
    __tablename__ = 'care_task'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this task belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # NULL = global task template
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey('care_task_category.id'), nullable=True)  # Reference to category
    active = Column('is_active', Boolean, default=True, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    category = relationship('CareTaskCategory', back_populates='care_tasks')
    schedules = relationship('CareTaskSchedule', back_populates='care_task', cascade='all, delete-orphan')
    completion_logs = relationship('CareTaskLog', back_populates='care_task', cascade='all, delete-orphan')
