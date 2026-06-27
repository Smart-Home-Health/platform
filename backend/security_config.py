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
Centralized, env-tunable security policy: failed-login lockout thresholds and
auth-endpoint rate limits. Read once at import (mirrors the JWT-secret guard in
main.py). Defaults match the previously hardcoded behavior.
"""
import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


# ---- Failed-login lockout (applies to both user and account login) ----------
# Was hardcoded as 5 attempts / 15 minutes in crud/users.increment_failed_login.
LOGIN_LOCKOUT_THRESHOLD = _int("LOGIN_LOCKOUT_THRESHOLD", 5)
LOGIN_LOCKOUT_MINUTES = _int("LOGIN_LOCKOUT_MINUTES", 15)

# ---- Rate limiting ----------------------------------------------------------
# Master switch (set RATE_LIMIT_ENABLED=0 to disable, e.g. for tests/dev).
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "1") not in ("0", "false", "False", "")

# Per-IP sliding-window limits for sensitive auth endpoints: path -> (max, window_seconds).
# Tightest on the credential-checking endpoints (the PIN is low-entropy).
AUTH_RATE_LIMITS = {
    "/api/auth/account/login":       (_int("RL_ACCOUNT_LOGIN_PER_MIN", 10), 60),
    "/api/auth/account/access":      (_int("RL_ACCOUNT_ACCESS_PER_MIN", 15), 60),
    "/api/auth/account/unlock":      (_int("RL_ACCOUNT_UNLOCK_PER_MIN", 5), 60),
    "/api/auth/login":               (_int("RL_LOGIN_PER_MIN", 10), 60),
    "/api/auth/verify-pin":          (_int("RL_VERIFY_PIN_PER_MIN", 5), 60),
    "/api/auth/user/select":         (_int("RL_USER_SELECT_PER_MIN", 10), 60),
    "/api/auth/user/reset-password": (_int("RL_RESET_PASSWORD_PER_MIN", 10), 60),
    "/api/auth/first-run/setup":     (_int("RL_FIRST_RUN_PER_MIN", 5), 60),
}

# Coarse catch-all so an attacker can't rotate across auth endpoints under the
# per-endpoint caps. Applies to any /api/auth/ path (checked in addition to the
# specific limit above).
AUTH_PREFIX = "/api/auth/"
AUTH_PREFIX_LIMIT = (_int("RL_AUTH_PREFIX_PER_MIN", 40), 60)

# Never rate-limit these (CORS preflight handled separately; sensor streams).
RATE_LIMIT_EXEMPT_PREFIXES = ("/ws/", "/api/readers/ws/")
