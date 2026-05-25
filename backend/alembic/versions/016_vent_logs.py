"""Ventilator log import tables

Revision ID: 016_vent_logs
Revises: 015_nutrition_output_is_accident
Create Date: 2026-05-24

Creates four tables to back the ventilator-log import pipeline:

  vent_imports                — one row per uploaded archive (replaces meta.json)
  vent_parameter_dictionary   — vendor metadata (VOCSN TrendMetaData.json, etc.)
  vent_samples                — long-format (timestamp, parameter_key, value) facts
  vent_device_info            — per-import device metadata

`vent_samples.recorded_at_raw` keeps the vent's reported time intact; calibration
applies to `recorded_at` via a simple UPDATE so we never re-parse the archive.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '016_vent_logs'
down_revision: Union[str, None] = '015_nutrition_output_is_accident'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vent_imports',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('patient_id', sa.Integer(),
                  sa.ForeignKey('patients.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('integration_id', sa.Integer(),
                  sa.ForeignKey('patient_integrations.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('vendor', sa.String(length=50), nullable=False),
        sa.Column('model', sa.String(length=100), nullable=True),
        sa.Column('device_serial', sa.String(length=100), nullable=True),
        sa.Column('file_name', sa.Text(), nullable=False),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('storage_path', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False,
                  server_default='queued', index=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('uploaded_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('uploaded_by', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('parsed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('parser_summary', sa.JSON(), nullable=True),
    )

    op.create_table(
        'vent_parameter_dictionary',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('vendor', sa.String(length=50), nullable=False, index=True),
        sa.Column('parameter_key', sa.String(length=100), nullable=False),
        sa.Column('display_label', sa.Text(), nullable=False),
        sa.Column('display_type', sa.String(length=50), nullable=True),
        sa.Column('display_units', sa.String(length=50), nullable=True),
        sa.Column('scale_factor', sa.Numeric(), nullable=True),
        sa.Column('precision', sa.Integer(), nullable=True),
        sa.Column('tag_name', sa.Text(), nullable=True),
        sa.Column('grouping', sa.String(length=50), nullable=True, index=True),
        sa.Column('enum_values', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('vendor', 'parameter_key',
                            name='uq_vent_param_vendor_key'),
    )

    op.create_table(
        'vent_samples',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('import_id', sa.String(length=36),
                  sa.ForeignKey('vent_imports.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('patient_id', sa.Integer(),
                  sa.ForeignKey('patients.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('recorded_at_raw', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('recorded_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('parameter_key', sa.String(length=100), nullable=False),
        sa.Column('parameter_suffix', sa.String(length=8), nullable=True),
        sa.Column('value_numeric', sa.Float(), nullable=True),
        sa.Column('value_text', sa.Text(), nullable=True),
        sa.Column('source_message_type', sa.String(length=4), nullable=True),
        sa.Column('source_message_id', sa.Integer(), nullable=True),
    )
    op.create_index('ix_vent_samples_import_id', 'vent_samples', ['import_id'])
    op.create_index('ix_vent_samples_patient_at', 'vent_samples',
                    ['patient_id', 'recorded_at'])
    op.create_index('ix_vent_samples_param_key', 'vent_samples', ['parameter_key'])

    op.create_table(
        'vent_device_info',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('import_id', sa.String(length=36),
                  sa.ForeignKey('vent_imports.id', ondelete='CASCADE'),
                  nullable=False, unique=True),
        sa.Column('vendor', sa.String(length=50), nullable=False),
        sa.Column('model', sa.String(length=100), nullable=True),
        sa.Column('serial', sa.String(length=100), nullable=True),
        sa.Column('firmware', sa.String(length=100), nullable=True),
        sa.Column('language', sa.String(length=50), nullable=True),
        sa.Column('extra', sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('vent_device_info')
    op.drop_index('ix_vent_samples_param_key', table_name='vent_samples')
    op.drop_index('ix_vent_samples_patient_at', table_name='vent_samples')
    op.drop_index('ix_vent_samples_import_id', table_name='vent_samples')
    op.drop_table('vent_samples')
    op.drop_table('vent_parameter_dictionary')
    op.drop_table('vent_imports')
