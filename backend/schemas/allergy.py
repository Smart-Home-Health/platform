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
"""
AllergyIntolerance SQLAlchemy ORM model

FHIR-aligned (HL7 FHIR R4 `AllergyIntolerance`) so allergies imported from an EHR
(e.g. Epic patient-access FHIR) round-trip losslessly. Despite the package name,
this is a SQLAlchemy ORM class, not a Pydantic schema (see CLAUDE.md "Models vs
schemas").
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, Date, TIMESTAMP, ForeignKey
from sqlalchemy.orm import relationship
from schemas import Base


class AllergyIntolerance(Base):
    """Track patient allergies / intolerances, aligned to FHIR AllergyIntolerance."""
    __tablename__ = 'allergies'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id'), nullable=False)

    # What the patient is allergic to
    substance = Column(String(255), nullable=False)  # Human-readable allergen name
    code = Column(String(50), nullable=True)  # Standard code (RxNorm / SNOMED / UNII)
    code_system = Column(String(100), nullable=True)  # Coding system URI for `code`

    # FHIR-aligned classification (stored as the FHIR-valued strings)
    category = Column(String(20), nullable=True)  # medication | food | environment | biologic
    criticality = Column(String(20), nullable=True)  # low | high | unable-to-assess
    clinical_status = Column(String(20), nullable=False, default='active')  # active | inactive | resolved
    verification_status = Column(String(20), nullable=False, default='confirmed')  # confirmed | unconfirmed | refuted | entered-in-error

    # Reaction details
    reaction = Column(Text, nullable=True)  # Manifestations description
    severity = Column(String(20), nullable=True)  # mild | moderate | severe
    onset_date = Column(Date, nullable=True)

    # Provenance / ingest
    source = Column(String(50), nullable=True, default='manual')  # manual, epic, etc.
    external_id = Column(String(100), nullable=True, index=True)  # Vendor/FHIR resource id for dedup

    notes = Column(Text, nullable=True)
    active = Column(Boolean, default=True, nullable=False)

    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=True)

    # Relationships
    patient = relationship('Patient', back_populates='allergies')
    created_by_user = relationship('User', foreign_keys=[created_by])
