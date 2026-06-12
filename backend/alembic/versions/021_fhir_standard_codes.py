"""FHIR-aligned standard code fields + allergies table

Revision ID: 021_fhir_standard_codes
Revises: 020_soft_delete_completion_logs
Create Date: 2026-06-02

"FHIR at the edges, native core": adds standard-terminology fields to existing
clinical models (LOINC on vitals, RxNorm/NDC on medications, SNOMED on diagnoses)
and a new FHIR-aligned `allergies` table. All additive / nullable so existing rows
and current integrations are unaffected.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '021_fhir_standard_codes'
down_revision: Union[str, None] = '020_soft_delete_completion_logs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Vital -> FHIR Observation vocabulary
    op.add_column('vitals', sa.Column('code', sa.String(length=50), nullable=True))
    op.add_column('vitals', sa.Column('code_system', sa.String(length=100), nullable=True))
    op.add_column('vitals', sa.Column('ucum_unit', sa.String(length=20), nullable=True))

    # Medication -> FHIR Medication.code
    op.add_column('medication', sa.Column('rxnorm_code', sa.String(length=20), nullable=True))
    op.add_column('medication', sa.Column('ndc_code', sa.String(length=20), nullable=True))

    # Diagnosis -> FHIR Condition.code
    op.add_column('diagnoses', sa.Column('snomed_code', sa.String(length=20), nullable=True))

    # New FHIR-aligned AllergyIntolerance table
    op.create_table(
        'allergies',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('account_id', sa.Integer(),
                  sa.ForeignKey('accounts.id', ondelete='CASCADE'),
                  nullable=True, index=True),
        sa.Column('patient_id', sa.Integer(),
                  sa.ForeignKey('patients.id'), nullable=False),
        sa.Column('substance', sa.String(length=255), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=True),
        sa.Column('code_system', sa.String(length=100), nullable=True),
        sa.Column('category', sa.String(length=20), nullable=True),
        sa.Column('criticality', sa.String(length=20), nullable=True),
        sa.Column('clinical_status', sa.String(length=20),
                  server_default='active', nullable=False),
        sa.Column('verification_status', sa.String(length=20),
                  server_default='confirmed', nullable=False),
        sa.Column('reaction', sa.Text(), nullable=True),
        sa.Column('severity', sa.String(length=20), nullable=True),
        sa.Column('onset_date', sa.Date(), nullable=True),
        sa.Column('source', sa.String(length=50), server_default='manual', nullable=True),
        sa.Column('external_id', sa.String(length=100), nullable=True, index=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('created_by', sa.Integer(),
                  sa.ForeignKey('users.id'), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('allergies')
    op.drop_column('diagnoses', 'snomed_code')
    op.drop_column('medication', 'ndc_code')
    op.drop_column('medication', 'rxnorm_code')
    op.drop_column('vitals', 'ucum_unit')
    op.drop_column('vitals', 'code_system')
    op.drop_column('vitals', 'code')
