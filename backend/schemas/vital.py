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
from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, TIMESTAMP, JSON
from sqlalchemy.orm import relationship
from schemas import Base


class Vital(Base):
    __tablename__ = 'vitals'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)
    # Part of the composite PK: TimescaleDB requires the hypertable partition
    # column in every PK/UNIQUE constraint. `id` keeps its own sequence.
    timestamp = Column(TIMESTAMP(timezone=True), primary_key=True, nullable=False)
    vital_type = Column(String, nullable=False)  # e.g., "heart_rate", "blood_pressure", "weight", "spo2"
    vital_group = Column(String, nullable=True)  # Sub-type (e.g., 'systolic', 'diastolic', 'map' for BP)
    value = Column(Float, nullable=False)
    unit = Column(String(20), nullable=True)  # Human-friendly unit: bpm, mmHg, %, °F, °C, kg, lbs, etc.
    code = Column(String(50), nullable=True)  # Standard code, e.g. LOINC "8867-4" (heart rate); identity for FHIR ingest/export
    code_system = Column(String(100), nullable=True, default='http://loinc.org')  # Coding system URI for `code`
    ucum_unit = Column(String(20), nullable=True)  # UCUM unit code (e.g. "/min", "mm[Hg]", "kg") alongside friendly `unit`
    source = Column(String(50), nullable=True, default='manual')  # Integration source: manual, withings, ihealth, shh_serial
    device_id = Column(String(100), nullable=True)  # External device identifier from integration
    external_id = Column(String(100), nullable=True, index=True)  # Vendor's unique measurement ID for deduplication
    raw_data = Column(JSON, nullable=True)  # Original payload from integration for debugging
    notes = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', back_populates='vitals')
