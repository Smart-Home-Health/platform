"""Add source + external_id to diagnoses and medication (FHIR ingest dedup)

Revision ID: 023_dx_rx_external_id
Revises: 022_clinical_results
Create Date: 2026-06-02

Lets the Epic FHIR connector persist Condition -> Diagnosis and
MedicationRequest/Statement -> Medication with safe de-duplication across repeated
syncs (keyed on external_id + source). Additive / nullable.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '023_dx_rx_external_id'
down_revision: Union[str, None] = '022_clinical_results'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('diagnoses', sa.Column('source', sa.String(length=50), server_default='manual', nullable=True))
    op.add_column('diagnoses', sa.Column('external_id', sa.String(length=100), nullable=True))
    op.create_index('ix_diagnoses_external_id', 'diagnoses', ['external_id'])

    op.add_column('medication', sa.Column('source', sa.String(length=50), server_default='manual', nullable=True))
    op.add_column('medication', sa.Column('external_id', sa.String(length=100), nullable=True))
    op.create_index('ix_medication_external_id', 'medication', ['external_id'])


def downgrade() -> None:
    op.drop_index('ix_medication_external_id', table_name='medication')
    op.drop_column('medication', 'external_id')
    op.drop_column('medication', 'source')

    op.drop_index('ix_diagnoses_external_id', table_name='diagnoses')
    op.drop_column('diagnoses', 'external_id')
    op.drop_column('diagnoses', 'source')
