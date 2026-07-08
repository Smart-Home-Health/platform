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
"""Shared client-IP extraction (X-Forwarded-For aware) used by auth routes and
the rate-limit middleware so both key on the same address."""
import os


def _behind_proxy() -> bool:
    return (os.environ.get("SHH_BEHIND_PROXY", "") or "").strip().lower() in (
        "1", "true", "yes", "on",
    )


def get_client_ip(request) -> str:
    """Best-effort client IP. Honors X-Forwarded-For (first hop) only when the
    deployment declares a trusted reverse proxy via SHH_BEHIND_PROXY — without
    a proxy in front, the header is client-controlled and would let any caller
    spoof its rate-limit/lockout identity. Falls back to the socket peer."""
    if _behind_proxy():
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
