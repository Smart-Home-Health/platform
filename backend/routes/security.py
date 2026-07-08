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
HTTPS / certificate management routes (Configuration → Security).

GET  /api/security/status    -> current mode, listener state, cert expiry
POST /api/security/byo-cert  -> upload fullchain.pem + privkey.pem
POST /api/security/proxy     -> declare a TLS-terminating reverse proxy
POST /api/security/public-port -> published HTTPS port (for the shown URL)
POST /api/security/disable   -> turn built-in HTTPS off (cert files kept)
POST /api/security/duckdns/setup -> start guided DuckDNS + Let's Encrypt job
GET  /api/security/duckdns/setup -> poll the job's step/state
POST /api/security/duckdns/renew -> force a renewal now

Restricted to system admins. Secret material lives on disk via tls_manager;
only non-secret state (mode, domain, expiry cache) is in the settings table.
"""
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import tls_acme
import tls_manager
from crud.settings import get_setting, save_setting
from db import SessionLocal, get_db
from dependencies import get_current_user
from models.users import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/security", tags=["security"])

HTTPS_MODES = ("off", "duckdns", "byo", "proxy")

# Settings keys (all non-secret; account_id NULL = instance-global)
KEY_MODE = "https_mode"
KEY_DOMAIN = "https_domain"
KEY_PUBLIC_PORT = "https_public_port"
KEY_CERT_EXPIRES = "https_cert_expires_at"
KEY_LAST_RENEWAL = "https_last_renewal_at"
KEY_LAST_RENEWAL_ERROR = "https_last_renewal_error"
KEY_SETUP_STATE = "https_setup_state"


def _require_system_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="System administrator access required")
    return current_user


def _env_truthy(name: str) -> bool:
    return (os.environ.get(name, "") or "").strip().lower() in ("1", "true", "yes", "on")


class ProxyRequest(BaseModel):
    enabled: bool


class PublicPortRequest(BaseModel):
    port: int = Field(ge=1, le=65535)


class SecurityStatus(BaseModel):
    mode: str
    ingress: bool
    behind_proxy: bool
    request_scheme: str
    https_active: bool
    https_error: Optional[str] = None
    domain: Optional[str] = None
    public_port: int
    cert_installed: bool
    cert_expires_at: Optional[str] = None
    days_until_expiry: Optional[int] = None
    last_renewal_at: Optional[str] = None
    last_renewal_error: Optional[str] = None
    setup_state: Optional[dict] = None


def read_setup_state(db: Session) -> Optional[dict]:
    raw = get_setting(db, KEY_SETUP_STATE)
    if not raw:
        return None
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return None


def write_setup_state(db: Session, state: dict) -> None:
    save_setting(
        db, KEY_SETUP_STATE, json.dumps(state), data_type="json",
        description="HTTPS setup wizard job state",
    )


def _status_payload(request: Request, db: Session) -> SecurityStatus:
    mode = get_setting(db, KEY_MODE, "off") or "off"
    expiry = tls_manager.read_cert_expiry()
    days = None
    if expiry is not None:
        days = (expiry - datetime.now(timezone.utc)).days
    try:
        public_port = int(get_setting(db, KEY_PUBLIC_PORT, 8443) or 8443)
    except (TypeError, ValueError):
        public_port = 8443
    return SecurityStatus(
        mode=mode,
        ingress=_env_truthy("SHH_INGRESS"),
        behind_proxy=_env_truthy("SHH_BEHIND_PROXY"),
        # With SHH_BEHIND_PROXY + a proxy sending X-Forwarded-Proto this reads
        # "https" — the frontend uses it to confirm header trust is working.
        request_scheme=request.url.scheme,
        https_active=bool(tls_manager.https_state["running"]),
        https_error=tls_manager.https_state["error"],
        domain=get_setting(db, KEY_DOMAIN) or None,
        public_port=public_port,
        cert_installed=tls_manager.cert_available(),
        cert_expires_at=expiry.isoformat() if expiry else None,
        days_until_expiry=days,
        last_renewal_at=get_setting(db, KEY_LAST_RENEWAL) or None,
        last_renewal_error=get_setting(db, KEY_LAST_RENEWAL_ERROR) or None,
        setup_state=read_setup_state(db),
    )


@router.get("/status", response_model=SecurityStatus)
def get_status(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    return _status_payload(request, db)


@router.post("/byo-cert", response_model=SecurityStatus)
async def upload_own_cert(
    request: Request,
    fullchain: UploadFile = File(...),
    privkey: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    """Install a user-provided certificate chain + private key and serve HTTPS."""
    cert_pem = await fullchain.read()
    key_pem = await privkey.read()
    try:
        tls_manager.write_cert_atomic(cert_pem, key_pem)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    domains = tls_manager.read_cert_domains()
    save_setting(db, KEY_MODE, "byo", description="HTTPS mode")
    if domains:
        save_setting(db, KEY_DOMAIN, domains[0], description="HTTPS domain")
    expiry = tls_manager.read_cert_expiry()
    if expiry:
        save_setting(db, KEY_CERT_EXPIRES, expiry.isoformat(),
                     description="Installed cert expiry (cache)")
    tls_manager.request_https_restart()
    logger.info("BYO certificate installed (domains=%s)", domains)
    return _status_payload(request, db)


@router.post("/proxy", response_model=SecurityStatus)
def set_proxy_mode(
    body: ProxyRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    """Declare (or undeclare) an external TLS-terminating reverse proxy.

    The app keeps serving plain HTTP; the response's behind_proxy flag tells
    the UI whether SHH_BEHIND_PROXY is actually set on the container, so it
    can warn when the proxy path was chosen but header trust isn't enabled.
    """
    save_setting(db, KEY_MODE, "proxy" if body.enabled else "off",
                 description="HTTPS mode")
    # If a built-in listener was running (mode was duckdns/byo), stop it.
    tls_manager.request_https_restart()
    return _status_payload(request, db)


@router.post("/public-port", response_model=SecurityStatus)
def set_public_port(
    body: PublicPortRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    """Published host port for HTTPS (compose APP_HTTPS_PORT), used only to
    render the canonical https:// URL — the container can't know the mapping."""
    save_setting(db, KEY_PUBLIC_PORT, str(body.port), data_type="integer",
                 description="Published HTTPS port")
    return _status_payload(request, db)


