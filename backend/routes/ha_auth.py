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
Home Assistant ingress identity routes.

POST /api/auth/ha/login is the ONLY place an HA identity is exchanged for a
session: a mapped identity gets a full session as its linked app user (HA
already authenticated the human — this counts as a full-password login, so no
daily re-prompt), an unmapped one gets an account-level session and the normal
user picker. Both require the request to arrive from the trusted ingress peer
(utils/ha_ingress.py); the LAN port always fails that check, which is what
keeps shared-device iframes on the picker flow.

The admin endpoints manage the identity → user mapping from the identities
seen on ingress traffic — no Supervisor API access required.
"""
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from crud.users import create_audit_log
from db import get_db
from dependencies import require_system_admin
from models.ha_identity import HASeenIdentity
from models.users import Account, User
from routes.auth import (
    SESSION_TIMEOUT_MINUTES,
    _cookie_secure,
    _set_account_cookie,
    create_access_token,
)
from schemas.ha_auth import (
    HAIdentityInfo,
    HAIdentityItem,
    HALinkRequest,
    HALoginResponse,
    HAStatusResponse,
)
from utils.client_ip import get_client_ip
from utils.ha_ingress import ingress_identity, is_valid_ha_user_id, trusted_ingress_peer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth/ha", tags=["HA Identity"])


def _default_account(db: Session) -> Account:
    account = db.query(Account).filter(Account.is_default == True, Account.is_active == True).first()  # noqa: E712
    if not account:
        account = db.query(Account).filter(Account.is_active == True).first()  # noqa: E712
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account available")
    return account


def _set_session_cookie(request: Request, response: Response, token: str) -> None:
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        max_age=SESSION_TIMEOUT_MINUTES * 60,
        samesite="lax",
        secure=_cookie_secure(request),
    )


def _upsert_seen_identity(db: Session, identity) -> None:
    """Record/refresh the identity for the admin mapping list."""
    row = db.query(HASeenIdentity).filter(HASeenIdentity.ha_user_id == identity.ha_user_id).first()
    now = datetime.utcnow()
    if row:
        row.username = identity.username
        row.display_name = identity.display_name
        row.last_seen = now
    else:
        db.add(HASeenIdentity(
            ha_user_id=identity.ha_user_id,
            username=identity.username,
            display_name=identity.display_name,
            first_seen=now,
            last_seen=now,
        ))
    db.commit()


@router.post("/login", response_model=HALoginResponse)
def ha_login(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Sign in from the HA identity on a trusted ingress request (public route;
    the peer check is the gate). 403 for everything that didn't come through
    ingress — the frontend treats that as "use the normal flow"."""
    if not trusted_ingress_peer(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a trusted ingress request",
        )

    account = _default_account(db)
    identity = ingress_identity(request)
    identity_info = HAIdentityInfo(**identity.__dict__) if identity else None

    user = None
    if identity:
        _upsert_seen_identity(db, identity)
        user = db.query(User).filter(
            User.ha_user_id == identity.ha_user_id,
            User.is_active == True,  # noqa: E712
        ).first()

    if user:
        # HA authenticated the human with their HA credentials; treat it as a
        # full-password login so nothing re-prompts for 24h (needs_full_password).
        now = datetime.utcnow()
        user.last_login = now
        user.last_activity = now
        user.last_full_password_login = now
        token = create_access_token(
            user=user, account=account, is_full_password=True,
            auth_level="full", read_restricted=False,
        )
        _set_session_cookie(request, response, token)
        _set_account_cookie(request, response, account, read_restricted=False)
        create_audit_log(
            db,
            user_id=user.id,
            action="ha.auto_login.success",
            details=json.dumps({"ha_user_id": identity.ha_user_id}),
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
        logger.info(f"HA auto-login: {user.username} via HA identity")
        return HALoginResponse(
            access_token=token,
            auth_level="full",
            mapped=True,
            identity=identity_info,
            account={"id": account.id, "name": account.name, "slug": account.slug},
            user={
                "id": user.id,
                "username": user.username,
                "full_name": user.full_name,
                "is_system_admin": user.is_superuser,
                "has_pin": bool(user.pin_hash),
                "roles": [{"id": r.id, "name": r.name, "display_name": r.display_name} for r in user.roles],
                "permissions": [p.name for r in user.roles for p in r.permissions],
            },
            read_restricted=False,
        )

    # Unmapped identity (or Core too old to send headers, or the linked user is
    # inactive): the HA login replaces the account password, so grant an
    # unrestricted account-level session and let the user picker take it from
    # there.
    token = create_access_token(account=account, auth_level="account", read_restricted=False)
    _set_session_cookie(request, response, token)
    _set_account_cookie(request, response, account, read_restricted=False)
    create_audit_log(
        db,
        user_id=None,
        action="ha.account_access",
        details=json.dumps({"ha_user_id": identity.ha_user_id if identity else None}),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    return HALoginResponse(
        access_token=token,
        auth_level="account",
        mapped=False,
        identity=identity_info,
        account={"id": account.id, "name": account.name, "slug": account.slug},
        user=None,
        read_restricted=False,
    )


@router.get("/status", response_model=HAStatusResponse)
def ha_status(request: Request, db: Session = Depends(get_db)):
    """This request's ingress identity + mapping (authenticated route — the
    middleware gates it). Powers the picker banner and link-current-identity."""
    identity = ingress_identity(request)
    mapped_user_id = None
    if identity:
        mapped = db.query(User.id).filter(User.ha_user_id == identity.ha_user_id).first()
        mapped_user_id = mapped[0] if mapped else None
    return HAStatusResponse(
        ingress_trusted=trusted_ingress_peer(request),
        identity=HAIdentityInfo(**identity.__dict__) if identity else None,
        mapped_user_id=mapped_user_id,
    )


@router.get("/identities", response_model=list[HAIdentityItem])
def list_identities(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_system_admin),
):
    """All HA identities seen on ingress, newest activity first, with mapping."""
    rows = db.query(HASeenIdentity).order_by(HASeenIdentity.last_seen.desc()).all()
    users_by_ha_id = {
        u.ha_user_id: u
        for u in db.query(User).filter(User.ha_user_id.isnot(None)).all()
    }
    return [
        HAIdentityItem(
            ha_user_id=row.ha_user_id,
            username=row.username,
            display_name=row.display_name,
            first_seen=row.first_seen,
            last_seen=row.last_seen,
            mapped_user=(
                {"id": u.id, "username": u.username, "full_name": u.full_name}
                if (u := users_by_ha_id.get(row.ha_user_id)) else None
            ),
        )
        for row in rows
    ]


@router.put("/identities/{ha_user_id}/link")
def link_identity(
    ha_user_id: str,
    body: HALinkRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_system_admin),
):
    """Link an HA identity to an app user. 409 if the identity is already
    linked to a different user (unlink first — no silent identity moves)."""
    if not is_valid_ha_user_id(ha_user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid HA user id")

    target = db.query(User).filter(User.id == body.user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = db.query(User).filter(User.ha_user_id == ha_user_id).first()
    if existing and existing.id != target.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This Home Assistant user is already linked to {existing.full_name}. Unlink it first.",
        )

    target.ha_user_id = ha_user_id
    # Linking an identity never seen on ingress is allowed (e.g. pre-staging);
    # give it a seen row so the admin list shows it.
    if not db.query(HASeenIdentity).filter(HASeenIdentity.ha_user_id == ha_user_id).first():
        now = datetime.utcnow()
        db.add(HASeenIdentity(ha_user_id=ha_user_id, first_seen=now, last_seen=now))
    create_audit_log(
        db,
        user_id=admin.id,
        action="ha.identity.link",
        details=json.dumps({"ha_user_id": ha_user_id, "linked_user_id": target.id}),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.commit()
    return {"success": True, "ha_user_id": ha_user_id, "user_id": target.id}


@router.delete("/identities/{ha_user_id}/link")
def unlink_identity(
    ha_user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_system_admin),
):
    """Remove the mapping; the identity stays in the seen list."""
    user = db.query(User).filter(User.ha_user_id == ha_user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identity is not linked")
    user.ha_user_id = None
    create_audit_log(
        db,
        user_id=admin.id,
        action="ha.identity.unlink",
        details=json.dumps({"ha_user_id": ha_user_id, "unlinked_user_id": user.id}),
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.commit()
    return {"success": True}


@router.delete("/identities/{ha_user_id}")
def forget_identity(
    ha_user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_system_admin),
):
    """Drop a stale identity from the seen list. Refused while mapped."""
    if db.query(User).filter(User.ha_user_id == ha_user_id).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Identity is linked to a user — unlink it first.",
        )
    row = db.query(HASeenIdentity).filter(HASeenIdentity.ha_user_id == ha_user_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identity not found")
    db.delete(row)
    db.commit()
    return {"success": True}
