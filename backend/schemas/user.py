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
    created_at: datetime
    updated_at: datetime
    roles: List[RoleResponse] = []
    
    class Config:
        from_attributes = True


class UserWithPermissions(UserResponse):
    """User response with calculated permissions"""
    permissions: List[str] = []


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
    
    class Config:
        from_attributes = True