# --- DuckDNS + Let's Encrypt guided setup ------------------------------------

IN_PROGRESS_STATUSES = (
    "queued", "validating_token", "setting_dns", "waiting_dns",
    "requesting_cert", "finalizing",
)


class DuckdnsSetupRequest(BaseModel):
    subdomain: str
    token: str
    staging: bool = False


def _setup_in_progress(db: Session) -> bool:
    state = read_setup_state(db)
    return bool(state and state.get("status") in IN_PROGRESS_STATUSES)


def _run_duckdns_issuance(subdomain: str, staging: bool) -> None:
    """Background worker (threadpool): runs the full issuance, writing each
    step into the https_setup_state setting for the wizard to poll. Own DB
    session — the request's session is gone by the time this runs."""
    db = SessionLocal()

    def update(status, **extra):
        state = read_setup_state(db) or {}
        state.update({"status": status, **extra})
        write_setup_state(db, state)

    try:
        token = tls_manager.read_duckdns_token() or ""
        issuer = tls_acme.DuckDnsIssuer(subdomain, token, staging=staging)
        fullchain, privkey = issuer.issue(progress_cb=lambda step: update(step))
        tls_manager.write_cert_atomic(fullchain, privkey)

        save_setting(db, KEY_MODE, "duckdns", description="HTTPS mode")
        save_setting(db, KEY_DOMAIN, issuer.domain, description="HTTPS domain")
        expiry = tls_manager.read_cert_expiry()
        if expiry:
            save_setting(db, KEY_CERT_EXPIRES, expiry.isoformat(),
                         description="Installed cert expiry (cache)")
        save_setting(db, KEY_LAST_RENEWAL,
                     datetime.now(timezone.utc).isoformat(),
                     description="Last successful cert renewal")
        save_setting(db, KEY_LAST_RENEWAL_ERROR, "",
                     description="Last cert renewal error")
        update("issued", error=None, error_code=None)
        tls_manager.request_https_restart()
        logger.info("DuckDNS setup issued a certificate for %s", issuer.domain)
    except tls_acme.AcmeSetupError as e:
        logger.error("DuckDNS setup failed: %s", e)
        update("failed", error=str(e), error_code=e.error_code)
    except Exception as e:  # noqa: BLE001 - anything else is "internal"
        logger.exception("DuckDNS setup crashed")
        update("failed", error=str(e), error_code="internal")
    finally:
        db.close()


@router.post("/duckdns/setup", response_model=SecurityStatus)
def start_duckdns_setup(
    body: DuckdnsSetupRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    """Kick off the guided DuckDNS + Let's Encrypt issuance job."""
    if _setup_in_progress(db):
        raise HTTPException(status_code=409, detail="A certificate setup is already running")
    try:
        subdomain = tls_acme.normalize_subdomain(body.subdomain)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not body.token.strip():
        raise HTTPException(status_code=422, detail="DuckDNS token is required")

    tls_manager.write_duckdns_token(body.token)
    write_setup_state(db, {
        "status": "queued",
        "staging": body.staging,
        "domain": f"{subdomain}.duckdns.org",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "error": None,
        "error_code": None,
    })
    background_tasks.add_task(_run_duckdns_issuance, subdomain, body.staging)
    return _status_payload(request, db)


@router.get("/duckdns/setup")
def get_duckdns_setup(
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    """Poll target for the wizard's progress view."""
    return {"setup_state": read_setup_state(db)}


@router.post("/duckdns/renew", response_model=SecurityStatus)
def renew_duckdns_cert(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    """Force a renewal with the stored domain + token (manual 'Renew now')."""
    if _setup_in_progress(db):
        raise HTTPException(status_code=409, detail="A certificate setup is already running")
    if (get_setting(db, KEY_MODE, "off") or "off") != "duckdns":
        raise HTTPException(status_code=409, detail="DuckDNS mode is not active")
    domain = get_setting(db, KEY_DOMAIN) or ""
    if not domain or not tls_manager.read_duckdns_token():
        raise HTTPException(status_code=409, detail="DuckDNS domain or token missing — run setup again")
    write_setup_state(db, {
        "status": "queued",
        "staging": False,
        "domain": domain,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "error": None,
        "error_code": None,
    })
    background_tasks.add_task(_run_duckdns_issuance, domain, False)
    return _status_payload(request, db)


@router.post("/disable", response_model=SecurityStatus)
def disable_https(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    """Turn built-in HTTPS off. Certificate files are kept on disk so
    re-enabling (or switching modes) doesn't require re-issuance."""
    save_setting(db, KEY_MODE, "off", description="HTTPS mode")
    tls_manager.request_https_restart()
    return _status_payload(request, db)
