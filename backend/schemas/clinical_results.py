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
"""
Clinical result / imaging ORM models, aligned to FHIR R4.

These hold richer EHR data that does not fit the flat `Vital` model — primarily
**blood work** (lab panels + discrete results) and **imaging narratives** (e.g. MRI
radiologist reports). Populated by the Epic FHIR ingest connector.

- ``DiagnosticReport``  -> FHIR DiagnosticReport (panel/study wrapper; the imaging
  narrative lives in ``conclusion``)
- ``LabResult``         -> FHIR Observation (category laboratory) — discrete bloods
- ``ClinicalDocument``  -> FHIR DocumentReference / DiagnosticReport.presentedForm
  (PDF/report blob metadata; blobs themselves live on the ./data volume)
- ``ImagingStudy``      -> FHIR ImagingStudy (study metadata only; no DICOM pixels)

Despite living under `schemas/`, these are SQLAlchemy ORM classes (see CLAUDE.md).
"""
from sqlalchemy import (
    Column, Integer, String, Float, Text, ForeignKey, TIMESTAMP, JSON, LargeBinary,
)
from sqlalchemy.orm import relationship
from schemas import Base


class DiagnosticReport(Base):
    """FHIR DiagnosticReport — lab panel or imaging study wrapper.

    For imaging (MRI/CT/X-ray) the radiologist's narrative is stored in
    ``conclusion``; discrete lab values link back via ``LabResult.report``.
    """
    __tablename__ = 'diagnostic_reports'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)

    code = Column(String(50), nullable=True)  # LOINC panel/study code
    code_system = Column(String(100), nullable=True)
    display = Column(String(255), nullable=True)  # e.g. "MRI Brain w/o contrast", "CBC panel"
    category = Column(String(20), nullable=True)  # laboratory | imaging | pathology

    status = Column(String(20), nullable=True)  # registered|partial|preliminary|final|amended|corrected
    effective_datetime = Column(TIMESTAMP(timezone=True), nullable=True)
    issued = Column(TIMESTAMP(timezone=True), nullable=True)
    performer = Column(String(255), nullable=True)  # Performing lab / radiologist (text)

    conclusion = Column(Text, nullable=True)  # Narrative / radiologist impression (the MRI report text)

    source = Column(String(50), nullable=True, default='manual')  # epic, manual, etc.
    external_id = Column(String(100), nullable=True, index=True)  # FHIR resource id (dedup)
    raw_data = Column(JSON, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)

    # Relationships
    patient = relationship('Patient')
    results = relationship('LabResult', back_populates='report', cascade='all, delete-orphan')
    attachments = relationship('ClinicalDocument', back_populates='report', cascade='all, delete-orphan')
    imaging = relationship('ImagingStudy', back_populates='report', cascade='all, delete-orphan')


class LabResult(Base):
    """FHIR Observation (category laboratory) — a discrete blood-work result."""
    __tablename__ = 'lab_results'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    diagnostic_report_id = Column(Integer, ForeignKey('diagnostic_reports.id', ondelete='CASCADE'), nullable=True, index=True)

    code = Column(String(50), nullable=True)  # LOINC, e.g. "718-7" (Hemoglobin)
    code_system = Column(String(100), nullable=True, default='http://loinc.org')
    display = Column(String(255), nullable=True)

    value = Column(Float, nullable=True)  # Numeric result
    value_string = Column(String(255), nullable=True)  # Non-numeric result (e.g. "Negative")
    unit = Column(String(50), nullable=True)  # Human-friendly unit
    ucum_unit = Column(String(50), nullable=True)  # UCUM unit code

    reference_range = Column(String(100), nullable=True)  # Display string, e.g. "13.5-17.5"
    reference_low = Column(Float, nullable=True)
    reference_high = Column(Float, nullable=True)
    abnormal_flag = Column(String(10), nullable=True)  # H|L|HH|LL|A|N
    interpretation = Column(String(100), nullable=True)

    effective_datetime = Column(TIMESTAMP(timezone=True), nullable=True)

    source = Column(String(50), nullable=True, default='manual')
    external_id = Column(String(100), nullable=True, index=True)
    raw_data = Column(JSON, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), nullable=False)

    # Relationships
    patient = relationship('Patient')
    report = relationship('DiagnosticReport', back_populates='results')


class ClinicalDocument(Base):
    """FHIR DocumentReference / DiagnosticReport.presentedForm — a report blob.

    The blob bytes live on the ./data volume (``file_path``) by default to keep
    Postgres lean; ``data`` (inline bytea) is supported as a fallback.
    """
    __tablename__ = 'clinical_documents'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    diagnostic_report_id = Column(Integer, ForeignKey('diagnostic_reports.id', ondelete='CASCADE'), nullable=True, index=True)

    document_type = Column(String(30), nullable=True)  # imaging-report|lab-report|clinical-note|ccd|other
    title = Column(String(255), nullable=True)
    content_type = Column(String(100), nullable=True)  # MIME, e.g. application/pdf

    storage = Column(String(10), nullable=False, default='file')  # file | db
    file_path = Column(String(500), nullable=True)  # Path on the ./data volume when storage='file'
    data = Column(LargeBinary, nullable=True)  # Inline bytes when storage='db'
    size_bytes = Column(Integer, nullable=True)

    fhir_resource_type = Column(String(30), nullable=True)  # DocumentReference | DiagnosticReport
    source = Column(String(50), nullable=True, default='manual')
    external_id = Column(String(100), nullable=True, index=True)

    created_at = Column(TIMESTAMP(timezone=True), nullable=False)

    # Relationships
    patient = relationship('Patient')
    report = relationship('DiagnosticReport', back_populates='attachments')


class ImagingStudy(Base):
    """FHIR ImagingStudy — study metadata only (no DICOM pixel data)."""
    __tablename__ = 'imaging_studies'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    diagnostic_report_id = Column(Integer, ForeignKey('diagnostic_reports.id', ondelete='CASCADE'), nullable=True, index=True)

    modality = Column(String(20), nullable=True)  # MR | CT | XR | US ...
    body_site = Column(String(100), nullable=True)
    description = Column(String(255), nullable=True)
    started = Column(TIMESTAMP(timezone=True), nullable=True)
    series_count = Column(Integer, nullable=True)
    instance_count = Column(Integer, nullable=True)
    study_uid = Column(String(100), nullable=True)

    source = Column(String(50), nullable=True, default='manual')
    external_id = Column(String(100), nullable=True, index=True)
    raw_data = Column(JSON, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), nullable=False)

    # Relationships
    patient = relationship('Patient')
    report = relationship('DiagnosticReport', back_populates='imaging')
