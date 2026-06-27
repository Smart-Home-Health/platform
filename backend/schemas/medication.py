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
from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, Boolean, TIMESTAMP
from sqlalchemy.orm import relationship
from schemas import Base


class Medication(Base):
    __tablename__ = 'medication'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this medication belongs to
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=True)  # NULL = global medication
    prescriber_id = Column(Integer, ForeignKey('providers.id'), nullable=True)  # Provider who prescribed this medication
    pharmacy_id = Column(Integer, ForeignKey('businesses.id'), nullable=True)  # Pharmacy business where medication is filled
    name = Column(String, nullable=False)
    rxnorm_code = Column(String(20), nullable=True)  # RxNorm RxCUI (standard drug code, FHIR Medication.code)
    ndc_code = Column(String(20), nullable=True)  # National Drug Code (commonly returned alongside RxNorm)
    concentration = Column(String)
    quantity = Column(Float, nullable=False)
    quantity_unit = Column(String, nullable=False, default='tablets')
    low_stock_threshold = Column(Float, nullable=True)  # NULL = no low-stock alerting for this med
    # How to interpret low_stock_threshold: 'quantity' = raw on-hand amount,
    # 'days' = days of supply left, projected from the med's active schedules
    low_stock_threshold_type = Column(String(20), nullable=False, default='quantity')
    instructions = Column(Text)
    start_date = Column(TIMESTAMP(timezone=True), nullable=True)
    end_date = Column(TIMESTAMP(timezone=True), nullable=True)
    as_needed = Column(Boolean, default=False)
    notes = Column(Text)
    active = Column(Boolean, default=True)
    source = Column(String(50), nullable=True, default='manual')  # manual, epic, etc.
    external_id = Column(String(100), nullable=True, index=True)  # FHIR resource id for dedup
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    
    # Relationships
    patient = relationship('Patient', foreign_keys=[patient_id])
    prescriber = relationship('Provider', foreign_keys=[prescriber_id])
    pharmacy = relationship('Business', foreign_keys=[pharmacy_id])
    schedules = relationship('MedicationSchedule', back_populates='medication', cascade='all, delete-orphan')
    administration_logs = relationship('MedicationLog', back_populates='medication', cascade='all, delete-orphan')
