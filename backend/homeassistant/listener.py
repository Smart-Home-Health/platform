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
Background loop subscribing to Home Assistant state changes for the mapped
entities (see main.py startup, same pattern as environment_poll_loop).

Config or mapping changes call ``request_reload()`` and the loop reconnects
with fresh settings; connection loss reconnects with exponential backoff.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

from db import get_db
from homeassistant import service
from homeassistant.client import HAClient, HAClientError

logger = logging.getLogger("homeassistant")

IDLE_RECHECK_SECONDS = 60
BACKOFF_INITIAL_SECONDS = 1
BACKOFF_MAX_SECONDS = 60

_reload_event: Optional[asyncio.Event] = None
_runtime: Dict[str, Any] = {
    "connected": False,
    "connected_since": None,
    "last_event_at": None,
    "entity_count": 0,
    "last_error": None,
}


def _get_reload_event() -> asyncio.Event:
    global _reload_event
    if _reload_event is None:
        _reload_event = asyncio.Event()
    return _reload_event


def request_reload() -> None:
    """Ask the listener to reconnect with fresh config/mappings."""
    try:
        _get_reload_event().set()
    except RuntimeError:
        pass  # no event loop yet (startup ordering); the loop reads fresh config anyway


def runtime_status() -> Dict[str, Any]:
    return dict(_runtime)


async def _wait_or_reload(seconds: float) -> None:
    """Sleep, but wake early when a reload is requested."""
    try:
        await asyncio.wait_for(_get_reload_event().wait(), timeout=seconds)
    except asyncio.TimeoutError:
        pass


def _load_enabled_entity_ids() -> Set[str]:
    from schemas.ha_entity_mapping import HAEntityMapping
    db = next(get_db())
    try:
        rows = db.query(HAEntityMapping.entity_id).filter(
            HAEntityMapping.enabled == True  # noqa: E712
        ).all()
        return {r.entity_id for r in rows}
    finally:
        db.close()


async def _handle_state(new_state: Dict[str, Any]) -> None:
    """Route one state_changed payload through its mapping (fresh session so
    mapping edits apply immediately)."""
    from schemas.ha_entity_mapping import HAEntityMapping

    entity_id = new_state.get("entity_id")
    if not entity_id:
        return

    def _process():
        db = next(get_db())
        try:
            mapping = db.query(HAEntityMapping).filter(
                HAEntityMapping.entity_id == entity_id,
                HAEntityMapping.enabled == True,  # noqa: E712
            ).first()
            if mapping is None:
                return False
            recorded = service.handle_state_event(db, mapping, new_state)
            db.commit()
            return recorded
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    recorded = await asyncio.to_thread(_process)
    if recorded:
        _runtime["last_event_at"] = datetime.now(timezone.utc).isoformat()


async def _seed_current_states(client: HAClient, entity_ids: Set[str]) -> None:
    """Record each mapped entity's current state once at connect time, so a
    rarely-changing sensor (weight, BP) shows up without waiting for its next
    change. handle_state_event's timestamp check makes reconnects no-ops."""
    try:
        states = await client.get_states()
    except HAClientError as e:
        logger.warning(f"[homeassistant] Seeding skipped, get_states failed: {e}")
        return
    for state_obj in states:
        if state_obj.get("entity_id") in entity_ids:
            await _handle_state(state_obj)


async def _shh_entity_ids(client: HAClient) -> Set[str]:
    """Entity ids belonging to SHH's own MQTT discovery device (never ingest)."""
    try:
        return {e.entity_id for e in await client.list_entities() if e.is_shh}
    except HAClientError as e:
        logger.info(f"[homeassistant] SHH-entity lookup unavailable: {e}")
        return set()


def _set_connected(connected: bool, error: Optional[str] = None,
                   entity_count: int = 0) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    _runtime["connected"] = connected
    _runtime["connected_since"] = now_iso if connected else None
    _runtime["entity_count"] = entity_count
    _runtime["last_error"] = error
    # Persist for the admin UI across restarts; best-effort.
    try:
        db = next(get_db())
        try:
            service.save_state(db, connected=connected, last_error=error,
                               **({"last_connect_at": now_iso} if connected else {}))
        finally:
            db.close()
    except Exception:
        logger.exception("[homeassistant] Failed to persist connection state")


async def ha_listener_loop():
    """Startup task (see main.py): keep a WS subscription to HA while the
    integration is enabled and has mappings."""
    logger.info("[homeassistant] Listener loop started")
    service.set_main_loop(asyncio.get_running_loop())
    backoff = BACKOFF_INITIAL_SECONDS
    while True:
        try:
            _get_reload_event().clear()

            db = next(get_db())
            try:
                config = service.get_config(db)
            finally:
                db.close()

            if not (config.get("enabled") and service.connection_available(config)):
                if _runtime["connected"]:
                    _set_connected(False)
                await _wait_or_reload(IDLE_RECHECK_SECONDS)
                continue

            entity_ids = _load_enabled_entity_ids()
            if not entity_ids:
                if _runtime["connected"]:
                    _set_connected(False)
                await _wait_or_reload(IDLE_RECHECK_SECONDS)
                continue

            client = HAClient.from_config(config)
            active_ids = entity_ids - await _shh_entity_ids(client)
            await _seed_current_states(client, active_ids)

            _set_connected(True, entity_count=len(active_ids))
            backoff = BACKOFF_INITIAL_SECONDS
            logger.info(f"[homeassistant] Connected; listening on {len(active_ids)} entities")

            stop = asyncio.Event()

            async def _stop_on_reload():
                await _get_reload_event().wait()
                stop.set()

            reload_task = asyncio.create_task(_stop_on_reload())
            try:
                await client.listen(active_ids, _handle_state, stop)
            finally:
                reload_task.cancel()
            # listen() returned cleanly -> reload requested; reconnect at once.
            _set_connected(False)
        except HAClientError as e:
            logger.warning(f"[homeassistant] Connection lost: {e} (retry in {backoff}s)")
            _set_connected(False, error=str(e)[:500])
            await _wait_or_reload(backoff)
            backoff = min(backoff * 2, BACKOFF_MAX_SECONDS)
        except Exception as e:
            logger.exception(f"[homeassistant] Listener loop error: {e}")
            _set_connected(False, error=str(e)[:500])
            await _wait_or_reload(BACKOFF_MAX_SECONDS)
