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
Home Assistant ingress identity.

The HA Supervisor forwards the logged-in HA user on every ingress request as
``X-Remote-User-Id`` / ``X-Remote-User-Name`` / ``X-Remote-User-Display-Name``
(Supervisor >= 2023.08.2 with Core >= 2023.9; older Cores send no headers at
all). Supervisor strips any client-supplied copies before injecting its own,
so the headers are trustworthy **only** for requests that genuinely came
through ingress. The add-on also publishes a plain LAN port for shared-device
iframes, where a direct client could type the headers itself — so identity is
released only when the TCP peer is the Supervisor's ingress proxy.

These headers are read nowhere else in the app: the auth middleware never
looks at them, and only the ``/api/auth/ha/*`` routes call into this module,
so a forged header on any other route is inert.
"""
import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# HA Core user ids are uuid4().hex — exactly 32 lowercase hex chars.
_HA_USER_ID_RE = re.compile(r"\A[0-9a-f]{32}\Z")

# The Supervisor's ingress proxy address on the internal hassio network.
DEFAULT_TRUSTED_PEERS = "172.30.32.2"


@dataclass
class HAIdentity:
    """The HA user attached to an ingress request."""
    ha_user_id: str
    username: Optional[str] = None       # absent for non-homeassistant auth providers
    display_name: Optional[str] = None


def _env_truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def ha_identity_login_enabled() -> bool:
    """Add-on option kill switch; defaults on when unset (the feature is still
    gated behind SHH_INGRESS + the peer check). Read at request time so tests
    and the add-on can toggle it without a reimport."""
    return os.getenv("SHH_HA_IDENTITY_LOGIN", "1").strip().lower() not in ("0", "false", "no", "off")


def trusted_ingress_peer(request) -> bool:
    """True only when this request can be trusted to carry Supervisor-injected
    ingress headers: we are running as the HA add-on (SHH_INGRESS), identity
    login isn't disabled, and the TCP peer is the ingress proxy.

    ``request.client.host`` is the real socket peer: uvicorn runs without
    --proxy-headers here, and X-Forwarded-For is only ever honored under
    SHH_BEHIND_PROXY, which the add-on must never set.
    """
    if not _env_truthy("SHH_INGRESS"):
        return False
    if not ha_identity_login_enabled():
        return False
    peers = os.getenv("SHH_INGRESS_TRUSTED_PEERS", DEFAULT_TRUSTED_PEERS)
    allowed = {p.strip() for p in peers.split(",") if p.strip()}
    client = request.client
    return bool(client and client.host in allowed)


def ingress_identity(request) -> Optional[HAIdentity]:
    """The HA identity on a trusted ingress request, or None.

    None when the peer isn't trusted, the id header is missing (Core < 2023.9),
    or the id is malformed (defense in depth — a trusted peer should never send
    a malformed id).
    """
    if not trusted_ingress_peer(request):
        return None
    ha_user_id = (request.headers.get("X-Remote-User-Id") or "").strip()
    if not _HA_USER_ID_RE.match(ha_user_id):
        if ha_user_id:
            logger.warning("Ignoring malformed X-Remote-User-Id from trusted peer")
        return None
    username = (request.headers.get("X-Remote-User-Name") or "").strip() or None
    display_name = (request.headers.get("X-Remote-User-Display-Name") or "").strip() or None
    return HAIdentity(ha_user_id=ha_user_id, username=username, display_name=display_name)
