"""add user rbac system

Revision ID: b8f3c9d1e2a4
Revises: ac902504d74c
Create Date: 2025-12-17 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8f3c9d1e2a4'
down_revision: Union[str, None] = 'ac902504d74c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
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
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_id', 'users', ['id'])
    op.create_index('ix_users_username', 'users', ['username'], unique=True)
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    
    # Create roles table
    op.create_table(
        'roles',
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
    
    # Create permissions table
    op.create_table(
        'permissions',
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
    
    # Create user_roles association table
    op.create_table(
        'user_roles',
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
    
    # Create role_permissions association table
    op.create_table(
        'role_permissions',
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.Column('permission_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('role_id', 'permission_id')
    )
    
    # Create audit_logs table
    op.create_table(
        'audit_logs',
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
    
    # Add user tracking columns to existing tables
    # Note: Some columns may already exist as String type, we need to change them to Integer FK
    
    # Get connection to check existing columns
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Add to medication_log (singular)
    existing_cols = [col['name'] for col in inspector.get_columns('medication_log')]
    if 'administered_by' not in existing_cols:
        op.add_column('medication_log', sa.Column('administered_by', sa.Integer(), nullable=True))
    else:
        # Column exists as String, need to drop and recreate as Integer
        op.drop_column('medication_log', 'administered_by')
        op.add_column('medication_log', sa.Column('administered_by', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_medication_log_user', 'medication_log', 'users', ['administered_by'], ['id'], ondelete='SET NULL')
    
    # Add to care_task_log (singular)
    existing_cols = [col['name'] for col in inspector.get_columns('care_task_log')]
    if 'performed_by' not in existing_cols:
        op.add_column('care_task_log', sa.Column('performed_by', sa.Integer(), nullable=True))
    else:
        # Check if it's the old 'completed_by' column
        if 'completed_by' in existing_cols:
            op.drop_column('care_task_log', 'completed_by')
        op.add_column('care_task_log', sa.Column('performed_by', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_care_task_log_user', 'care_task_log', 'users', ['performed_by'], ['id'], ondelete='SET NULL')
    
    # Add to nutrition_intake (singular)
    existing_cols = [col['name'] for col in inspector.get_columns('nutrition_intake')]
    if 'recorded_by' not in existing_cols:
        op.add_column('nutrition_intake', sa.Column('recorded_by', sa.Integer(), nullable=True))
    else:
        # Column exists as String, need to drop and recreate as Integer
        op.drop_column('nutrition_intake', 'recorded_by')
        op.add_column('nutrition_intake', sa.Column('recorded_by', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_nutrition_intake_user', 'nutrition_intake', 'users', ['recorded_by'], ['id'], ondelete='SET NULL')
    
    # Add to equipment_change_log (singular)
    existing_cols = [col['name'] for col in inspector.get_columns('equipment_change_log')]
    if 'changed_by' not in existing_cols:
        op.add_column('equipment_change_log', sa.Column('changed_by', sa.Integer(), nullable=True))
    else:
        # Column exists as String, need to drop and recreate as Integer
        op.drop_column('equipment_change_log', 'changed_by')
        op.add_column('equipment_change_log', sa.Column('changed_by', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_equipment_change_log_user', 'equipment_change_log', 'users', ['changed_by'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    # Remove foreign keys and columns from existing tables
    op.drop_constraint('fk_equipment_change_log_user', 'equipment_change_log', type_='foreignkey')
    op.drop_column('equipment_change_log', 'changed_by')
    
    op.drop_constraint('fk_nutrition_intake_user', 'nutrition_intake', type_='foreignkey')
    op.drop_column('nutrition_intake', 'recorded_by')
    
    op.drop_constraint('fk_care_task_log_user', 'care_task_log', type_='foreignkey')
    op.drop_column('care_task_log', 'performed_by')
    
    op.drop_constraint('fk_medication_log_user', 'medication_log', type_='foreignkey')
    op.drop_column('medication_log', 'administered_by')
    
    # Drop tables in reverse order
    op.drop_index('ix_audit_logs_timestamp', 'audit_logs')
    op.drop_index('ix_audit_logs_id', 'audit_logs')
    op.drop_table('audit_logs')
    
    op.drop_table('role_permissions')
    op.drop_table('user_roles')
    
    op.drop_index('ix_permissions_name', 'permissions')
    op.drop_index('ix_permissions_id', 'permissions')
    op.drop_table('permissions')
    
    op.drop_index('ix_roles_name', 'roles')
    op.drop_index('ix_roles_id', 'roles')
    op.drop_table('roles')
    
    op.drop_index('ix_users_email', 'users')
    op.drop_index('ix_users_username', 'users')
    op.drop_index('ix_users_id', 'users')
    op.drop_table('users')
