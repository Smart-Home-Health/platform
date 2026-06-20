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
from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class PulseOxData(Base):
    __tablename__ = 'pulse_ox_data'
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    # Part of the composite PK: TimescaleDB requires the hypertable partition
    # column in every PK/UNIQUE constraint. `id` keeps its own sequence.
    timestamp = Column(TIMESTAMP(timezone=True), primary_key=True, nullable=False)
    spo2 = Column(Integer)
    bpm = Column(Integer)
    pa = Column(Float)
    status = Column(String)
    motion = Column(String)
    spo2_alarm = Column(String)
    hr_alarm = Column(String)
    raw_data = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='pulse_ox_data')
