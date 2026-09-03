# Smart Home Health
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""
Pydantic schemas for user authentication and authorization
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime


class PermissionBase(BaseModel):
    """Base permission schema"""
    name: str
    display_name: str
    description: Optional[str] = None
    category: str
    is_active: bool = True


class PermissionResponse(PermissionBase):
    """Permission response schema"""
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class RoleBase(BaseModel):
    """Base role schema"""
    name: str
    display_name: str
    description: Optional[str] = None
    is_active: bool = True


class RoleCreate(RoleBase):
    """Role creation schema"""
    permission_ids: List[int] = []


class RoleUpdate(BaseModel):
    """Role update schema"""
    display_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    permission_ids: Optional[List[int]] = None


class RoleResponse(RoleBase):
    """Role response schema"""
    id: int
    is_system_role: bool
    created_at: datetime
    updated_at: datetime
    permissions: List[PermissionResponse] = []
    
    class Config:
        from_attributes = True


class UserBase(BaseModel):
    """Base user schema"""
    username: str = Field(..., min_length=3, max_length=50)
    full_name: str = Field(..., min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    is_active: bool = True


class UserCreate(UserBase):
    """User creation schema"""
    password: str = Field(..., min_length=8)
    pin: Optional[str] = Field(None, min_length=4, max_length=8)
    is_system_admin: bool = False
    role_ids: List[int] = []
    
    @field_validator('pin')
    @classmethod
    def validate_pin(cls, v):
        if v is not None and not v.isdigit():
            raise ValueError('PIN must contain only digits')
        return v


class UserUpdate(BaseModel):
    """User update schema"""
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    role_ids: Optional[List[int]] = None
    pin: Optional[str] = Field(None, min_length=4, max_length=8)

    @field_validator('pin')
    @classmethod
    def validate_pin(cls, v):
        if v is not None and not v.isdigit():
            raise ValueError('PIN must contain only digits')
        return v


class AdminPasswordReset(BaseModel):
    """System-admin direct password reset for another user."""
    new_password: str = Field(..., min_length=8)
    require_change: bool = False


# The UI preferences a user may store, with their allowed values. The column is
# free-form JSON, so this is the only thing keeping it tidy: an unknown key or
# value is a 422, not a silently stored typo the frontend then ignores.
ALLOWED_PREFERENCES = {
    "theme": {"light", "dark", "system"},
    "contrast": {"normal", "high"},
}


class UserPreferencesUpdate(BaseModel):
    """Partial update of the current user's UI preferences (shallow-merged)."""
    preferences: dict = Field(..., description='e.g. {"theme": "light|dark|system", "contrast": "normal|high"}')

    @field_validator('preferences')
    @classmethod
    def validate_preferences(cls, v):
        for key, value in v.items():
            allowed = ALLOWED_PREFERENCES.get(key)
            if allowed is None:
                raise ValueError(f'unknown preference {key!r}; allowed: {sorted(ALLOWED_PREFERENCES)}')
            if value not in allowed:
                raise ValueError(f'{key} must be one of {sorted(allowed)}')
        return v


class UserPasswordUpdate(BaseModel):
    """Password update schema"""
    current_password: str
    new_password: str = Field(..., min_length=8)


class UserPinUpdate(BaseModel):
    """PIN update schema"""
    pin: str = Field(..., min_length=4, max_length=8)
    
    @field_validator('pin')
    @classmethod
    def validate_pin(cls, v):
        if not v.isdigit():
            raise ValueError('PIN must contain only digits')
        return v


class UserResponse(UserBase):
    """User response schema"""
    id: int
    is_system_admin: bool
    has_pin: bool
    force_password_reset: bool = False
    last_login: Optional[datetime] = None
    last_activity: Optional[datetime] = None
    last_full_password_login: Optional[datetime] = None
    preferences: Optional[dict] = None
    avatar_seed: Optional[str] = None
    avatar_photo: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    roles: List[RoleResponse] = []

    class Config:
        from_attributes = True


class UserWithPermissions(UserResponse):
    """User response with calculated permissions"""
    permissions: List[str] = []


class UserActivityEntry(BaseModel):
    """One recorded event on a user's account, as the user screen reads it.

    Sourced from ``audit_logs`` only — there is no synthesised activity here.
    ``actor_name`` is set when somebody *else* caused the entry (an
    administrator resetting a password, say) and is None for the user's own
    sign-in events.
    """
    id: int
    action: str
    timestamp: datetime
    ip_address: Optional[str] = None
    actor_name: Optional[str] = None


class RoleListItem(BaseModel):
    """Simplified role for lists"""
    id: int
    name: str
    display_name: str


class UserListItem(BaseModel):
    """Simplified user for lists"""
    id: int
    username: str
    full_name: str
    email: Optional[str] = None
    is_active: bool
    is_system_admin: bool = False
    has_pin: bool
    force_password_reset: bool = False
    roles: List[RoleListItem] = []
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    avatar_seed: Optional[str] = None
    avatar_photo: Optional[str] = None
    
    class Config:
        from_attributes = True
