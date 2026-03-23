"""Initial schema - consolidated from all migrations

Revision ID: 001_initial
Revises: 
Create Date: 2026-02-10

This is a clean initial migration for fresh installs.
All data seeding (accounts, users, patients) is handled by first-run setup.
Only structural defaults (organization, care task categories) are seeded here.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from datetime import datetime


revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ===========================================
    # CORE TABLES
    # ===========================================
    
    # Settings table (global and account-scoped settings)
    op.create_table('settings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('data_type', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_settings_key', 'settings', ['key'])
    op.create_index('ix_settings_account_id', 'settings', ['account_id'])
    
    # ===========================================
    # ORGANIZATION & ACCOUNT TABLES
    # ===========================================
    
    # Organizations table
    op.create_table('organizations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('org_type', sa.Enum('PERSONAL', 'NURSING_AGENCY', 'HOSPICE', 'HOME_HEALTH', 'HOSPITAL', 'CLINIC', 'OTHER', name='organizationtype'), nullable=False),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('settings', sa.JSON(), nullable=True),
        sa.Column('contact_email', sa.String(length=255), nullable=True),
        sa.Column('contact_phone', sa.String(length=50), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_organizations_id', 'organizations', ['id'])
    op.create_index('ix_organizations_slug', 'organizations', ['slug'], unique=True)
    
    # Accounts table
    op.create_table('accounts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('settings', sa.JSON(), nullable=True),
        sa.Column('contact_email', sa.String(255), nullable=True),
        sa.Column('contact_phone', sa.String(50), nullable=True),
        sa.Column('timezone', sa.String(50), nullable=False, server_default="'America/New_York'"),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_accounts_id', 'accounts', ['id'])
    op.create_index('ix_accounts_slug', 'accounts', ['slug'], unique=True)
    op.create_index('ix_accounts_organization_id', 'accounts', ['organization_id'])
    
    # Add FK from settings to accounts (now that accounts exists)
    op.create_foreign_key('fk_settings_account_id', 'settings', 'accounts', ['account_id'], ['id'], ondelete='CASCADE')
    
    # ===========================================
    # USER & RBAC TABLES
    # ===========================================
    
    # Users table
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('username', sa.String(50), nullable=False),
        sa.Column('email', sa.String(100), nullable=True),
        sa.Column('full_name', sa.String(100), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('pin_hash', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_system_admin', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.Column('last_activity', sa.DateTime(), nullable=True),
        sa.Column('last_full_password_login', sa.DateTime(), nullable=True),
        sa.Column('failed_login_attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('locked_until', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_users_id', 'users', ['id'])
    op.create_index('ix_users_username', 'users', ['username'], unique=True)
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_account_id', 'users', ['account_id'])
    
    # Roles table
    op.create_table('roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('display_name', sa.String(100), nullable=False),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_system_role', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_roles_id', 'roles', ['id'])
    op.create_index('ix_roles_name', 'roles', ['name'], unique=True)
    
    # Permissions table
    op.create_table('permissions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('display_name', sa.String(100), nullable=False),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_permissions_id', 'permissions', ['id'])
    op.create_index('ix_permissions_name', 'permissions', ['name'], unique=True)
    
    # User-Roles association table
    op.create_table('user_roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Role-Permissions association table
    op.create_table('role_permissions',
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.Column('permission_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('role_id', 'permission_id')
    )
    
    # Organization memberships table
    op.create_table('organization_memberships',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False, server_default="'member'"),
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('joined_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('invited_by_user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['invited_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_organization_memberships_id', 'organization_memberships', ['id'])
    op.create_index('ix_organization_memberships_organization_id', 'organization_memberships', ['organization_id'])
    op.create_index('ix_organization_memberships_user_id', 'organization_memberships', ['user_id'])
    
    # Audit logs table
    op.create_table('audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('resource_type', sa.String(50), nullable=True),
        sa.Column('resource_id', sa.Integer(), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.String(255), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_logs_id', 'audit_logs', ['id'])
    op.create_index('ix_audit_logs_timestamp', 'audit_logs', ['timestamp'])
    
    # ===========================================
    # PATIENT TABLES
    # ===========================================
    
    # Patients table
    op.create_table('patients',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('first_name', sa.String(), nullable=False),
        sa.Column('last_name', sa.String(), nullable=False),
        sa.Column('date_of_birth', sa.DateTime(), nullable=True),
        sa.Column('medical_record_number', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('owner_user_id', sa.Integer(), nullable=True),
        sa.Column('creating_org_id', sa.Integer(), nullable=True),
        sa.Column('claimed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('medical_record_number'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['owner_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['creating_org_id'], ['organizations.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_patients_account_id', 'patients', ['account_id'])
    
    # Patient access table
    op.create_table('patient_access',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('access_level', sa.Enum('OWNER', 'ADMIN', 'CAREGIVER', 'VIEWER', name='accesslevel'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('granted_by_user_id', sa.Integer(), nullable=True),
        sa.Column('granted_by_org_id', sa.Integer(), nullable=True),
        sa.Column('granted_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['granted_by_org_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['granted_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_patient_access_id', 'patient_access', ['id'])
    op.create_index('ix_patient_access_organization_id', 'patient_access', ['organization_id'])
    op.create_index('ix_patient_access_patient_id', 'patient_access', ['patient_id'])
    op.create_index('ix_patient_access_user_id', 'patient_access', ['user_id'])
    
    # ===========================================
    # VITALS & MONITORING TABLES
    # ===========================================
    
    # Vitals table
    op.create_table('vitals',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('vital_type', sa.String(), nullable=False),
        sa.Column('vital_group', sa.String(), nullable=True),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('unit', sa.String(20), nullable=True),
        sa.Column('source', sa.String(50), nullable=True, server_default="'manual'"),
        sa.Column('device_id', sa.String(100), nullable=True),
        sa.Column('external_id', sa.String(100), nullable=True),
        sa.Column('raw_data', sa.JSON(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    op.create_index('ix_vitals_account_id', 'vitals', ['account_id'])
    op.create_index('ix_vitals_patient_id', 'vitals', ['patient_id'])
    op.create_index('ix_vitals_external_id', 'vitals', ['external_id'])
    op.create_index('ix_vitals_vital_type', 'vitals', ['vital_type'])
    
    # Pulse ox data table
    op.create_table('pulse_ox_data',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('spo2', sa.Integer(), nullable=True),
        sa.Column('bpm', sa.Integer(), nullable=True),
        sa.Column('pa', sa.Float(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('motion', sa.String(), nullable=True),
        sa.Column('spo2_alarm', sa.String(), nullable=True),
        sa.Column('hr_alarm', sa.String(), nullable=True),
        sa.Column('raw_data', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    
    # Blood pressure table
    op.create_table('blood_pressure',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('systolic', sa.Integer(), nullable=False),
        sa.Column('diastolic', sa.Integer(), nullable=False),
        sa.Column('map', sa.Integer(), nullable=False),
        sa.Column('raw_data', sa.Text(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    
    # Temperature table
    op.create_table('temperature',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('skin_temp', sa.Float(), nullable=True),
        sa.Column('body_temp', sa.Float(), nullable=True),
        sa.Column('raw_data', sa.Text(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    
    # Monitoring alerts table
    op.create_table('monitoring_alerts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('end_time', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('start_data_id', sa.Integer(), nullable=True),
        sa.Column('end_data_id', sa.Integer(), nullable=True),
        sa.Column('acknowledged', sa.Boolean(), nullable=True),
        sa.Column('spo2_min', sa.Integer(), nullable=True),
        sa.Column('bpm_min', sa.Integer(), nullable=True),
        sa.Column('spo2_max', sa.Integer(), nullable=True),
        sa.Column('bpm_max', sa.Integer(), nullable=True),
        sa.Column('spo2_alarm_triggered', sa.Boolean(), nullable=True),
        sa.Column('hr_alarm_triggered', sa.Boolean(), nullable=True),
        sa.Column('external_alarm_triggered', sa.Boolean(), nullable=True),
        sa.Column('oxygen_used', sa.Boolean(), nullable=True),
        sa.Column('oxygen_highest', sa.Float(), nullable=True),
        sa.Column('oxygen_unit', sa.String(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    op.create_index('ix_monitoring_alerts_account_id', 'monitoring_alerts', ['account_id'])
    
    # Ventilator alerts table
    op.create_table('ventilator_alerts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('device_id', sa.String(), nullable=False),
        sa.Column('pin', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('end_time', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('last_activity', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('acknowledged', sa.Boolean(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    
    # Symptoms table
    op.create_table('symptoms',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('severity', sa.String(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('onset_date', sa.DateTime(), nullable=True),
        sa.Column('resolved_date', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    op.create_index('ix_symptoms_account_id', 'symptoms', ['account_id'])
    
    # ===========================================
    # MEDICATION TABLES
    # ===========================================
    
    # Medication table
    op.create_table('medication',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('prescriber_id', sa.Integer(), nullable=True),
        sa.Column('pharmacy_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('concentration', sa.String(), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=False, server_default='0'),
        sa.Column('quantity_unit', sa.String(), nullable=False, server_default="'tablets'"),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('start_date', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('end_date', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('as_needed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    op.create_index('ix_medication_account_id', 'medication', ['account_id'])
    
    # Medication schedule table
    op.create_table('medication_schedule',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('medication_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('time', sa.Time(), nullable=False),
        sa.Column('days_of_week', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['medication_id'], ['medication.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    
    # Medication log table
    op.create_table('medication_log',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('medication_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('schedule_id', sa.Integer(), nullable=True),
        sa.Column('scheduled_time', sa.DateTime(), nullable=True),
        sa.Column('administered_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('administered_by', sa.Integer(), nullable=True),
        sa.Column('dosage_given', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default="'given'"),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['medication_id'], ['medication.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['schedule_id'], ['medication_schedule.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['administered_by'], ['users.id'], ondelete='SET NULL'),
    )
    
    # ===========================================
    # CARE TASK TABLES
    # ===========================================
    
    # Care task category table
    op.create_table('care_task_category',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('color', sa.String(7), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_care_task_category_account_id', 'care_task_category', ['account_id'])
    
    # Care task table
    op.create_table('care_task',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['category_id'], ['care_task_category.id']),
    )
    op.create_index('ix_care_task_account_id', 'care_task', ['account_id'])
    
    # Care task schedule table
    op.create_table('care_task_schedule',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('care_task_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('time', sa.Time(), nullable=False),
        sa.Column('days_of_week', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['care_task_id'], ['care_task.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    
    # Care task log table
    op.create_table('care_task_log',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('care_task_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('schedule_id', sa.Integer(), nullable=True),
        sa.Column('scheduled_time', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('performed_by', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default="'completed'"),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['care_task_id'], ['care_task.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['schedule_id'], ['care_task_schedule.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['performed_by'], ['users.id'], ondelete='SET NULL'),
    )
    
    # ===========================================
    # EQUIPMENT TABLES
    # ===========================================
    
    # Equipment table
    op.create_table('equipment',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('last_changed', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('useful_days', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('scheduled_change_date', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    op.create_index('ix_equipment_account_id', 'equipment', ['account_id'])
    
    # Equipment change log table
    op.create_table('equipment_change_log',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('equipment_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('changed_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('changed_by', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ondelete='SET NULL'),
    )
    
    # ===========================================
    # NUTRITION TABLES
    # ===========================================
    
    # Nutrition schedules table (created first since intake references it)
    op.create_table('nutrition_schedules',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('schedule_type', sa.String(50), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('cron_expression', sa.String(100), nullable=False),
        sa.Column('default_item_name', sa.String(200), nullable=True),
        sa.Column('default_amount', sa.Float(), nullable=True),
        sa.Column('default_amount_unit', sa.String(50), nullable=True),
        sa.Column('default_calories', sa.Float(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('create_care_task', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('reminder_minutes_before', sa.Integer(), nullable=True, server_default='15'),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    op.create_index('ix_nutrition_schedules_patient_id', 'nutrition_schedules', ['patient_id'])
    
    # Nutrition intake table
    op.create_table('nutrition_intake',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('care_task_log_id', sa.Integer(), nullable=True),
        sa.Column('schedule_id', sa.Integer(), nullable=True),
        sa.Column('item_name', sa.String(), nullable=False),
        sa.Column('item_type', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('amount_unit', sa.String(), nullable=False),
        sa.Column('calories', sa.Float(), nullable=True),
        sa.Column('protein_grams', sa.Float(), nullable=True),
        sa.Column('carbs_grams', sa.Float(), nullable=True),
        sa.Column('fat_grams', sa.Float(), nullable=True),
        sa.Column('fiber_grams', sa.Float(), nullable=True),
        sa.Column('sodium_mg', sa.Float(), nullable=True),
        sa.Column('consumed_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('scheduled_time', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('meal_type', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('recorded_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['care_task_log_id'], ['care_task_log.id']),
        sa.ForeignKeyConstraint(['schedule_id'], ['nutrition_schedules.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['recorded_by'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_nutrition_intake_account_id', 'nutrition_intake', ['account_id'])
    op.create_index('ix_nutrition_intake_patient_id', 'nutrition_intake', ['patient_id'])
    
    # Nutrition goals table
    op.create_table('nutrition_goals',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('water_ml_target', sa.Float(), nullable=True),
        sa.Column('total_fluid_ml_target', sa.Float(), nullable=True),
        sa.Column('calories_target', sa.Float(), nullable=True),
        sa.Column('calories_min', sa.Float(), nullable=True),
        sa.Column('calories_max', sa.Float(), nullable=True),
        sa.Column('protein_grams_target', sa.Float(), nullable=True),
        sa.Column('carbs_grams_target', sa.Float(), nullable=True),
        sa.Column('fat_grams_target', sa.Float(), nullable=True),
        sa.Column('fiber_grams_target', sa.Float(), nullable=True),
        sa.Column('sodium_mg_max', sa.Float(), nullable=True),
        sa.Column('sugar_grams_max', sa.Float(), nullable=True),
        sa.Column('potassium_mg_max', sa.Float(), nullable=True),
        sa.Column('phosphorus_mg_max', sa.Float(), nullable=True),
        sa.Column('urine_output_ml_min', sa.Float(), nullable=True),
        sa.Column('bowel_movements_target', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('effective_date', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('end_date', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    op.create_index('ix_nutrition_goals_account_id', 'nutrition_goals', ['account_id'])
    op.create_index('ix_nutrition_goals_patient_id', 'nutrition_goals', ['patient_id'])
    
    # Nutrition outputs table
    op.create_table('nutrition_outputs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('care_task_log_id', sa.Integer(), nullable=True),
        sa.Column('output_type', sa.String(50), nullable=False),
        sa.Column('consistency', sa.String(50), nullable=True),
        sa.Column('color', sa.String(50), nullable=True),
        sa.Column('amount', sa.Float(), nullable=True),
        sa.Column('amount_unit', sa.String(20), nullable=True),
        sa.Column('clarity', sa.String(50), nullable=True),
        sa.Column('is_diaper', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('diaper_wetness', sa.String(20), nullable=True),
        sa.Column('diaper_soiled', sa.Boolean(), nullable=True),
        sa.Column('is_catheter', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('catheter_bag_emptied', sa.Boolean(), nullable=True),
        sa.Column('occurred_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('recorded_by', sa.Integer(), nullable=True),
        sa.Column('has_blood', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('has_mucus', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('pain_reported', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('straining', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['care_task_log_id'], ['care_task_log.id']),
        sa.ForeignKeyConstraint(['recorded_by'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_nutrition_outputs_patient_id', 'nutrition_outputs', ['patient_id'])
    
    # ===========================================
    # BUSINESS & PROVIDER TABLES
    # ===========================================
    
    # Businesses table
    op.create_table('businesses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('business_type', sa.String(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('website', sa.String(), nullable=True),
        sa.Column('address_line1', sa.String(), nullable=True),
        sa.Column('address_line2', sa.String(), nullable=True),
        sa.Column('city', sa.String(), nullable=True),
        sa.Column('state', sa.String(), nullable=True),
        sa.Column('zip_code', sa.String(), nullable=True),
        sa.Column('country', sa.String(), nullable=True, server_default="'USA'"),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('hours_of_operation', sa.Text(), nullable=True),
        sa.Column('emergency_contact', sa.String(), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_businesses_account_id', 'businesses', ['account_id'])
    
    # Business type assignments table
    op.create_table('business_type_assignments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('type_name', sa.String(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_business_type_assignments_business_id', 'business_type_assignments', ['business_id'])
    op.create_index('ix_business_type_assignments_type_name', 'business_type_assignments', ['type_name'])
    
    # Providers table
    op.create_table('providers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=True),
        sa.Column('first_name', sa.String(), nullable=False),
        sa.Column('last_name', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('specialty', sa.String(), nullable=True),
        sa.Column('provider_type', sa.String(), nullable=False, server_default="'medical'"),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('fax', sa.String(), nullable=True),
        sa.Column('license_number', sa.String(), nullable=True),
        sa.Column('npi_number', sa.String(), nullable=True),
        sa.Column('department', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_providers_account_id', 'providers', ['account_id'])
    op.create_index('ix_providers_patient_id', 'providers', ['patient_id'])
    
    # Add prescriber/pharmacy foreign keys to medication table
    op.create_foreign_key('fk_medication_prescriber', 'medication', 'providers', ['prescriber_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_medication_pharmacy', 'medication', 'businesses', ['pharmacy_id'], ['id'], ondelete='SET NULL')
    
    # ===========================================
    # DIAGNOSIS & IMPLANT TABLES
    # ===========================================
    
    # Diagnoses table
    op.create_table('diagnoses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('icd10_code', sa.String(20), nullable=True),
        sa.Column('icd10_description', sa.String(500), nullable=True),
        sa.Column('diagnosis_type', sa.String(50), nullable=False, server_default="'primary'"),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('severity', sa.String(50), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default="'active'"),
        sa.Column('onset_date', sa.Date(), nullable=True),
        sa.Column('diagnosis_date', sa.Date(), nullable=True),
        sa.Column('resolved_date', sa.Date(), nullable=True),
        sa.Column('diagnosing_provider_id', sa.Integer(), nullable=True),
        sa.Column('managing_provider_id', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('treatment_plan', sa.Text(), nullable=True),
        sa.Column('is_primary_diagnosis', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['diagnosing_provider_id'], ['providers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['managing_provider_id'], ['providers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_diagnoses_account_id', 'diagnoses', ['account_id'])
    op.create_index('ix_diagnoses_patient_id', 'diagnoses', ['patient_id'])
    
    # Diagnosis notes table
    op.create_table('diagnosis_notes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('diagnosis_id', sa.Integer(), nullable=False),
        sa.Column('note_type', sa.String(50), nullable=False, server_default="'follow_up'"),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('provider_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['diagnosis_id'], ['diagnoses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['provider_id'], ['providers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_diagnosis_notes_diagnosis_id', 'diagnosis_notes', ['diagnosis_id'])
    
    # Implants table
    op.create_table('implants',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('implant_type', sa.String(50), nullable=False, server_default="'medical'"),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('subcategory', sa.String(100), nullable=True),
        sa.Column('body_location', sa.String(100), nullable=False),
        sa.Column('body_side', sa.String(20), nullable=True),
        sa.Column('manufacturer', sa.String(255), nullable=True),
        sa.Column('model', sa.String(255), nullable=True),
        sa.Column('serial_number', sa.String(255), nullable=True),
        sa.Column('size', sa.String(100), nullable=True),
        sa.Column('material', sa.String(100), nullable=True),
        sa.Column('implant_date', sa.Date(), nullable=True),
        sa.Column('last_change_date', sa.Date(), nullable=True),
        sa.Column('next_change_date', sa.Date(), nullable=True),
        sa.Column('removal_date', sa.Date(), nullable=True),
        sa.Column('expiration_date', sa.Date(), nullable=True),
        sa.Column('implanting_provider_id', sa.Integer(), nullable=True),
        sa.Column('managing_provider_id', sa.Integer(), nullable=True),
        sa.Column('facility_name', sa.String(255), nullable=True),
        sa.Column('facility_location', sa.String(255), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default="'active'"),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('care_instructions', sa.Text(), nullable=True),
        sa.Column('complications', sa.Text(), nullable=True),
        sa.Column('mri_safe', sa.String(50), nullable=True),
        sa.Column('mri_notes', sa.Text(), nullable=True),
        sa.Column('is_life_sustaining', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('requires_regular_change', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('change_frequency_days', sa.Integer(), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['implanting_provider_id'], ['providers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['managing_provider_id'], ['providers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_implants_account_id', 'implants', ['account_id'])
    op.create_index('ix_implants_patient_id', 'implants', ['patient_id'])
    
    # Implant notes table
    op.create_table('implant_notes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('implant_id', sa.Integer(), nullable=False),
        sa.Column('note_type', sa.String(50), nullable=False, server_default="'follow_up'"),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('was_changed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('old_serial_number', sa.String(255), nullable=True),
        sa.Column('new_serial_number', sa.String(255), nullable=True),
        sa.Column('provider_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['implant_id'], ['implants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['provider_id'], ['providers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_implant_notes_implant_id', 'implant_notes', ['implant_id'])
    
    # ===========================================
    # DME SHIPMENTS TABLE
    # ===========================================
    
    op.create_table('dme_shipments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('supplier_id', sa.Integer(), nullable=True),
        sa.Column('tracking_number', sa.String(), nullable=True),
        sa.Column('carrier', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default="'pending'"),
        sa.Column('order_date', sa.DateTime(), nullable=True),
        sa.Column('ship_date', sa.DateTime(), nullable=True),
        sa.Column('expected_delivery', sa.DateTime(), nullable=True),
        sa.Column('actual_delivery', sa.DateTime(), nullable=True),
        sa.Column('items', sa.JSON(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['supplier_id'], ['businesses.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_dme_shipments_account_id', 'dme_shipments', ['account_id'])
    op.create_index('ix_dme_shipments_patient_id', 'dme_shipments', ['patient_id'])
    
    # ===========================================
    # INTEGRATION TABLES
    # ===========================================
    
    # Integrations table (global integration definitions)
    op.create_table('integrations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('integration_type', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('config_schema', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug')
    )
    op.create_index('ix_integrations_slug', 'integrations', ['slug'])
    
    # Patient integrations table
    op.create_table('patient_integrations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('integration_id', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('credentials', sa.JSON(), nullable=True),
        sa.Column('last_sync', sa.DateTime(), nullable=True),
        sa.Column('sync_status', sa.String(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['integration_id'], ['integrations.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_patient_integrations_account_id', 'patient_integrations', ['account_id'])
    op.create_index('ix_patient_integrations_patient_id', 'patient_integrations', ['patient_id'])
    op.create_index('ix_patient_integrations_integration_id', 'patient_integrations', ['integration_id'])
    
    # Integration devices table
    op.create_table('integration_devices',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_integration_id', sa.Integer(), nullable=False),
        sa.Column('device_id', sa.String(), nullable=False),
        sa.Column('device_type', sa.String(), nullable=True),
        sa.Column('device_name', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_data', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_integration_id'], ['patient_integrations.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_integration_devices_patient_integration_id', 'integration_devices', ['patient_integration_id'])
    
    # ===========================================
    # READERS TABLE (for remote SHH readers)
    # ===========================================
    
    op.create_table('readers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=False),
        sa.Column('port', sa.Integer(), nullable=False, server_default='8080'),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('last_seen', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ip_address'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='SET NULL'),
    )
    
    # ===========================================
    # SEED DEFAULT DATA
    # ===========================================
    
    # Insert default organization (Smart Home Health)
    op.execute("""
        INSERT INTO organizations (name, slug, org_type, is_default, is_active, created_at, updated_at)
        VALUES ('Smart Home Health', 'smart-home-health', 'PERSONAL', true, true, NOW(), NOW())
    """)
    
    # Insert default care task categories
    op.execute("""
        INSERT INTO care_task_category (name, description, color, is_default, active, created_at, updated_at)
        VALUES 
            ('nutrition', 'Nutrition-related care tasks', '#4CAF50', true, true, NOW(), NOW()),
            ('bathroom', 'Bathroom and hygiene care tasks', '#2196F3', true, true, NOW(), NOW()),
            ('vitals', 'Vital signs and monitoring tasks', '#F44336', true, true, NOW(), NOW()),
            ('therapy', 'Therapy and rehabilitation tasks', '#9C27B0', true, true, NOW(), NOW()),
            ('treatments', 'Medical treatments and procedures', '#FF9800', true, true, NOW(), NOW())
    """)


def downgrade() -> None:
    # Drop all tables in reverse order of creation
    op.drop_table('readers')
    op.drop_table('integration_devices')
    op.drop_table('patient_integrations')
    op.drop_table('integrations')
    op.drop_table('dme_shipments')
    op.drop_table('implants')
    op.drop_table('diagnoses')
    op.drop_table('providers')
    op.drop_table('business_type_assignments')
    op.drop_table('businesses')
    op.drop_table('nutrition_schedules')
    op.drop_table('nutrition_outputs')
    op.drop_table('nutrition_goals')
    op.drop_table('nutrition_intake')
    op.drop_table('equipment_change_log')
    op.drop_table('equipment')
    op.drop_table('care_task_log')
    op.drop_table('care_task_schedule')
    op.drop_table('care_task')
    op.drop_table('care_task_category')
    op.drop_table('medication_log')
    op.drop_table('medication_schedule')
    op.drop_table('medication')
    op.drop_table('symptoms')
    op.drop_table('ventilator_alerts')
    op.drop_table('monitoring_alerts')
    op.drop_table('temperature')
    op.drop_table('blood_pressure')
    op.drop_table('pulse_ox_data')
    op.drop_table('vitals')
    op.drop_table('patient_access')
    op.drop_table('patients')
    op.drop_table('audit_logs')
    op.drop_table('organization_memberships')
    op.drop_table('role_permissions')
    op.drop_table('user_roles')
    op.drop_table('permissions')
    op.drop_table('roles')
    op.drop_table('users')
    op.drop_table('accounts')
    op.drop_table('organizations')
    op.drop_table('settings')
    
    # Drop enums
    op.execute("DROP TYPE IF EXISTS accesslevel")
    op.execute("DROP TYPE IF EXISTS organizationtype")
