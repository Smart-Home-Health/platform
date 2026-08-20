"""Per-patient bounds for the room a patient is in

Revision ID: 048_patient_env_ranges
Revises: 047_monitoring_alert_end_source
Create Date: 2026-08-19

The environment data has been charted since the env epic, but nothing said
what a *bad* room looked like for a given patient, so nothing could flag one.
This table holds that judgement.

Separate from patient_vital_ranges on purpose. That table feeds
vital_validation, which gates saving a reading; a CO2 bound has no business
in that path, and sharing the table would put it there.

Two bands per metric — caution and critical — because the timeline needs
three states for PM2.5 (green / amber / red) and two thresholds are the
smallest thing that produces three states. The same two bands describe the
other metrics' high/low flags, so there is one shape rather than one per
metric.

Every bound is nullable and NULL means "no bound on this side", which is not
the same as zero: CO2 and PM2.5 have ceilings but no meaningful floor, and a
0 floor would read as one. A patient with no rows at all falls back to the
defaults in crud/env_ranges.py rather than to "anything goes".
"""
from alembic import op
import sqlalchemy as sa

revision = '048_patient_env_ranges'
down_revision = '047_monitoring_alert_end_source'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'patient_env_ranges',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('metric', sa.String(length=50), nullable=False),
        sa.Column('caution_min', sa.Float(), nullable=True),
        sa.Column('caution_max', sa.Float(), nullable=True),
        sa.Column('critical_min', sa.Float(), nullable=True),
        sa.Column('critical_max', sa.Float(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('set_by', sa.Integer(), nullable=True),
        sa.Column('set_at', sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['set_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('patient_id', 'metric', name='uq_patient_env_range'),
    )
    op.create_index('ix_patient_env_ranges_patient_id', 'patient_env_ranges',
                    ['patient_id'])


def downgrade():
    op.drop_index('ix_patient_env_ranges_patient_id', table_name='patient_env_ranges')
    op.drop_table('patient_env_ranges')
