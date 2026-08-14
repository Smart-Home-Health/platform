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
"""Pydantic request/response models for the HA ingress identity routes."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class HAIdentityInfo(BaseModel):
    """The HA user attached to the current ingress request."""
    ha_user_id: str
    username: Optional[str] = None
    display_name: Optional[str] = None


class HALoginResponse(BaseModel):
    """Response for POST /api/auth/ha/login.

    mapped=True  → full session as the linked app user (mirrors UserSelectResponse).
    mapped=False → account-level session; the client proceeds to the user picker.
    """
    access_token: str
    token_type: str = "bearer"
    auth_level: str  # "full" | "account"
    mapped: bool
    identity: Optional[HAIdentityInfo] = None  # None when Core sends no headers
    account: dict
    user: Optional[dict] = None
    read_restricted: bool = False


class HAStatusResponse(BaseModel):
    """Current request's ingress identity + mapping, for banners/link-current-identity."""
    ingress_trusted: bool
    identity: Optional[HAIdentityInfo] = None
    mapped_user_id: Optional[int] = None


class HAIdentityItem(BaseModel):
    """A seen HA identity for the admin mapping list."""
    ha_user_id: str
    username: Optional[str] = None
    display_name: Optional[str] = None
    first_seen: datetime
    last_seen: datetime
    mapped_user: Optional[dict] = None  # {id, username, full_name} | None


class HALinkRequest(BaseModel):
    """Link an HA identity to an app user."""
    user_id: int


class HADirectoryUserItem(BaseModel):
    """One HA user in the merged directory view."""
    ha_user_id: str
    name: Optional[str] = None       # HA display name (directory wins over seen)
    username: Optional[str] = None
    status: str                      # "linked" | "seen" | "never_opened"
    in_directory: bool               # False = seen/mapped row no longer in HA (or fallback mode)
    ha_is_owner: bool = False
    ha_is_admin: bool = False
    ha_is_active: bool = True
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    mapped_user: Optional[dict] = None  # {id, username, full_name} | None


class HADirectoryResponse(BaseModel):
    """GET /api/auth/ha/directory. available=False → seen-only fallback data."""
    available: bool
    users: list[HADirectoryUserItem] = []


class HAImportRequest(BaseModel):
    """Create a passwordless app user pre-linked to an HA identity."""
    ha_user_id: str
    username: str
    full_name: str
    role_ids: list[int] = []
