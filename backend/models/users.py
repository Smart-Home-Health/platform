"""
User authentication and authorization models
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table, Text, JSON, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
from db import Base
import enum


class OrganizationType(enum.Enum):
    """Types of organizations"""
    PERSONAL = "personal"
    NURSING_AGENCY = "nursing_agency"
    HOSPICE = "hospice"
    HOME_HEALTH = "home_health"
    HOSPITAL = "hospital"
    CLINIC = "clinic"
    OTHER = "other"


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
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)  # Account this user belongs to
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
    account = relationship("Account", back_populates="users")
    roles = relationship(
        "Role",
        secondary=user_roles,
        back_populates="users",
        lazy="selectin"
    )
    
    # Relationships
    audit_logs = relationship("AuditLog", back_populates="user")
    organization_memberships = relationship(
        "OrganizationMembership",
        back_populates="user",
        foreign_keys="OrganizationMembership.user_id",
        lazy="selectin"
    )
    
    @property
    def organizations(self):
        """Get all organizations the user is a member of"""
        return [m.organization for m in self.organization_memberships if m.is_active]
    
    @property
    def has_pin(self) -> bool:
        """Check if user has a PIN set"""
        return self.pin_hash is not None
    
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


class Organization(Base):
    """Organization model for multi-tenancy support"""
    __tablename__ = "organizations"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)  # URL-friendly identifier
    org_type = Column(SQLEnum(OrganizationType), default=OrganizationType.OTHER, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)  # True for "Smart Home Health" default org
    is_active = Column(Boolean, default=True, nullable=False)
    settings = Column(JSON, nullable=True)  # Organization-specific settings
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    memberships = relationship("OrganizationMembership", back_populates="organization", cascade="all, delete-orphan")
    
    @property
    def members(self):
        """Get all users who are members of this organization"""
        return [m.user for m in self.memberships if m.is_active]
    
    @property
    def admins(self):
        """Get all admin users of this organization"""
        return [m.user for m in self.memberships if m.is_active and m.is_admin]


class OrganizationMembership(Base):
    """Junction table linking users to organizations with role information"""
    __tablename__ = "organization_memberships"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    role = Column(String(50), default="member", nullable=False)  # member, admin, owner
    is_admin = Column(Boolean, default=False, nullable=False)  # Can manage org settings and members
    is_active = Column(Boolean, default=True, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    invited_by_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="organization_memberships", foreign_keys=[user_id])
    organization = relationship("Organization", back_populates="memberships")
    invited_by = relationship("User", foreign_keys=[invited_by_user_id])


class Account(Base):
    """
    Account model - the primary tenant container.
    
    Hierarchy: Organization (SHH, Agency) -> Account (household/subscription) -> All Data
    
    Account is the login entity. Users belong to accounts and are selected after account login.
    All data (patients, equipment, medications, etc.) is scoped to an account.
    """
    __tablename__ = "accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True, index=True)
    name = Column(String(100), nullable=False)  # Display name, e.g., "Smith Family"
    slug = Column(String(100), unique=True, nullable=False, index=True)  # Login username
    password_hash = Column(String(255), nullable=False)  # bcrypt hash for account login
    is_default = Column(Boolean, default=False, nullable=False)  # Default account for migration
    is_active = Column(Boolean, default=True, nullable=False)
    settings = Column(JSON, nullable=True)  # Account-specific settings
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    timezone = Column(String(50), default="America/New_York", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    organization = relationship("Organization", backref="accounts")
    users = relationship("User", back_populates="account", lazy="selectin")
    
    @property
    def active_users(self):
        """Get all active users in this account"""
        return [u for u in self.users if u.is_active]
