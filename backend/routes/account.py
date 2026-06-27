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
Account management routes for the current authenticated account
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from zoneinfo import available_timezones
import bcrypt

from db import get_db
from dependencies import get_current_account_id, get_current_account, require_full_auth, require_read_access
from models.users import Account

router = APIRouter(prefix="/api/account", tags=["account"])


class AccountResponse(BaseModel):
    """Account details response"""
    id: int
    name: str
    slug: str
    timezone: Optional[str] = None
    is_active: bool
    is_default: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    organization: Optional[dict] = None
    
    class Config:
        from_attributes = True


class AccountUpdateRequest(BaseModel):
    """Request to update account details"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    slug: Optional[str] = Field(None, min_length=1, max_length=50, pattern=r'^[a-z0-9-]+$')
    timezone: Optional[str] = None

    @field_validator('timezone')
    @classmethod
    def validate_timezone(cls, v):
        """Reject anything that isn't a real IANA zone. The value is later
        embedded into SQL for day-bucketing (`AT TIME ZONE '<tz>'`); it is safe
        today only because reads re-validate via ZoneInfo, so enforce it at the
        source too (defense-in-depth + a clear 422 instead of silent fallback)."""
        if v is None:
            return v
        if v not in available_timezones():
            raise ValueError(f"Invalid timezone: {v!r} (expected an IANA name like 'America/New_York')")
        return v


class PasswordChangeRequest(BaseModel):
    """Request to change account password"""
    current_password: str
    new_password: str = Field(..., min_length=8)


@router.get("", response_model=AccountResponse)
def get_account(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """
    Get current account details.
    Requires at least account-level authentication.
    """
    # Build response with organization if available
    org_data = None
    if account.organization:
        org_data = {
            "id": account.organization.id,
            "name": account.organization.name
        }
    
    return AccountResponse(
        id=account.id,
        name=account.name,
        slug=account.slug,
        timezone=account.timezone,
        is_active=account.is_active,
        is_default=account.is_default,
        created_at=account.created_at.isoformat() if account.created_at else None,
        updated_at=account.updated_at.isoformat() if account.updated_at else None,
        organization=org_data
    )


@router.put("", response_model=AccountResponse)
def update_account(
    request: AccountUpdateRequest,
    account: Account = Depends(get_current_account),
    _: bool = Depends(require_full_auth),
    db: Session = Depends(get_db)
):
    """
    Update current account details.
    Requires full authentication (user must be selected).
    """
    # Check if slug is being changed and if it's already taken
    if request.slug and request.slug != account.slug:
        existing = db.query(Account).filter(
            Account.slug == request.slug,
            Account.id != account.id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Account ID (slug) is already taken"
            )
        account.slug = request.slug
    
    if request.name is not None:
        account.name = request.name
    
    if request.timezone is not None:
        account.timezone = request.timezone
    
    db.commit()
    db.refresh(account)
    
    # Build response
    org_data = None
    if account.organization:
        org_data = {
            "id": account.organization.id,
            "name": account.organization.name
        }
    
    return AccountResponse(
        id=account.id,
        name=account.name,
        slug=account.slug,
        timezone=account.timezone,
        is_active=account.is_active,
        is_default=account.is_default,
        created_at=account.created_at.isoformat() if account.created_at else None,
        updated_at=account.updated_at.isoformat() if account.updated_at else None,
        organization=org_data
    )


@router.put("/password")
def change_account_password(
    request: PasswordChangeRequest,
    account: Account = Depends(get_current_account),
    _: bool = Depends(require_full_auth),
    db: Session = Depends(get_db)
):
    """
    Change account password.
    Requires full authentication (user must be selected).
    """
    # Verify current password
    if not bcrypt.checkpw(request.current_password.encode('utf-8'), account.password_hash.encode('utf-8')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Hash and set new password
    new_hash = bcrypt.hashpw(request.new_password.encode('utf-8'), bcrypt.gensalt())
    account.password_hash = new_hash.decode('utf-8')
    
    db.commit()
    
    return {"message": "Password changed successfully"}
