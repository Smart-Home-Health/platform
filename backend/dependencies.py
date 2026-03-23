"""
FastAPI dependencies for authentication and authorization
"""
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import Optional, List
from db import get_db
from crud.users import get_user_by_id
from models.users import User, Account
import logging

logger = logging.getLogger(__name__)


async def get_current_account_id(request: Request) -> int:
    """
    Get the current account ID from request state.

    This is set by the middleware after JWT validation.
    Returns the account_id from the token - available for both "account" and "full" auth levels.
    """
    account_id = getattr(request.state, "account_id", None) or request.scope.get("account_id")

    if not account_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated to an account"
        )

    return account_id


async def get_optional_account_id(request: Request) -> Optional[int]:
    """
    Get the current account ID if authenticated, otherwise None.
    Use for routes that scope by account when present but still work without auth.
    """
    return getattr(request.state, "account_id", None) or request.scope.get("account_id")


async def get_current_account(
    request: Request, 
    db: Session = Depends(get_db)
) -> Account:
    """
    Get the current authenticated account from request state.
    
    Available for both "account" and "full" auth levels.
    """
    account_id = await get_current_account_id(request)
    
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found"
        )
    
    if not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    return account


async def get_auth_level(request: Request) -> str:
    """
    Get the current auth level from request state.
    
    Returns "account" for account-only auth, "full" for full user auth.
    """
    return getattr(request.state, "auth_level", None) or request.scope.get("auth_level", "full")


async def require_read_access(request: Request) -> bool:
    """
    Dependency that blocks access when session is read-restricted (add/chart only).
    Use on routes that return sensitive or read data; omit on chart/add POSTs.
    """
    read_restricted = getattr(request.state, "read_restricted", False) or request.scope.get("read_restricted", False)
    if read_restricted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account password required to view data"
        )
    return True


async def require_full_auth(request: Request) -> bool:
    """
    Dependency that ensures user has full auth (not just account-level).
    
    Use this on routes that require a specific user to be selected.
    """
    auth_level = await get_auth_level(request)
    
    if auth_level != "full":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Full authentication required. Please select a user profile."
        )
    
    user_id = getattr(request.state, "user_id", None) or request.scope.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User selection required"
        )
    
    return True


async def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Get the current authenticated user from request state.
    
    This dependency should be used on protected routes to ensure user is authenticated.
    The middleware adds user_id to request.state after validating the JWT token.
    """
    # Try request.state first, then fall back to scope (BaseHTTPMiddleware compatibility)
    user_id = getattr(request.state, "user_id", None) or request.scope.get("user_id")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user (alias for get_current_user)"""
    return current_user


async def get_optional_user(
    request: Request, 
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Get the current user if authenticated, otherwise return None.
    
    Use this for routes that can work with or without authentication.
    """
    user_id = getattr(request.state, "user_id", None)
    
    if not user_id:
        return None
    
    user = get_user_by_id(db, user_id)
    return user if user and user.is_active else None


class PermissionChecker:
    """
    Dependency class to check if user has required permissions.
    
    Usage:
        @app.get("/api/medications", dependencies=[Depends(PermissionChecker(["medications.view"]))])
    """
    
    def __init__(self, required_permissions: List[str]):
        self.required_permissions = required_permissions
    
    async def __call__(self, current_user: User = Depends(get_current_user)):
        # System admins have all permissions
        if current_user.is_system_admin:
            return current_user
        
        # Check if user has all required permissions
        for permission in self.required_permissions:
            if not current_user.has_permission(permission):
                logger.warning(
                    f"User {current_user.username} denied access - missing permission: {permission}"
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing required permission: {permission}"
                )
        
        return current_user


class RoleChecker:
    """
    Dependency class to check if user has required roles.
    
    Usage:
        @app.get("/api/admin", dependencies=[Depends(RoleChecker(["system_admin", "nurse"]))])
    """
    
    def __init__(self, required_roles: List[str]):
        self.required_roles = required_roles
    
    async def __call__(self, current_user: User = Depends(get_current_user)):
        # System admins have all roles
        if current_user.is_system_admin:
            return current_user
        
        # Check if user has any of the required roles
        if not current_user.has_any_role(self.required_roles):
            logger.warning(
                f"User {current_user.username} denied access - missing role from: {self.required_roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required role: one of {self.required_roles}"
            )
        
        return current_user


def require_permission(permission: str):
    """
    Convenience function to create a permission checker dependency.
    
    Usage:
        @app.post("/api/medications", dependencies=[Depends(require_permission("medications.administer"))])
    """
    return PermissionChecker([permission])


def require_any_permission(*permissions: str):
    """
    Create a dependency that requires ANY of the specified permissions.
    
    Usage:
        @app.get("/api/data", dependencies=[Depends(require_any_permission("data.view", "data.manage"))])
    """
    class AnyPermissionChecker:
        async def __call__(self, current_user: User = Depends(get_current_user)):
            if current_user.is_system_admin:
                return current_user
            
            for permission in permissions:
                if current_user.has_permission(permission):
                    return current_user
            
            logger.warning(
                f"User {current_user.username} denied access - missing any permission from: {permissions}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission: one of {permissions}"
            )
    
    return AnyPermissionChecker()


def require_role(role: str):
    """
    Convenience function to create a role checker dependency.
    
    Usage:
        @app.get("/api/admin", dependencies=[Depends(require_role("system_admin"))])
    """
    return RoleChecker([role])
