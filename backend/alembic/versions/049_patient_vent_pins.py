"""Which ventilator parameters lead the page, per patient

Revision ID: 049_patient_vent_pins
Revises: 048_patient_env_ranges
Create Date: 2026-08-19

A vent day carries around 44 parameters and the device has no opinion about
which of them matter. The page had none either, so breath rate and a raw
vendor counter rendered at identical weight and the important numbers were
five screens apart. These are the care team's picks.

Keyed by vendor as well as parameter key: the key space belongs to the
vendor, and VOCSN's 9408 means nothing to another manufacturer.

The second table exists because "no pin rows" is otherwise ambiguous — it
means both "nobody has chosen yet, show the defaults" and "somebody
deliberately unpinned everything". Without somewhere to record that a choice
was made, clearing the last pin silently restores six defaults, which reads
as the app overruling the person who just cleared them.
"""
from alembic import op
import sqlalchemy as sa

revision = '049_patient_vent_pins'
down_revision = '048_patient_env_ranges'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'patient_vent_pins',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('vendor', sa.String(length=50), nullable=False),
        sa.Column('parameter_key', sa.String(length=100), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('set_by', sa.Integer(), nullable=True),
        sa.Column('set_at', sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['set_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('patient_id', 'vendor', 'parameter_key',
                            name='uq_patient_vent_pin'),
    )
    op.create_index('ix_patient_vent_pins_patient_id', 'patient_vent_pins',
                    ['patient_id'])

    op.create_table(
        'patient_vent_pin_state',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('vendor', sa.String(length=50), nullable=False),
        sa.Column('configured', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('set_by', sa.Integer(), nullable=True),
        sa.Column('set_at', sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['set_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('patient_id', 'vendor', name='uq_patient_vent_pin_state'),
    )
    op.create_index('ix_patient_vent_pin_state_patient_id', 'patient_vent_pin_state',
                    ['patient_id'])


def downgrade():
    op.drop_index('ix_patient_vent_pin_state_patient_id',
                  table_name='patient_vent_pin_state')
    op.drop_table('patient_vent_pin_state')
    op.drop_index('ix_patient_vent_pins_patient_id', table_name='patient_vent_pins')
    op.drop_table('patient_vent_pins')
