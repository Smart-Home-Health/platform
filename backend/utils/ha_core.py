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
Home Assistant Core API access from inside the add-on.

The Supervisor proxies an admin-privileged Core WebSocket at
ws://supervisor/core/websocket for add-ons with ``homeassistant_api: true``,
authenticated with the SUPERVISOR_TOKEN it injects into the container env.
We use it for exactly one thing: ``config/auth/list``, the HA user directory,
so admins can link/import household members before they ever open the panel.

Outside the add-on (Compose/unified image) there is no token — every call
raises HACoreError and callers degrade to the "seen on ingress" fallback.
"""
import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

_SUPERVISOR_WS_URL = "ws://supervisor/core/websocket"


class HACoreError(Exception):
    """Core WS unavailable, auth failed, timed out, or replied unexpectedly."""


@dataclass(frozen=True)
class HADirectoryUser:
    """One Home Assistant user from config/auth/list."""
    ha_user_id: str
    name: Optional[str]
    username: Optional[str]
    is_owner: bool
    is_active: bool
    local_only: bool
    is_admin: bool


def ha_core_available() -> bool:
    """True when running as the HA add-on (Supervisor injected its token)."""
    return bool(os.environ.get("SUPERVISOR_TOKEN"))


def _users_from_result(result) -> list[HADirectoryUser]:
    """Parse the config/auth/list result, skipping HA-internal system users."""
    users = []
    for entry in result or []:
        if not isinstance(entry, dict) or entry.get("system_generated"):
            continue
        ha_user_id = entry.get("id")
        if not ha_user_id:
            continue
        group_ids = entry.get("group_ids") or []
        users.append(HADirectoryUser(
            ha_user_id=ha_user_id,
            name=entry.get("name"),
            username=entry.get("username"),
            is_owner=bool(entry.get("is_owner")),
            is_active=bool(entry.get("is_active", True)),
            local_only=bool(entry.get("local_only")),
            is_admin=entry.get("is_owner") or "system-admin" in group_ids,
        ))
    return users


async def list_ha_users(timeout: float = 5.0) -> list[HADirectoryUser]:
    """The full HA user directory, or HACoreError on any failure."""
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        raise HACoreError("Supervisor API not available (not running as the HA add-on)")

    # websockets>=13 client API; the pin in requirements.txt is 15.x.
    from websockets.asyncio.client import connect

    try:
        async with asyncio.timeout(timeout):
            async with connect(_SUPERVISOR_WS_URL, open_timeout=timeout) as ws:
                msg = json.loads(await ws.recv())
                if msg.get("type") != "auth_required":
                    raise HACoreError(f"Unexpected greeting: {msg.get('type')}")
                await ws.send(json.dumps({"type": "auth", "access_token": token}))
                msg = json.loads(await ws.recv())
                if msg.get("type") != "auth_ok":
                    raise HACoreError(f"Core WS auth failed: {msg.get('type')}")

                await ws.send(json.dumps({"id": 1, "type": "config/auth/list"}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get("id") == 1 and msg.get("type") == "result":
                        break
                if not msg.get("success"):
                    raise HACoreError(f"config/auth/list failed: {msg.get('error')}")
                return _users_from_result(msg.get("result"))
    except HACoreError:
        raise
    except Exception as e:  # timeout, DNS, connection refused, bad JSON, ...
        logger.debug(f"HA core directory fetch failed: {e}")
        raise HACoreError(str(e)) from e
