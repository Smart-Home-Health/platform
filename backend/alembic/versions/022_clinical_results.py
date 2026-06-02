"""Clinical result / imaging tables for FHIR (Epic) ingest

Revision ID: 022_clinical_results
Revises: 021_fhir_standard_codes
Create Date: 2026-06-02

Adds the richer EHR result tables that don't fit the flat `vitals` model:
diagnostic_reports (lab panels + imaging narratives), lab_results (discrete blood
work), clinical_documents (PDF/report blob metadata; blobs live on the ./data
volume), and imaging_studies (study metadata, no DICOM pixels).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '022_clinical_results'
down_revision: Union[str, None] = '021_fhir_standard_codes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'diagnostic_reports',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('patient_id', sa.Integer(), sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('code', sa.String(length=50), nullable=True),
        sa.Column('code_system', sa.String(length=100), nullable=True),
        sa.Column('display', sa.String(length=255), nullable=True),
        sa.Column('category', sa.String(length=20), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('effective_datetime', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('issued', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('performer', sa.String(length=255), nullable=True),
        sa.Column('conclusion', sa.Text(), nullable=True),
        sa.Column('source', sa.String(length=50), server_default='manual', nullable=True),
        sa.Column('external_id', sa.String(length=100), nullable=True, index=True),
        sa.Column('raw_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'lab_results',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('patient_id', sa.Integer(), sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('diagnostic_report_id', sa.Integer(), sa.ForeignKey('diagnostic_reports.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('code', sa.String(length=50), nullable=True),
        sa.Column('code_system', sa.String(length=100), server_default='http://loinc.org', nullable=True),
        sa.Column('display', sa.String(length=255), nullable=True),
        sa.Column('value', sa.Float(), nullable=True),
        sa.Column('value_string', sa.String(length=255), nullable=True),
        sa.Column('unit', sa.String(length=50), nullable=True),
        sa.Column('ucum_unit', sa.String(length=50), nullable=True),
        sa.Column('reference_range', sa.String(length=100), nullable=True),
        sa.Column('reference_low', sa.Float(), nullable=True),
        sa.Column('reference_high', sa.Float(), nullable=True),
        sa.Column('abnormal_flag', sa.String(length=10), nullable=True),
        sa.Column('interpretation', sa.String(length=100), nullable=True),
        sa.Column('effective_datetime', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('source', sa.String(length=50), server_default='manual', nullable=True),
        sa.Column('external_id', sa.String(length=100), nullable=True, index=True),
        sa.Column('raw_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'clinical_documents',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('patient_id', sa.Integer(), sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('diagnostic_report_id', sa.Integer(), sa.ForeignKey('diagnostic_reports.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('document_type', sa.String(length=30), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=True),
        sa.Column('content_type', sa.String(length=100), nullable=True),
        sa.Column('storage', sa.String(length=10), server_default='file', nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=True),
        sa.Column('data', sa.LargeBinary(), nullable=True),
        sa.Column('size_bytes', sa.Integer(), nullable=True),
        sa.Column('fhir_resource_type', sa.String(length=30), nullable=True),
        sa.Column('source', sa.String(length=50), server_default='manual', nullable=True),
        sa.Column('external_id', sa.String(length=100), nullable=True, index=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'imaging_studies',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('patient_id', sa.Integer(), sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('diagnostic_report_id', sa.Integer(), sa.ForeignKey('diagnostic_reports.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('modality', sa.String(length=20), nullable=True),
        sa.Column('body_site', sa.String(length=100), nullable=True),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('started', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('series_count', sa.Integer(), nullable=True),
        sa.Column('instance_count', sa.Integer(), nullable=True),
        sa.Column('study_uid', sa.String(length=100), nullable=True),
        sa.Column('source', sa.String(length=50), server_default='manual', nullable=True),
        sa.Column('external_id', sa.String(length=100), nullable=True, index=True),
        sa.Column('raw_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('imaging_studies')
    op.drop_table('clinical_documents')
    op.drop_table('lab_results')
    op.drop_table('diagnostic_reports')
