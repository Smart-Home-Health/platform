"""add_integrations_tables

Revision ID: 9f132c5abdec
Revises: add_accounts_001
Create Date: 2026-02-08 06:39:25.276966

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9f132c5abdec'
down_revision: Union[str, None] = 'add_accounts_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add integration columns to vitals table
    op.add_column('vitals', sa.Column('unit', sa.String(length=20), nullable=True))
    op.add_column('vitals', sa.Column('source', sa.String(length=50), nullable=True))
    op.add_column('vitals', sa.Column('device_id', sa.String(length=100), nullable=True))
    op.add_column('vitals', sa.Column('external_id', sa.String(length=100), nullable=True))
    op.add_column('vitals', sa.Column('raw_data', sa.JSON(), nullable=True))
    op.create_index(op.f('ix_vitals_external_id'), 'vitals', ['external_id'], unique=False)
    
    # Create integrations table (system-wide integration definitions)
    op.create_table('integrations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('icon', sa.String(length=255), nullable=True),
        sa.Column('auth_type', sa.String(length=20), nullable=False, server_default='oauth2'),
        sa.Column('config_schema', sa.JSON(), nullable=True),
        sa.Column('supported_vitals', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug', name='uq_integrations_slug')
    )
    
    # Create patient_integrations table (patient-specific configurations)
    op.create_table('patient_integrations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('integration_id', sa.Integer(), nullable=False),
        sa.Column('credentials', sa.JSON(), nullable=True),
        sa.Column('settings', sa.JSON(), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_sync_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('last_sync_status', sa.String(length=20), nullable=True),
        sa.Column('last_sync_error', sa.Text(), nullable=True),
        sa.Column('sync_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['integration_id'], ['integrations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_patient_integrations_account_id', 'patient_integrations', ['account_id'])
    op.create_index('ix_patient_integrations_patient_id', 'patient_integrations', ['patient_id'])
    op.create_index('ix_patient_integrations_integration_id', 'patient_integrations', ['integration_id'])
    
    # Create integration_devices table (devices per patient integration)
    op.create_table('integration_devices',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_integration_id', sa.Integer(), nullable=False),
        sa.Column('device_id', sa.String(length=100), nullable=False),
        sa.Column('device_type', sa.String(length=50), nullable=False),
        sa.Column('device_name', sa.String(length=100), nullable=True),
        sa.Column('device_model', sa.String(length=100), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_seen_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('extra_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['patient_integration_id'], ['patient_integrations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_integration_devices_patient_integration_id', 'integration_devices', ['patient_integration_id'])


def downgrade() -> None:
    # Drop integration_devices table
    op.drop_index('ix_integration_devices_patient_integration_id', table_name='integration_devices')
    op.drop_table('integration_devices')
    
    # Drop patient_integrations table
    op.drop_index('ix_patient_integrations_integration_id', table_name='patient_integrations')
    op.drop_index('ix_patient_integrations_patient_id', table_name='patient_integrations')
    op.drop_index('ix_patient_integrations_account_id', table_name='patient_integrations')
    op.drop_table('patient_integrations')
    
    # Drop integrations table
    op.drop_table('integrations')
    
    # Remove vitals columns
    op.drop_index(op.f('ix_vitals_external_id'), table_name='vitals')
    op.drop_column('vitals', 'raw_data')
    op.drop_column('vitals', 'external_id')
    op.drop_column('vitals', 'device_id')
    op.drop_column('vitals', 'source')
    op.drop_column('vitals', 'unit')
