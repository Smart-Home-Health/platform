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

import re

from db import get_db
from schemas.auth import (
    LoginRequest, PinVerifyRequest, TokenResponse, SessionInfo,
    FirstRunSetup, FirstRunStatus,
    AccountLoginRequest, AccountLoginResponse, AccountAccessRequest,
    AccountUnlockRequest, AccountUnlockResponse,
    UserSelectRequest, UserSelectResponse, AccountUserItem
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
from schemas.patient import Patient
from dependencies import get_current_user, require_permission, get_current_account_id, get_current_account, require_full_auth, require_read_access
from models.users import User, Account
import bcrypt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-secret-key-in-production")
ALGORITHM = "HS256"
SESSION_TIMEOUT_MINUTES = 30
ACCOUNT_SESSION_HOURS = 24  # Account-level cookie lasts 24h per browser


def create_access_token(
    user: User = None,
    account: Account = None,
    is_full_password: bool = False,
    auth_level: str = "full",
    read_restricted: bool = False
) -> str:
    """
    Create JWT access token.

    For account-level auth (auth_level="account"):
        - Only account_id is required
        - user_id will be None

    For full auth (auth_level="full"):
        - Both account_id and user_id are included

    read_restricted: when True, session can only add/chart; cannot read sensitive data.
    """
    expire = datetime.utcnow() + timedelta(minutes=SESSION_TIMEOUT_MINUTES)

    payload = {
        "account_id": account.id if account else (user.account_id if user else None),
        "user_id": user.id if user and auth_level == "full" else None,
        "username": user.username if user else None,
        "role": user.roles[0].name if user and user.roles else None,
        "auth_level": auth_level,
        "exp": expire,
        "is_full_password": is_full_password,
        "read_restricted": read_restricted,
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _set_account_cookie(response: Response, account: Account, read_restricted: bool = False):
    """Set a long-lived account_token cookie (24h) so the browser stays at account-level
    auth even after the shorter session_token expires."""
    expire = datetime.utcnow() + timedelta(hours=ACCOUNT_SESSION_HOURS)
    payload = {
        "account_id": account.id,
        "auth_level": "account",
        "read_restricted": read_restricted,
        "exp": expire,
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    response.set_cookie(
        key="account_token",
        value=token,
        httponly=True,
        max_age=ACCOUNT_SESSION_HOURS * 3600,
        samesite="lax",
        secure=False,
    )


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
    Create the first account and admin user during first-run setup.
    This endpoint is only available when no admin users exist.
    
    Flow:
    1. Create account (with password for account-level login)
    2. Create admin user attached to account
    3. Create default patient using the username
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
    
    # Determine account name (use provided account_name or fall back to full_name)
    account_name = setup.account_name or setup.full_name
    
    # Generate slug from account name (lowercase, alphanumeric and hyphens only)
    account_slug = re.sub(r'[^a-z0-9]+', '-', account_name.lower()).strip('-')
    
    # Hash password for account (separate from user password)
    account_password_hash = bcrypt.hashpw(setup.account_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Create account first
    account = Account(
        name=account_name,
        slug=account_slug,
        password_hash=account_password_hash,
        is_default=True,
        is_active=True,
        contact_email=setup.email
    )
    db.add(account)
    db.flush()  # Get account ID without committing
    
    # Hash user password and PIN
    user_password_hash = bcrypt.hashpw(setup.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    pin_hash = bcrypt.hashpw(setup.pin.encode('utf-8'), bcrypt.gensalt()).decode('utf-8') if setup.pin else None
    
    # Create admin user directly (not via create_user to control transaction)
    user = User(
        username=setup.username,
        email=setup.email,
        full_name=setup.full_name,
        password_hash=user_password_hash,
        pin_hash=pin_hash,
        is_system_admin=True,
        is_active=True,
        account_id=account.id
    )
    db.add(user)
    db.flush()  # Get user ID
    
    # Assign system_admin role
    from models.users import user_roles
    db.execute(
        user_roles.insert().values(user_id=user.id, role_id=admin_role.id)
    )
    
    # Create default patient using the username
    from datetime import datetime as dt
    patient = Patient(
        first_name=setup.username,
        last_name="",
        date_of_birth=dt(1900, 1, 1),
        medical_record_number=f"DEFAULT-{account.id}",
        is_active=True,
        notes="Default patient created during first-run setup",
        account_id=account.id,
        owner_user_id=user.id,
        created_at=dt.utcnow(),
        updated_at=dt.utcnow()
    )
    db.add(patient)
    
    # Commit entire transaction at once
    db.commit()
    db.refresh(user)
    db.refresh(account)
    
    # Update login timestamp
    update_login_timestamp(db, user.id, is_full_password=True)
    
    # Create audit log
    create_audit_log(
        db,
        user_id=user.id,
        action="first_run.setup",
        details=json.dumps({
            "username": user.username,
            "full_name": user.full_name,
            "account_name": account.name,
            "account_id": account.id
        }),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent")
    )
    
    # Generate token with account
    token = create_access_token(user, account=account, is_full_password=True)
    
    # Set httpOnly cookie
    # samesite="lax" works for same-site cross-port requests over HTTP
    # For dev with different ports (5173->8000), we need none to allow cross-origin POST
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        max_age=SESSION_TIMEOUT_MINUTES * 60,
        samesite="lax",
        secure=False  # Set to True in production with HTTPS
    )
    
    logger.info(f"First-run setup completed: account '{account.name}' (slug='{account.slug}', id={account.id}), admin user '{user.username}'")
    
    return TokenResponse(
        access_token=token,
        user={
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "account_id": account.id,
            "is_system_admin": user.is_system_admin,
            "roles": [{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles]
        },
        requires_full_password=False,
        account_slug=account.slug  # Return slug so user knows their account login
    )


# ==================================
# ACCOUNT AUTHENTICATION (Layer 1)
# ==================================

@router.post("/account/login", response_model=AccountLoginResponse)
def account_login(
    credentials: AccountLoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Account login (Layer 1 of two-layer auth).
    
    Authenticates the account and returns an account-level token.
    User must then select a user profile to get full access.
    """
    # Find account by slug
    account = db.query(Account).filter(Account.slug == credentials.slug).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid account credentials"
        )
    
    if not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    # Verify password
    if not bcrypt.checkpw(credentials.password.encode('utf-8'), account.password_hash.encode('utf-8')):
        create_audit_log(
            db,
            user_id=None,
            action="account.login.failed",
            details=json.dumps({"account_slug": credentials.slug, "reason": "invalid_password"}),
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent")
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid account credentials"
        )
    
    # Create account-level token (with password = full read access)
    token = create_access_token(account=account, auth_level="account", read_restricted=False)

    # Set httpOnly cookie (short-lived session)
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        max_age=SESSION_TIMEOUT_MINUTES * 60,
        samesite="lax",
        secure=False  # Set to True in production with HTTPS
    )
    # Set long-lived account cookie (24h) so password isn't re-prompted
    _set_account_cookie(response, account, read_restricted=False)

    # Create audit log
    create_audit_log(
        db,
        user_id=None,
        action="account.login.success",
        details=json.dumps({"account_id": account.id, "account_name": account.name}),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent")
    )
    
    logger.info(f"Account logged in: {account.name} ({account.slug})")
    
    return AccountLoginResponse(
        access_token=token,
        account={
            "id": account.id,
            "name": account.name,
            "slug": account.slug
        },
        read_restricted=False
    )


@router.post("/account/access", response_model=AccountLoginResponse)
def account_access(
    body: AccountAccessRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Account access with optional password (single-account flow).
    - No password or empty: issue account token with read_restricted=True (add/chart only).
    - Valid password: issue account token with read_restricted=False (full read access).
    Uses the default (or only) account; no slug required.
    """
    account = db.query(Account).filter(Account.is_default == True, Account.is_active == True).first()
    if not account:
        account = db.query(Account).filter(Account.is_active == True).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account available"
        )

    password_provided = body.password and body.password.strip()
    read_restricted = True

    if password_provided:
        if not bcrypt.checkpw(body.password.encode("utf-8"), account.password_hash.encode("utf-8")):
            create_audit_log(
                db,
                user_id=None,
                action="account.access.failed",
                details=json.dumps({"account_id": account.id, "reason": "invalid_password"}),
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent"),
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid account credentials"
            )
        read_restricted = False

    token = create_access_token(account=account, auth_level="account", read_restricted=read_restricted)
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        max_age=SESSION_TIMEOUT_MINUTES * 60,
        samesite="lax",
        secure=False,
    )
    _set_account_cookie(response, account, read_restricted=read_restricted)
    create_audit_log(
        db,
        user_id=None,
        action="account.access.success",
        details=json.dumps({
            "account_id": account.id,
            "read_restricted": read_restricted,
        }),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    return AccountLoginResponse(
        access_token=token,
        account={"id": account.id, "name": account.name, "slug": account.slug},
        read_restricted=read_restricted,
        message="Account authenticated. Please select a user profile." if not read_restricted else "Restricted mode. Select a user to log or record only.",
    )


@router.get("/account/users", response_model=List[AccountUserItem])
def get_account_users(
    request: Request,
    db: Session = Depends(get_db),
    account_id: int = Depends(get_current_account_id)
):
    """
    Get list of users belonging to the current account.
    
    Requires account-level authentication (available after account login).
    Used to display user profiles for selection.
    """
    users = db.query(User).filter(
        User.account_id == account_id,
        User.is_active == True
    ).all()
    
    return [
        AccountUserItem(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            has_pin=bool(user.pin_hash),
            requires_full_password=user.needs_full_password(),
            roles=[{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles]
        )
        for user in users
    ]


@router.post("/account/unlock", response_model=AccountUnlockResponse)
def account_unlock(
    body: AccountUnlockRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    account_id: int = Depends(get_current_account_id),
):
    """
    Unlock read access by verifying account password.
    Re-issues the current token with read_restricted=False.
    Requires an existing session (account-level or full).
    """
    account = db.query(Account).filter(Account.id == account_id, Account.is_active == True).first()
    if not account:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found")

    if not bcrypt.checkpw(body.password.encode("utf-8"), account.password_hash.encode("utf-8")):
        create_audit_log(
            db,
            user_id=getattr(request.state, "user_id", None),
            action="account.unlock.failed",
            details=json.dumps({"account_id": account_id, "reason": "invalid_password"}),
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid account password")

    user_id = getattr(request.state, "user_id", None)
    auth_level = getattr(request.state, "auth_level", "account")
    user = get_user_by_id(db, user_id) if user_id else None
    is_full_password = getattr(request.state, "is_full_password", False) if user else False

    token = create_access_token(
        user=user,
        account=account,
        is_full_password=is_full_password,
        auth_level=auth_level,
        read_restricted=False,
    )
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        max_age=SESSION_TIMEOUT_MINUTES * 60,
        samesite="lax",
        secure=False,
    )
    # Refresh account cookie with unrestricted access
    _set_account_cookie(response, account, read_restricted=False)
    create_audit_log(
        db,
        user_id=user_id,
        action="account.unlock.success",
        details=json.dumps({"account_id": account_id}),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    return AccountUnlockResponse(success=True, read_restricted=False, message="Read access unlocked")


@router.post("/user/select", response_model=UserSelectResponse)
def select_user(
    selection: UserSelectRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    account_id: int = Depends(get_current_account_id)
):
    """
    Select a user profile (Layer 2 of two-layer auth).
    
    After account login, user selects their profile and authenticates with PIN or password.
    Returns full auth token with both account and user context.
    """
    # Get user
    user = get_user_by_id(db, selection.user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Verify user belongs to the authenticated account
    if user.account_id != account_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not belong to this account"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    # Check if account is locked
    if is_user_locked(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account temporarily locked. Try again later."
        )
    
    is_full_password = False
    
    # Determine auth method
    if selection.password:
        # Full password authentication
        if not verify_password(user, selection.password):
            increment_failed_login(db, user.id)
            create_audit_log(
                db,
                user_id=user.id,
                action="user.select.failed",
                details=json.dumps({"reason": "invalid_password"}),
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent")
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        is_full_password = True
        update_login_timestamp(db, user.id, is_full_password=True)
        
    elif selection.pin:
        # PIN authentication - only if password was entered in last 24h
        if user.needs_full_password():
            return UserSelectResponse(
                access_token="",
                auth_level="account",  # Stay at account level
                account={"id": account_id, "name": "", "slug": ""},
                user={
                    "id": user.id,
                    "username": user.username,
                    "full_name": user.full_name
                },
                requires_full_password=True
            )
        
        if not verify_pin(user, selection.pin):
            increment_failed_login(db, user.id)
            create_audit_log(
                db,
                user_id=user.id,
                action="user.select.failed",
                details=json.dumps({"reason": "invalid_pin"}),
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("User-Agent")
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid PIN"
            )
        update_login_timestamp(db, user.id, is_full_password=False)
        
    else:
        # No credentials provided
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PIN or password required"
        )
    
    # Get account for response
    account = db.query(Account).filter(Account.id == account_id).first()

    # Inherit read_restricted from current account token (set by middleware)
    read_restricted = getattr(request.state, "read_restricted", False)

    # Create full auth token
    token = create_access_token(
        user=user, account=account, is_full_password=is_full_password,
        auth_level="full", read_restricted=read_restricted
    )
    
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        max_age=SESSION_TIMEOUT_MINUTES * 60,
        samesite="lax",
        secure=False  # Set to True in production with HTTPS
    )
    
    # Create audit log
    create_audit_log(
        db,
        user_id=user.id,
        action="user.select.success",
        details=json.dumps({"method": "password" if is_full_password else "pin"}),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent")
    )
    
    logger.info(f"User selected: {user.username} in account {account.name}")
    
    return UserSelectResponse(
        access_token=token,
        account={
            "id": account.id,
            "name": account.name,
            "slug": account.slug
        },
        user={
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "is_system_admin": user.is_system_admin,
            "has_pin": bool(user.pin_hash),
            "roles": [{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles],
            "permissions": [p.name for r in user.roles for p in r.permissions]
        },
        requires_full_password=False,
        read_restricted=read_restricted
    )


# ==================================
# LEGACY USER AUTHENTICATION
# ==================================

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
    
    # Get user's account for token
    account = db.query(Account).filter(Account.id == user.account_id).first() if user.account_id else None
    
    # Generate token (with account context for new two-layer system)
    token = create_access_token(user=user, account=account, is_full_password=True, auth_level="full")
    
    # Set httpOnly cookie
    # samesite="lax" works for same-site cross-port requests over HTTP
    # For dev with different ports (5173->8000), we need none to allow cross-origin POST
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
            "account_id": user.account_id,
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
    
    # Get user's account for token
    account = db.query(Account).filter(Account.id == user.account_id).first() if user.account_id else None
    
    # Generate token (with account context)
    token = create_access_token(user=user, account=account, is_full_password=False, auth_level="full")
    
    # Set httpOnly cookie
    # samesite="lax" works for same-site cross-port requests over HTTP
    # For dev with different ports (5173->8000), we need none to allow cross-origin POST
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
            "account_id": user.account_id,
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
    
    # Clear both session and account cookies
    response.delete_cookie(key="session_token")
    response.delete_cookie(key="account_token")
    
    logger.info(f"User logged out: {current_user.username}")
    
    return {"message": "Logged out successfully"}


@router.get("/session", response_model=SessionInfo)
def get_session(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Get current session information.
    Used by frontend to check authentication status and permissions.
    
    Returns info based on auth level:
    - No auth: is_authenticated=False
    - Account-only: account_id, auth_level="account"
    - Full: account_id, user info, auth_level="full"
    """
    # Since /session is a public route, middleware doesn't run.
    # Check session_token first, fall back to long-lived account_token.
    from middleware import AuthenticationMiddleware as _mw

    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    payload = _mw._decode_token(token) if token else None

    # Fall back to the 24h account cookie
    if payload is None:
        account_token = request.cookies.get("account_token")
        if account_token:
            payload = _mw._decode_token(account_token)

    if payload is None:
        return SessionInfo(is_authenticated=False)

    account_id = payload.get("account_id")
    user_id = payload.get("user_id")
    auth_level = payload.get("auth_level")
    read_restricted = payload.get("read_restricted", False)
    
    # No account - not authenticated
    if not account_id:
        return SessionInfo(is_authenticated=False)
    
    # Account-only auth (no user selected yet)
    if auth_level == "account" or not user_id:
        return SessionInfo(
            account_id=account_id,
            auth_level="account",
            is_authenticated=False,  # Not fully authenticated until user is selected
            read_restricted=read_restricted
        )
    
    # Full auth - get user details
    current_user = get_user_by_id(db, user_id)
    if not current_user:
        return SessionInfo(
            account_id=account_id,
            auth_level="account",
            is_authenticated=False
        )
    
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
        account_id=account_id,
        auth_level="full",
        is_authenticated=True,
        is_system_admin=current_user.is_system_admin,
        requires_full_password=current_user.needs_full_password(),
        read_restricted=read_restricted,
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
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
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
    current_user: User = Depends(require_permission("users.read")),
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get user by ID (requires users.read permission)"""
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
        is_active=user_data.is_active,
        role_ids=user_data.role_ids
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
    current_user: User = Depends(require_permission("users.update")),
    db: Session = Depends(get_db)
):
    """Update user (requires users.update permission)"""
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
    current_user: User = Depends(require_permission("users.update")),
    db: Session = Depends(get_db)
):
    """Assign role to user (requires users.update permission)"""
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
    current_user: User = Depends(require_permission("users.update")),
    db: Session = Depends(get_db)
):
    """Remove role from user (requires users.update permission)"""
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
