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
In-process per-IP rate limiting for the sensitive auth endpoints.

A sliding-window counter (in-memory deque per key) — correct because the app
runs a single uvicorn process; no Redis needed. Mirrors the AuthenticationMiddleware
allowlist style and runs *outside* it so public login routes are throttled before
auth. Non-/api/auth/ paths pass straight through (this guards auth only).
"""
import time
import logging
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from fastapi import status

from utils.client_ip import get_client_ip
from security_config import (
    RATE_LIMIT_ENABLED,
    AUTH_RATE_LIMITS,
    AUTH_PREFIX,
    AUTH_PREFIX_LIMIT,
    RATE_LIMIT_EXEMPT_PREFIXES,
)

logger = logging.getLogger(__name__)

# key -> deque[float timestamps]. Key = f"{ip}|{bucket}". Pruned on access.
_hits: dict[str, deque] = defaultdict(deque)


def _over_limit(key: str, max_requests: int, window: float, now: float) -> bool:
    """Record a hit for `key`; return True if it now exceeds max within window."""
    dq = _hits[key]
    cutoff = now - window
    while dq and dq[0] <= cutoff:
        dq.popleft()
    dq.append(now)
    if not dq:
        # nothing left (shouldn't happen) — drop empty bucket
        _hits.pop(key, None)
    return len(dq) > max_requests


def _retry_after(key: str, window: float, now: float) -> int:
    """Seconds until the oldest hit in the window ages out (>=1)."""
    dq = _hits.get(key)
    if not dq:
        return 1
    return max(1, int(window - (now - dq[0])) + 1)


def _audit_block(ip: str, path: str):
    """Best-effort audit log of a rate-limit block (never let it break the response)."""
    try:
        import json
        from db import SessionLocal
        from crud.users import create_audit_log
        db = SessionLocal()
        try:
            create_audit_log(
                db,
                user_id=None,
                action="auth.rate_limited",
                details=json.dumps({"path": path}),
                ip_address=ip,
            )
        finally:
            db.close()
    except Exception as e:  # pragma: no cover - audit must never break the request
        logger.error(f"rate-limit audit log failed: {e}")


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not RATE_LIMIT_ENABLED or request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if any(path.startswith(p) for p in RATE_LIMIT_EXEMPT_PREFIXES):
            return await call_next(request)

        # Only guard the auth surface in this pass.
        specific = AUTH_RATE_LIMITS.get(path)
        is_auth_prefix = path.startswith(AUTH_PREFIX)
        if specific is None and not is_auth_prefix:
            return await call_next(request)

        ip = get_client_ip(request)
        now = time.monotonic()

        # Check the coarse per-IP auth-prefix cap and the specific endpoint cap.
        # Evaluate both so each records a hit; block if either is exceeded.
        blocked = False
        window_for_retry = AUTH_PREFIX_LIMIT[1]
        retry_key = f"{ip}|auth-prefix"

        if is_auth_prefix:
            pmax, pwin = AUTH_PREFIX_LIMIT
            if _over_limit(f"{ip}|auth-prefix", pmax, pwin, now):
                blocked = True
        if specific is not None:
            smax, swin = specific
            if _over_limit(f"{ip}|{path}", smax, swin, now):
                blocked = True
                window_for_retry = swin
                retry_key = f"{ip}|{path}"

        if blocked:
            retry = _retry_after(retry_key, window_for_retry, now)
            logger.warning(f"Rate limit exceeded: ip={ip} path={path} retry_after={retry}s")
            _audit_block(ip, path)
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": "Too many requests. Please slow down and try again shortly.",
                    "requires_auth": False,
                    "retry_after": retry,
                },
                headers={"Retry-After": str(retry)},
            )

        return await call_next(request)
