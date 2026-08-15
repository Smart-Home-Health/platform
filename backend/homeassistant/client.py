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
Home Assistant REST/WebSocket API client.

Two connection modes, auto-detected in ``from_config``:

- **Supervisor proxy** (running as the HA add-on): the Supervisor injects
  SUPERVISOR_TOKEN and proxies an admin-privileged Core API at
  http://supervisor/core/api + ws://supervisor/core/websocket
  (``homeassistant_api: true`` in addon/config.yaml). Zero user config.
- **External**: any reachable HA instance via its base URL and a
  user-created long-lived access token.

The WS auth handshake follows the same shape as ``utils/ha_core.py``
(auth_required -> auth -> auth_ok). Registry lookups (entity/device/area)
require an admin token; on a non-admin token they fail and we degrade to
``get_states``-only metadata rather than erroring the whole listing.
"""
import asyncio
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set

import httpx

logger = logging.getLogger("homeassistant")

SUPERVISOR_WS_URL = "ws://supervisor/core/websocket"
SUPERVISOR_REST_URL = "http://supervisor/core/api"

# SHH's own MQTT discovery publishes devices with this manufacturer and
# identifiers prefixed shh_ (see mqtt/discovery.py) — those entities must
# never be ingested back in, or SHH would re-record its own output.
SHH_MANUFACTURER = "Smart Home Health"
SHH_IDENTIFIER_PREFIX = "shh_"


class HAClientError(Exception):
    """HA unreachable, timed out, or replied unexpectedly."""


class HAAuthError(HAClientError):
    """Token rejected by HA."""


@dataclass
class HAEntity:
    """One HA entity, as shown in the mapping picker."""
    entity_id: str
    state: Optional[str]
    friendly_name: Optional[str]
    device_class: Optional[str]
    unit_of_measurement: Optional[str]
    domain: str
    area: Optional[str] = None
    is_shh: bool = False
    last_updated: Optional[str] = None


def supervisor_available() -> bool:
    """True when running as the HA add-on (Supervisor injected its token)."""
    return bool(os.environ.get("SUPERVISOR_TOKEN"))


def _entity_from_state(state_obj: Dict[str, Any]) -> HAEntity:
    attrs = state_obj.get("attributes") or {}
    entity_id = state_obj.get("entity_id", "")
    return HAEntity(
        entity_id=entity_id,
        state=state_obj.get("state"),
        friendly_name=attrs.get("friendly_name"),
        device_class=attrs.get("device_class"),
        unit_of_measurement=attrs.get("unit_of_measurement"),
        domain=entity_id.split(".", 1)[0] if "." in entity_id else "",
        last_updated=state_obj.get("last_updated"),
    )


class HAClient:
    def __init__(self, ws_url: str, rest_url: str, token: str):
        self.ws_url = ws_url
        self.rest_url = rest_url.rstrip("/")
        self.token = token

    @classmethod
    def from_config(cls, config: Dict[str, Any]) -> "HAClient":
        """
        Build a client from the saved integration config, preferring the
        Supervisor proxy when available unless config forces external mode.
        Raises HAClientError when neither path is usable.
        """
        config = config or {}
        mode = config.get("mode") or "auto"
        supervisor_token = os.environ.get("SUPERVISOR_TOKEN")
        if mode != "external" and supervisor_token:
            return cls(SUPERVISOR_WS_URL, SUPERVISOR_REST_URL, supervisor_token)

        base_url = (config.get("base_url") or "").strip().rstrip("/")
        token = (config.get("token") or "").strip()
        if not base_url or not token:
            raise HAClientError(
                "Home Assistant is not configured: set a base URL and "
                "long-lived access token (or run as the HA add-on)"
            )
        if base_url.startswith("https://"):
            ws_url = "wss://" + base_url[len("https://"):] + "/api/websocket"
        elif base_url.startswith("http://"):
            ws_url = "ws://" + base_url[len("http://"):] + "/api/websocket"
        else:
            raise HAClientError(f"Base URL must start with http:// or https:// (got {base_url!r})")
        return cls(ws_url, base_url + "/api", token)

    # ------------------------------------------------------------------
    # REST
    # ------------------------------------------------------------------

    async def _rest_get(self, path: str, timeout: float = 10.0) -> Any:
        headers = {"Authorization": f"Bearer {self.token}"}
        try:
            async with httpx.AsyncClient(timeout=timeout) as http:
                resp = await http.get(f"{self.rest_url}{path}", headers=headers)
        except httpx.HTTPError as e:
            raise HAClientError(f"Home Assistant unreachable: {e}") from e
        if resp.status_code == 401:
            raise HAAuthError("Home Assistant rejected the access token")
        if resp.status_code >= 400:
            raise HAClientError(f"GET {path} failed: HTTP {resp.status_code}")
        try:
            return resp.json()
        except ValueError as e:
            raise HAClientError(f"GET {path} returned invalid JSON") from e

    async def test_connection(self) -> Dict[str, Any]:
        """Cheap reachability + auth check. Returns HA version/location."""
        config = await self._rest_get("/config")
        return {
            "version": config.get("version"),
            "location_name": config.get("location_name"),
        }

    async def get_states(self) -> List[Dict[str, Any]]:
        """All current entity states (REST /api/states). Used for seeding."""
        states = await self._rest_get("/states", timeout=20.0)
        if not isinstance(states, list):
            raise HAClientError("/states returned an unexpected payload")
        return states

    # ------------------------------------------------------------------
    # WebSocket
    # ------------------------------------------------------------------

    async def _ws_connect(self, timeout: float = 10.0):
        from websockets.asyncio.client import connect
        try:
            ws = await connect(self.ws_url, open_timeout=timeout, max_size=16 * 1024 * 1024)
        except Exception as e:
            raise HAClientError(f"WebSocket connect failed: {e}") from e
        try:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
            if msg.get("type") != "auth_required":
                raise HAClientError(f"Unexpected WS greeting: {msg.get('type')}")
            await ws.send(json.dumps({"type": "auth", "access_token": self.token}))
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
            if msg.get("type") != "auth_ok":
                raise HAAuthError(f"WS auth failed: {msg.get('type')}")
        except HAClientError:
            await ws.close()
            raise
        except Exception as e:
            await ws.close()
            raise HAClientError(f"WS handshake failed: {e}") from e
        return ws

    @staticmethod
    async def _ws_command(ws, msg_id: int, command: Dict[str, Any],
                          timeout: float = 10.0) -> Any:
        """Send one command and wait for its result frame."""
        await ws.send(json.dumps({"id": msg_id, **command}))
        while True:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
            if msg.get("id") == msg_id and msg.get("type") == "result":
                if not msg.get("success"):
                    error = (msg.get("error") or {}).get("message", "unknown error")
                    raise HAClientError(f"{command.get('type')} failed: {error}")
                return msg.get("result")

    async def list_entities(self) -> List[HAEntity]:
        """
        All HA entities with picker metadata. Area names and robust SHH-device
        detection come from the registry endpoints, which need an admin token —
        when they fail we log and fall back to state-only metadata.
        """
        ws = await self._ws_connect()
        try:
            states = await self._ws_command(ws, 1, {"type": "get_states"}, timeout=20.0)
            entities = [_entity_from_state(s) for s in states or []]

            try:
                entity_reg = await self._ws_command(ws, 2, {"type": "config/entity_registry/list"})
                device_reg = await self._ws_command(ws, 3, {"type": "config/device_registry/list"})
                area_reg = await self._ws_command(ws, 4, {"type": "config/area_registry/list"})
            except (HAClientError, asyncio.TimeoutError) as e:
                logger.info(f"HA registry enrichment unavailable (non-admin token?): {e}")
                return entities

            areas = {a.get("area_id"): a.get("name") for a in area_reg or []}
            devices: Dict[str, Dict[str, Any]] = {d.get("id"): d for d in device_reg or []}
            by_entity: Dict[str, Dict[str, Any]] = {
                e.get("entity_id"): e for e in entity_reg or []
            }
            for entity in entities:
                reg = by_entity.get(entity.entity_id)
                if not reg:
                    continue
                device = devices.get(reg.get("device_id")) or {}
                area_id = reg.get("area_id") or device.get("area_id")
                entity.area = areas.get(area_id)
                entity.is_shh = _is_shh_device(device)
            return entities
        finally:
            await ws.close()

    async def list_areas(self) -> List[str]:
        """
        HA area (room) names, for reusing the user's HA rooms as SHH
        locations. Registry access needs an admin token — raises HAClientError
        when unavailable so callers can degrade to free-text locations.
        """
        ws = await self._ws_connect()
        try:
            area_reg = await self._ws_command(ws, 1, {"type": "config/area_registry/list"})
            names = [a.get("name") for a in area_reg or [] if a.get("name")]
            return sorted(names, key=str.lower)
        finally:
            await ws.close()

    async def listen(
        self,
        entity_ids: Set[str],
        on_state: Callable[[Dict[str, Any]], Awaitable[None]],
        stop: asyncio.Event,
    ) -> None:
        """
        Subscribe to state_changed events and invoke ``on_state(new_state)``
        for entities in ``entity_ids``. Returns when ``stop`` is set; raises
        HAClientError when the connection drops (caller reconnects).
        """
        ws = await self._ws_connect()
        try:
            await self._ws_command(ws, 1, {
                "type": "subscribe_events", "event_type": "state_changed",
            })
            logger.info(f"[homeassistant] Subscribed to state_changed ({len(entity_ids)} mapped entities)")
            while not stop.is_set():
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=30.0)
                except asyncio.TimeoutError:
                    continue  # idle tick; loop re-checks the stop event
                except Exception as e:
                    raise HAClientError(f"WebSocket receive failed: {e}") from e
                try:
                    msg = json.loads(raw)
                except ValueError:
                    continue
                if msg.get("type") != "event":
                    continue
                data = (msg.get("event") or {}).get("data") or {}
                new_state = data.get("new_state")
                if not new_state or data.get("entity_id") not in entity_ids:
                    continue
                try:
                    await on_state(new_state)
                except Exception:
                    logger.exception(f"Error handling state for {data.get('entity_id')}")
        finally:
            await ws.close()


def _is_shh_device(device: Dict[str, Any]) -> bool:
    """Whether a device-registry entry is SHH's own MQTT discovery device."""
    if not device:
        return False
    if device.get("manufacturer") == SHH_MANUFACTURER:
        return True
    for identifier in device.get("identifiers") or []:
        # identifiers is a list of [domain, id] pairs
        for part in identifier if isinstance(identifier, (list, tuple)) else [identifier]:
            if isinstance(part, str) and part.startswith(SHH_IDENTIFIER_PREFIX):
                return True
    return False


def parse_ha_timestamp(value: Optional[str]) -> Optional[datetime]:
    """Parse an HA ISO timestamp (e.g. last_updated), tolerating a Z suffix."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
