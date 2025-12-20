"""
Pydantic schemas for authentication
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


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


class SessionInfo(BaseModel):
    """Current session information"""
    user_id: int
    username: str
    full_name: str
    is_authenticated: bool
    requires_full_password: bool
    last_activity: Optional[datetime] = None
    last_full_password_login: Optional[datetime] = None
    roles: list[str] = []
    permissions: list[str] = []


class FirstRunSetup(BaseModel):
    """First run admin user setup"""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None
    pin: Optional[str] = Field(None, min_length=4, max_length=8)


class FirstRunStatus(BaseModel):
    """First run status check"""
    is_first_run: bool
    has_admin: bool
    message: str
