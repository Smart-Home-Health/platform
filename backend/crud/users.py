"""
CRUD operations for user authentication and authorization
"""
from sqlalchemy.orm import Session
from sqlalchemy import insert, delete, and_, or_
from datetime import datetime, timedelta
from typing import Optional, List
import bcrypt
import logging

from models.users import User, Role, Permission, AuditLog, user_roles, role_permissions

logger = logging.getLogger(__name__)


# ==================== User Operations ====================

def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """Get user by ID"""
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """Get user by username"""
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email"""
    return db.query(User).filter(User.email == email).first()


def get_all_users(db: Session, include_inactive: bool = False) -> List[User]:
    """Get all users"""
    query = db.query(User)
    if not include_inactive:
        query = query.filter(User.is_active == True)
    return query.all()


def get_active_users_for_selection(db: Session) -> List[dict]:
    """Get active users for login selection screen"""
    users = db.query(User).filter(User.is_active == True).all()
    return [
        {
            "id": user.id,
            "full_name": user.full_name,
            "username": user.username,
            "has_pin": bool(user.pin_hash),
            "requires_full_password": user.needs_full_password(),
            "role_names": [role.display_name for role in user.roles if role.is_active]
        }
        for user in users
    ]


def create_user(
    db: Session,
    username: str,
    password: str,
    full_name: str,
    email: Optional[str] = None,
    pin: Optional[str] = None,
    is_system_admin: bool = False,
    role_ids: List[int] = None
) -> User:
    """Create a new user with hashed password"""
    # Hash password
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    pin_hash = bcrypt.hashpw(pin.encode('utf-8'), bcrypt.gensalt()).decode('utf-8') if pin else None
    
    user = User(
        username=username,
        email=email,
        full_name=full_name,
        password_hash=password_hash,
        pin_hash=pin_hash,
        is_system_admin=is_system_admin
    )
    
    db.add(user)
    db.flush()
    
    # Assign roles
    if role_ids:
        for role_id in role_ids:
            assign_role_to_user(db, user.id, role_id)
    
    db.commit()
    db.refresh(user)
    
    logger.info(f"Created user: {username}")
    return user


def update_user(
    db: Session,
    user_id: int,
    full_name: Optional[str] = None,
    email: Optional[str] = None,
    is_active: Optional[bool] = None,
    role_ids: Optional[List[int]] = None
) -> Optional[User]:
    """Update user information"""
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    
    if full_name is not None:
        user.full_name = full_name
    if email is not None:
        user.email = email
    if is_active is not None:
        user.is_active = is_active
    
    # Update roles if provided
    if role_ids is not None:
        # Remove all existing roles
        db.execute(delete(user_roles).where(user_roles.c.user_id == user_id))
        # Assign new roles
        for role_id in role_ids:
            assign_role_to_user(db, user_id, role_id)
    
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    logger.info(f"Updated user: {user.username}")
    return user


def update_user_password(db: Session, user_id: int, new_password: str) -> bool:
    """Update user password"""
    user = get_user_by_id(db, user_id)
    if not user:
        return False
    
    password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user.password_hash = password_hash
    user.updated_at = datetime.utcnow()
    
    db.commit()
    logger.info(f"Password updated for user: {user.username}")
    return True


def update_user_pin(db: Session, user_id: int, pin: str) -> bool:
    """Update user PIN"""
    user = get_user_by_id(db, user_id)
    if not user:
        return False
    
    pin_hash = bcrypt.hashpw(pin.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user.pin_hash = pin_hash
    user.updated_at = datetime.utcnow()
    
    db.commit()
    logger.info(f"PIN updated for user: {user.username}")
    return True


def delete_user(db: Session, user_id: int) -> bool:
    """Delete a user"""
    user = get_user_by_id(db, user_id)
    if not user:
        return False
    
    # Remove all role associations first (cascade will handle this, but being explicit)
    db.execute(delete(user_roles).where(user_roles.c.user_id == user_id))
    
    # Delete the user
    db.delete(user)
    db.commit()
    
    logger.info(f"Deleted user: {user.username}")
    return True


def verify_password(user: User, password: str) -> bool:
    """Verify user password"""
    try:
        return bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


def verify_pin(user: User, pin: str) -> bool:
    """Verify user PIN"""
    if not user.pin_hash:
        return False
    try:
        return bcrypt.checkpw(pin.encode('utf-8'), user.pin_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"PIN verification error: {e}")
        return False


def update_login_timestamp(db: Session, user_id: int, is_full_password: bool = False):
    """Update user login timestamp"""
    user = get_user_by_id(db, user_id)
    if user:
        user.last_login = datetime.utcnow()
        user.last_activity = datetime.utcnow()
        if is_full_password:
            user.last_full_password_login = datetime.utcnow()
        user.failed_login_attempts = 0
        user.locked_until = None
        db.commit()


def update_activity_timestamp(db: Session, user_id: int):
    """Update user last activity timestamp"""
    user = get_user_by_id(db, user_id)
    if user:
        user.last_activity = datetime.utcnow()
        db.commit()


def increment_failed_login(db: Session, user_id: int, lockout_threshold: int = 5):
    """Increment failed login attempts and lock account if needed"""
    user = get_user_by_id(db, user_id)
    if user:
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= lockout_threshold:
            user.locked_until = datetime.utcnow() + timedelta(minutes=15)
            logger.warning(f"User {user.username} locked due to failed login attempts")
        db.commit()


def is_user_locked(user: User) -> bool:
    """Check if user account is locked"""
    if not user.locked_until:
        return False
    if datetime.utcnow() > user.locked_until:
        return False
    return True


def has_any_admin_user(db: Session) -> bool:
    """Check if any admin user exists (for first-run detection)"""
    admin_count = db.query(User).filter(
        or_(
            User.is_system_admin == True,
            User.roles.any(Role.name == 'system_admin')
        )
    ).count()
    return admin_count > 0


# ==================== Role Operations ====================

def get_role_by_id(db: Session, role_id: int) -> Optional[Role]:
    """Get role by ID"""
    return db.query(Role).filter(Role.id == role_id).first()


def get_role_by_name(db: Session, role_name: str) -> Optional[Role]:
    """Get role by name"""
    return db.query(Role).filter(Role.name == role_name).first()


def get_all_roles(db: Session, include_inactive: bool = False) -> List[Role]:
    """Get all roles"""
    query = db.query(Role)
    if not include_inactive:
        query = query.filter(Role.is_active == True)
    return query.all()


def create_role(
    db: Session,
    name: str,
    display_name: str,
    description: Optional[str] = None,
    permission_ids: List[int] = None
) -> Role:
    """Create a new role"""
    role = Role(
        name=name,
        display_name=display_name,
        description=description
    )
    
    db.add(role)
    db.flush()
    
    # Assign permissions
    if permission_ids:
        for perm_id in permission_ids:
            assign_permission_to_role(db, role.id, perm_id)
    
    db.commit()
    db.refresh(role)
    
    logger.info(f"Created role: {name}")
    return role


def assign_role_to_user(db: Session, user_id: int, role_id: int, expires_at: Optional[datetime] = None) -> bool:
    """Assign a role to a user"""
    try:
        stmt = insert(user_roles).values(
            user_id=user_id,
            role_id=role_id,
            expires_at=expires_at
        )
        db.execute(stmt)
        db.commit()
        return True
    except Exception as e:
        logger.error(f"Error assigning role to user: {e}")
        db.rollback()
        return False


def remove_role_from_user(db: Session, user_id: int, role_id: int) -> bool:
    """Remove a role from a user"""
    try:
        stmt = delete(user_roles).where(
            and_(
                user_roles.c.user_id == user_id,
                user_roles.c.role_id == role_id
            )
        )
        db.execute(stmt)
        db.commit()
        return True
    except Exception as e:
        logger.error(f"Error removing role from user: {e}")
        db.rollback()
        return False


# ==================== Permission Operations ====================

def get_permission_by_id(db: Session, permission_id: int) -> Optional[Permission]:
    """Get permission by ID"""
    return db.query(Permission).filter(Permission.id == permission_id).first()


def get_permission_by_name(db: Session, permission_name: str) -> Optional[Permission]:
    """Get permission by name"""
    return db.query(Permission).filter(Permission.name == permission_name).first()


def get_all_permissions(db: Session, category: Optional[str] = None) -> List[Permission]:
    """Get all permissions, optionally filtered by category"""
    query = db.query(Permission).filter(Permission.is_active == True)
    if category:
        query = query.filter(Permission.category == category)
    return query.all()


def create_permission(
    db: Session,
    name: str,
    display_name: str,
    category: str,
    description: Optional[str] = None
) -> Permission:
    """Create a new permission"""
    permission = Permission(
        name=name,
        display_name=display_name,
        category=category,
        description=description
    )
    
    db.add(permission)
    db.commit()
    db.refresh(permission)
    
    logger.info(f"Created permission: {name}")
    return permission


def assign_permission_to_role(db: Session, role_id: int, permission_id: int) -> bool:
    """Assign a permission to a role"""
    try:
        stmt = insert(role_permissions).values(
            role_id=role_id,
            permission_id=permission_id
        )
        db.execute(stmt)
        db.commit()
        return True
    except Exception as e:
        logger.error(f"Error assigning permission to role: {e}")
        db.rollback()
        return False


# ==================== Audit Log Operations ====================

def create_audit_log(
    db: Session,
    user_id: Optional[int],
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None,
    details: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """Create an audit log entry"""
    audit_log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    db.add(audit_log)
    db.commit()


def get_audit_logs(
    db: Session,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 100
) -> List[AuditLog]:
    """Get audit logs with optional filters"""
    query = db.query(AuditLog)
    
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    if start_date:
        query = query.filter(AuditLog.timestamp >= start_date)
    if end_date:
        query = query.filter(AuditLog.timestamp <= end_date)
    
    return query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
