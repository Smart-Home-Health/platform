"""
Pydantic schemas for authentication
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class AccountLoginRequest(BaseModel):
    """Account login request (Layer 1)"""
    slug: str = Field(..., description="Account username/slug")
    password: str


class AccountAccessRequest(BaseModel):
    """Account access request - password only (single account). Optional password = restricted mode."""
    password: Optional[str] = Field(None, description="Account password; omit for add/chart-only (restricted) access")


class AccountLoginResponse(BaseModel):
    """Account login response - returns account-level token"""
    access_token: str
    token_type: str = "bearer"
    auth_level: str = "account"
    account: dict
    message: str = "Account authenticated. Please select a user profile."
    read_restricted: bool = False


class UserSelectRequest(BaseModel):
    """User selection request (Layer 2) - after account login"""
    user_id: int
    pin: Optional[str] = Field(None, min_length=4, max_length=8, description="PIN for quick auth")
    password: Optional[str] = Field(None, description="Full password (required once daily)")


class UserSelectResponse(BaseModel):
    """User selection response - returns full auth token"""
    access_token: str
    token_type: str = "bearer"
    auth_level: str = "full"
    account: dict
    user: dict
    requires_full_password: bool = False
    read_restricted: bool = False


class AccountUserItem(BaseModel):
    """User item for account user list"""
    id: int
    username: str
    full_name: str
    has_pin: bool
    requires_full_password: bool
    roles: List[dict] = []


class LoginRequest(BaseModel):
    """Login request with username and password"""
    username: str
    password: str


class PinVerifyRequest(BaseModel):
    """PIN verification request"""
    user_id: int
    pin: str = Field(..., min_length=4, max_length=8)


class TokenResponse(BaseModel):
    """Authentication token response"""
    access_token: str
    token_type: str = "bearer"
    user: dict
    requires_full_password: bool = False
    account_slug: Optional[str] = None  # Returned after first-run setup so user knows their login


class AccountUnlockRequest(BaseModel):
    """Request to unlock read access with account password"""
    password: str = Field(..., description="Account password")


class AccountUnlockResponse(BaseModel):
    """Response after successful unlock"""
    success: bool = True
    read_restricted: bool = False
    message: str = "Read access unlocked"


class SessionInfo(BaseModel):
    """Current session information"""
    user_id: Optional[int] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    account_id: Optional[int] = None
    auth_level: Optional[str] = None  # "account" | "full" | None
    is_authenticated: bool
    is_system_admin: bool = False
    requires_full_password: bool = False
    read_restricted: bool = False  # True = add/chart only; account password required to view data
    last_activity: Optional[datetime] = None
    last_full_password_login: Optional[datetime] = None
    roles: list[str] = []
    permissions: list[str] = []


class FirstRunSetup(BaseModel):
    """First run admin user and account setup"""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, description="Password for the user profile")
    full_name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None
    pin: Optional[str] = Field(None, min_length=4, max_length=8)
    account_name: Optional[str] = Field(None, max_length=100, description="Name for the account (defaults to full_name)")
    account_password: str = Field(..., min_length=8, description="Password for account-level login")


class FirstRunStatus(BaseModel):
    """First run status check"""
    is_first_run: bool
    has_admin: bool
    message: str
