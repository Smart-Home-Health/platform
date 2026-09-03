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
"""Vitals capture: provenance columns + per-patient vital ranges

Revision ID: 041_vitals_capture
Revises: 040_patient_care_area
Create Date: 2026-08-15

The mobile capture flow records who entered a reading (recorded_by), which
capture sitting it belongs to (encounter_uid), and — when a value fell
outside the patient's expected range — that the caregiver explicitly
confirmed it and what range was in effect (confirmed_against_warning,
reference_low/high). All columns are nullable; existing integration and
manual-form rows are untouched. Adding nullable columns to the vitals
hypertable is a metadata-only change.

patient_vital_ranges holds per-patient expected bounds, optional overrides
of the global implausible (physics-limit) bounds, and a required flag per
vital. field_key is NOT NULL DEFAULT '' so the unique constraint dedupes
(Postgres treats NULLs as distinct); blood-pressure components use
'systolic'/'diastolic'.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '041_vitals_capture'
down_revision: Union[str, None] = '040_patient_care_area'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('vitals', sa.Column('recorded_by', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_vitals_recorded_by_users', 'vitals', 'users',
                          ['recorded_by'], ['id'], ondelete='SET NULL')
    op.add_column('vitals', sa.Column('encounter_uid', sa.String(36), nullable=True))
    op.create_index('ix_vitals_encounter_uid', 'vitals', ['encounter_uid'])
    op.add_column('vitals', sa.Column('confirmed_against_warning', sa.Boolean(), nullable=True))
    op.add_column('vitals', sa.Column('reference_low', sa.Float(), nullable=True))
    op.add_column('vitals', sa.Column('reference_high', sa.Float(), nullable=True))

    op.create_table(
        'patient_vital_ranges',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('patient_id', sa.Integer(),
                  sa.ForeignKey('patients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('vital_key', sa.String(50), nullable=False),
        sa.Column('field_key', sa.String(20), nullable=False, server_default=''),
        sa.Column('expected_min', sa.Float(), nullable=True),
        sa.Column('expected_max', sa.Float(), nullable=True),
        sa.Column('implausible_min', sa.Float(), nullable=True),
        sa.Column('implausible_max', sa.Float(), nullable=True),
        sa.Column('required', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('set_by', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('set_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.UniqueConstraint('patient_id', 'vital_key', 'field_key',
                            name='uq_patient_vital_ranges_key'),
    )
    op.create_index('ix_patient_vital_ranges_patient_id',
                    'patient_vital_ranges', ['patient_id'])


def downgrade() -> None:
    op.drop_index('ix_patient_vital_ranges_patient_id', table_name='patient_vital_ranges')
    op.drop_table('patient_vital_ranges')
    op.drop_index('ix_vitals_encounter_uid', table_name='vitals')
    op.drop_column('vitals', 'reference_high')
    op.drop_column('vitals', 'reference_low')
    op.drop_column('vitals', 'confirmed_against_warning')
    op.drop_column('vitals', 'encounter_uid')
    op.drop_constraint('fk_vitals_recorded_by_users', 'vitals', type_='foreignkey')
    op.drop_column('vitals', 'recorded_by')
