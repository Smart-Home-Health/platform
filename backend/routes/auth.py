"""
Authentication routes for login, session management, and first-run setup
"""
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List
import jwt
import os
import json
import logging

from db import get_db
from schemas.auth import (
    LoginRequest, PinVerifyRequest, TokenResponse, SessionInfo,
    FirstRunSetup, FirstRunStatus
)
from schemas.user import UserResponse, UserCreate, UserUpdate, UserListItem
from crud.users import (
    get_user_by_username, get_user_by_id, get_user_by_email, verify_password, verify_pin,
    update_login_timestamp, is_user_locked, increment_failed_login,
    get_active_users_for_selection, has_any_admin_user, create_user,
    update_activity_timestamp, create_audit_log, get_role_by_name,
    assign_role_to_user, get_all_users, update_user, delete_user,
    get_all_roles, assign_role_to_user as add_role_to_user,
    remove_role_from_user
)
from dependencies import get_current_user, require_permission
from models.users import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-secret-key-in-production")
ALGORITHM = "HS256"
SESSION_TIMEOUT_MINUTES = 30


def create_access_token(user: User, is_full_password: bool = False) -> str:
    """Create JWT access token for user"""
    expire = datetime.utcnow() + timedelta(minutes=SESSION_TIMEOUT_MINUTES)
    
    payload = {
        "user_id": user.id,
        "username": user.username,
        "role": user.roles[0].name if user.roles else None,
        "exp": expire,
        "is_full_password": is_full_password
    }
    
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_client_ip(request: Request) -> str:
    """Get client IP address from request"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0]
    return request.client.host if request.client else "unknown"


@router.get("/first-run", response_model=FirstRunStatus)
def check_first_run(db: Session = Depends(get_db)):
    """
    Check if this is the first run (no admin users exist).
    This endpoint is public and used to determine if setup is needed.
    """
    has_admin = has_any_admin_user(db)
    
    return FirstRunStatus(
        is_first_run=not has_admin,
        has_admin=has_admin,
        message="Admin user exists" if has_admin else "First run - admin setup required"
    )


@router.post("/first-run/setup", response_model=TokenResponse)
def first_run_setup(
    setup: FirstRunSetup,
    response: Response,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Create the first admin user during first-run setup.
    This endpoint is only available when no admin users exist.
    """
    # Check if admin already exists
    if has_any_admin_user(db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin user already exists"
        )
    
    # Check if username already exists
    if get_user_by_username(db, setup.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Get system_admin role
    admin_role = get_role_by_name(db, "system_admin")
    if not admin_role:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="System roles not initialized. Run database seed."
        )
    
    # Create admin user
    user = create_user(
        db,
        username=setup.username,
        password=setup.password,
        full_name=setup.full_name,
        email=setup.email,
        pin=setup.pin,
        is_system_admin=True,
        role_ids=[admin_role.id]
    )
    
    # Update login timestamp
    update_login_timestamp(db, user.id, is_full_password=True)
    
    # Create audit log
    create_audit_log(
        db,
        user_id=user.id,
        action="first_run.setup",
        details=json.dumps({"username": user.username, "full_name": user.full_name}),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent")
    )
    
    # Generate token
    token = create_access_token(user, is_full_password=True)
    
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        max_age=SESSION_TIMEOUT_MINUTES * 60,
        samesite="lax",
        secure=False  # Set to True in production with HTTPS
    )
    
    logger.info(f"First-run admin user created: {user.username}")
    
    return TokenResponse(
        access_token=token,
        user={
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "is_system_admin": user.is_system_admin,
            "roles": [{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles]
        },
        requires_full_password=False
    )


@router.get("/users/available", response_model=List[dict])
def get_available_users(db: Session = Depends(get_db)):
    """
    Get list of active users for login selection screen.
    Public endpoint to allow user selection before authentication.
    """
    return get_active_users_for_selection(db)


@router.post("/login", response_model=TokenResponse)
def login(
    credentials: LoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Full password login.
    Required once per day per user, or when PIN is not set.
    """
    user = get_user_by_username(db, credentials.username)
    
    if not user or not user.is_active:
        # Generic error to prevent username enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Check if account is locked
    if is_user_locked(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account temporarily locked. Try again later."
        )
    
    # Verify password
    if not verify_password(user, credentials.password):
        increment_failed_login(db, user.id)
        
        create_audit_log(
            db,
            user_id=user.id,
            action="login.failed",
            details=json.dumps({"reason": "invalid_password"}),
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent")
        )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Update login timestamp (full password login)
    update_login_timestamp(db, user.id, is_full_password=True)
    
    # Create audit log
    create_audit_log(
        db,
        user_id=user.id,
        action="login.success",
        details=json.dumps({"method": "password"}),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent")
    )
    
    # Generate token
    token = create_access_token(user, is_full_password=True)
    
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        max_age=SESSION_TIMEOUT_MINUTES * 60,
        samesite="lax",
        secure=False  # Set to True in production with HTTPS
    )
    
    logger.info(f"User logged in with password: {user.username}")
    
    return TokenResponse(
        access_token=token,
        user={
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "is_system_admin": user.is_system_admin,
            "has_pin": bool(user.pin_hash),
            "roles": [{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles],
            "permissions": [p.name for r in user.roles for p in r.permissions]
        },
        requires_full_password=False
    )


@router.post("/verify-pin", response_model=TokenResponse)
def verify_user_pin(
    pin_request: PinVerifyRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Quick re-authentication with PIN.
    Only works if user has entered full password within the last 24 hours.
    """
    user = get_user_by_id(db, pin_request.user_id)
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Check if user needs full password (daily requirement)
    if user.needs_full_password():
        create_audit_log(
            db,
            user_id=user.id,
            action="pin_auth.rejected",
            details=json.dumps({"reason": "requires_full_password"}),
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent")
        )
        
        return TokenResponse(
            access_token="",
            user={},
            requires_full_password=True
        )
    
    # Check if account is locked
    if is_user_locked(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account temporarily locked. Try again later."
        )
    
    # Verify PIN
    if not verify_pin(user, pin_request.pin):
        increment_failed_login(db, user.id)
        
        create_audit_log(
            db,
            user_id=user.id,
            action="pin_auth.failed",
            details=json.dumps({"reason": "invalid_pin"}),
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent")
        )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid PIN"
        )
    
    # Update login timestamp (PIN login - don't update full password time)
    update_login_timestamp(db, user.id, is_full_password=False)
    
    # Create audit log
    create_audit_log(
        db,
        user_id=user.id,
        action="pin_auth.success",
        details=json.dumps({"method": "pin"}),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent")
    )
    
    # Generate token
    token = create_access_token(user, is_full_password=False)
    
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        max_age=SESSION_TIMEOUT_MINUTES * 60,
        samesite="lax",
        secure=False  # Set to True in production with HTTPS
    )
    
    logger.info(f"User authenticated with PIN: {user.username}")
    
    return TokenResponse(
        access_token=token,
        user={
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "is_system_admin": user.is_system_admin,
            "has_pin": bool(user.pin_hash),
            "roles": [{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles],
            "permissions": [p.name for r in user.roles for p in r.permissions]
        },
        requires_full_password=False
    )


@router.post("/logout")
def logout(response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Logout current user by clearing session cookie"""
    
    # Create audit log
    create_audit_log(
        db,
        user_id=current_user.id,
        action="logout",
        details=json.dumps({"username": current_user.username})
    )
    
    # Clear session cookie
    response.delete_cookie(key="session_token")
    
    logger.info(f"User logged out: {current_user.username}")
    
    return {"message": "Logged out successfully"}


@router.get("/session", response_model=SessionInfo)
def get_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current session information.
    Used by frontend to check authentication status and permissions.
    """
    # Update activity timestamp
    update_activity_timestamp(db, current_user.id)
    
    # Get user permissions
    permissions = []
    if current_user.is_system_admin:
        permissions = ["*"]  # Indicate all permissions
    else:
        permissions = list(set([
            perm.name
            for role in current_user.roles if role.is_active
            for perm in role.permissions if perm.is_active
        ]))
    
    return SessionInfo(
        user_id=current_user.id,
        username=current_user.username,
        full_name=current_user.full_name,
        is_authenticated=True,
        requires_full_password=current_user.needs_full_password(),
        last_activity=current_user.last_activity,
        last_full_password_login=current_user.last_full_password_login,
        roles=[role.name for role in current_user.roles if role.is_active],
        permissions=permissions
    )


@router.get("/check-permission/{permission}")
def check_permission(
    permission: str,
    current_user: User = Depends(get_current_user)
):
    """Check if current user has a specific permission"""
    has_perm = current_user.has_permission(permission)
    
    return {
        "permission": permission,
        "has_permission": has_perm
    }


# ==================== User Management Endpoints ====================

@router.get("/users", response_model=List[UserListItem])
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of all users (requires authentication)"""
    users = get_all_users(db)
    
    return [
        UserListItem(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            email=user.email,
            is_active=user.is_active,
            is_system_admin=user.is_system_admin,
            has_pin=bool(user.pin_hash),
            roles=[{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles],
            created_at=user.created_at,
            last_login=user.last_login
        )
        for user in users
    ]


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: User = Depends(require_permission("users.view")),
    db: Session = Depends(get_db)
):
    """Get user by ID (requires users.view permission)"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        is_active=user.is_active,
        is_system_admin=user.is_system_admin,
        has_pin=bool(user.pin_hash),
        roles=[{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles],
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login=user.last_login
    )


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_new_user(
    user_data: UserCreate,
    current_user: User = Depends(require_permission("users.create")),
    db: Session = Depends(get_db)
):
    """Create new user (requires users.create permission)"""
    # Check if username exists
    if get_user_by_username(db, user_data.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # Check if email exists
    if user_data.email and get_user_by_email(db, user_data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already exists"
        )
    
    # Create user
    user = create_user(
        db,
        username=user_data.username,
        password=user_data.password,
        full_name=user_data.full_name,
        email=user_data.email,
        pin=user_data.pin,
        is_active=user_data.is_active
    )
    
    # Create audit log
    create_audit_log(
        db,
        user_id=current_user.id,
        action="user.created",
        details=json.dumps({"new_user_id": user.id, "username": user.username})
    )
    
    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        is_active=user.is_active,
        is_system_admin=user.is_system_admin,
        has_pin=bool(user.pin_hash),
        roles=[{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles],
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login=user.last_login
    )


@router.put("/users/{user_id}", response_model=UserResponse)
def update_existing_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(require_permission("users.edit")),
    db: Session = Depends(get_db)
):
    """Update user (requires users.edit permission)"""
    user = update_user(
        db,
        user_id=user_id,
        full_name=user_data.full_name,
        email=user_data.email,
        is_active=user_data.is_active
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update PIN if provided
    if user_data.pin and user_data.pin != '****':
        from crud.users import update_user_pin
        update_user_pin(db, user_id, user_data.pin)
    
    # Create audit log
    create_audit_log(
        db,
        user_id=current_user.id,
        action="user.updated",
        details=json.dumps({"updated_user_id": user_id, "username": user.username})
    )
    
    return UserResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        is_active=user.is_active,
        is_system_admin=user.is_system_admin,
        has_pin=bool(user.pin_hash),
        roles=[{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles],
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login=user.last_login
    )


@router.delete("/users/{user_id}")
def delete_existing_user(
    user_id: int,
    current_user: User = Depends(require_permission("users.delete")),
    db: Session = Depends(get_db)
):
    """Delete user (requires users.delete permission)"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent deleting admin users
    if user.is_system_admin or any(r.name == 'system_admin' for r in user.roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete admin user"
        )
    
    # Prevent self-deletion
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete your own account"
        )
    
    # Create audit log before deletion
    create_audit_log(
        db,
        user_id=current_user.id,
        action="user.deleted",
        details=json.dumps({"deleted_user_id": user_id, "username": user.username})
    )
    
    delete_user(db, user_id)
    
    return {"message": "User deleted successfully"}


@router.post("/users/{user_id}/roles")
def add_role(
    user_id: int,
    role_data: dict,
    current_user: User = Depends(require_permission("users.edit")),
    db: Session = Depends(get_db)
):
    """Assign role to user (requires users.edit permission)"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    role_id = role_data.get("role_id")
    expires_at = role_data.get("expires_at")
    
    success = add_role_to_user(db, user_id, role_id, expires_at)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to assign role"
        )
    
    # Create audit log
    create_audit_log(
        db,
        user_id=current_user.id,
        action="role.assigned",
        details=json.dumps({"user_id": user_id, "role_id": role_id})
    )
    
    return {"message": "Role assigned successfully"}


@router.delete("/users/{user_id}/roles/{role_id}")
def remove_role(
    user_id: int,
    role_id: int,
    current_user: User = Depends(require_permission("users.edit")),
    db: Session = Depends(get_db)
):
    """Remove role from user (requires users.edit permission)"""
    success = remove_role_from_user(db, user_id, role_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to remove role"
        )
    
    # Create audit log
    create_audit_log(
        db,
        user_id=current_user.id,
        action="role.removed",
        details=json.dumps({"user_id": user_id, "role_id": role_id})
    )
    
    return {"message": "Role removed successfully"}


# ==================== Roles Endpoints ====================

@router.get("/roles")
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of all roles (requires authentication)"""
    roles = get_all_roles(db)
    
    return [
        {
            "id": role.id,
            "name": role.name,
            "display_name": role.display_name,
            "description": role.description,
            "is_active": role.is_active,
            "permissions": [
                {"id": p.id, "name": p.name, "display_name": p.display_name}
                for p in role.permissions if p.is_active
            ]
        }
        for role in roles
    ]
