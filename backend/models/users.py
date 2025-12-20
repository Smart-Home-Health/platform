"""
User authentication and authorization models
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from db import Base


# Association table for many-to-many relationship between users and roles
user_roles = Table(
    'user_roles',
    Base.metadata,
    Column('id', Integer, primary_key=True),
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'), nullable=False),
    Column('created_at', DateTime, default=datetime.utcnow, nullable=False),
    Column('updated_at', DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False),
    Column('expires_at', DateTime, nullable=True),  # Optional expiration for temporary roles
)


# Association table for many-to-many relationship between roles and permissions
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    Column('permission_id', Integer, ForeignKey('permissions.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=datetime.utcnow, nullable=False),
)


class User(Base):
    """User model for authentication and authorization"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=True, index=True)
    full_name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)  # bcrypt hash
    pin_hash = Column(String(255), nullable=True)  # Optional 4-8 digit PIN for quick re-auth
    is_active = Column(Boolean, default=True, nullable=False)
    is_system_admin = Column(Boolean, default=False, nullable=False)  # Superuser flag
    last_login = Column(DateTime, nullable=True)
    last_activity = Column(DateTime, nullable=True)
    last_full_password_login = Column(DateTime, nullable=True)  # Track daily password requirement
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)  # Account lockout
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    roles = relationship(
        "Role",
        secondary=user_roles,
        back_populates="users",
        lazy="selectin"
    )
    
    # Relationships
    audit_logs = relationship("AuditLog", back_populates="user")
    
    def has_role(self, role_name: str) -> bool:
        """Check if user has a specific role"""
        if self.is_system_admin:
            return True
        return any(role.name == role_name and role.is_active for role in self.roles)
    
    def has_any_role(self, role_names: list) -> bool:
        """Check if user has any of the specified roles"""
        if self.is_system_admin:
            return True
        return any(self.has_role(role) for role in role_names)
    
    def has_permission(self, permission_name: str) -> bool:
        """Check if user has a specific permission through their roles"""
        if self.is_system_admin:
            return True
        return any(
            permission.name == permission_name and permission.is_active
            for role in self.roles if role.is_active
            for permission in role.permissions
        )
    
    def needs_full_password(self) -> bool:
        """Check if user needs to enter full password (once per day)"""
        if not self.last_full_password_login:
            return True
        
        # Check if last full password login was more than 24 hours ago
        time_since_full_login = datetime.utcnow() - self.last_full_password_login
        return time_since_full_login.total_seconds() > 86400  # 24 hours


class Role(Base):
    """Role model for grouping permissions"""
    __tablename__ = "roles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)  # e.g., "nurse", "caregiver", "family", "admin"
    display_name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_system_role = Column(Boolean, default=False, nullable=False)  # Prevent deletion of core roles
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    users = relationship(
        "User",
        secondary=user_roles,
        back_populates="roles",
        lazy="selectin"
    )
    permissions = relationship(
        "Permission",
        secondary=role_permissions,
        back_populates="roles",
        lazy="selectin"
    )


class Permission(Base):
    """Permission model for granular access control"""
    __tablename__ = "permissions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)  # e.g., "medications.administer"
    display_name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    category = Column(String(50), nullable=False)  # e.g., "medications", "care_tasks", "equipment"
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    roles = relationship(
        "Role",
        secondary=role_permissions,
        back_populates="permissions",
        lazy="selectin"
    )


class AuditLog(Base):
    """Audit log for tracking user actions"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    action = Column(String(100), nullable=False)  # e.g., "medication.administered", "login.success"
    resource_type = Column(String(50), nullable=True)  # e.g., "medication", "care_task"
    resource_id = Column(Integer, nullable=True)
    details = Column(Text, nullable=True)  # JSON string with additional context
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="audit_logs")
