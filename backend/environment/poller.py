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
Background polling for poll-mode environment connectors, plus the on-demand
backfill runner.

The loop wakes every ``TICK_SECONDS`` but a connector is only polled when its
own ``poll_interval_minutes`` has elapsed since ``last_poll_at`` (persisted
state) — so polls resume promptly after a restart or a config save without
resetting the cadence, and a short tick doesn't mean short polling intervals.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Set

from db import get_db
from environment import service
from environment.registry import registry

logger = logging.getLogger("environment")

TICK_SECONDS = 300          # loop wake-up; NOT the poll interval
DEFAULT_POLL_MINUTES = 60
ERROR_RETRY_SECONDS = 60

# Slugs with a backfill currently running (in-process guard; single worker).
_backfills_running: Set[str] = set()


def _due(state: dict, interval_minutes: int, now: datetime) -> bool:
    last = state.get("last_poll_at")
    if not last:
        return True
    try:
        last_dt = datetime.fromisoformat(last)
    except (ValueError, TypeError):
        return True
    return (now - last_dt).total_seconds() >= interval_minutes * 60


async def poll_once(db) -> int:
    """
    One pass over the registered connectors; returns rows inserted. Split out
    from the loop for testability. Per-connector failures are recorded in the
    connector's state and never propagate — one broken source must not starve
    the others.
    """
    now = datetime.now(timezone.utc)
    total_inserted = 0

    for connector_cls in registry.all():
        slug = connector_cls.slug
        try:
            if not connector_cls.poll_capable:
                continue
            config = service.get_connector_config(db, slug)
            if not config.get("enabled") or not connector_cls.is_configured(config):
                continue
            interval = int(config.get("poll_interval_minutes") or DEFAULT_POLL_MINUTES)
            state = service.get_connector_state(db, slug)
            if not _due(state, interval, now):
                continue

            observations = await connector_cls(config).poll()
            inserted = service.emit_observations(db, slug, observations)
            db.commit()

            deltas = service.compute_pressure_deltas(db, slug)
            inserted += service.emit_observations(db, slug, deltas)
            db.commit()

            service.save_connector_state(
                db, slug,
                last_poll_at=now.isoformat(),
                last_status="success",
                last_error=None,
                last_insert_count=inserted,
            )
            total_inserted += inserted
            logger.info(f"[environment] {slug}: poll ok, {inserted} new rows")
        except Exception as e:
            logger.error(f"[environment] {slug}: poll failed: {e}")
            db.rollback()
            try:
                service.save_connector_state(
                    db, slug,
                    last_poll_at=now.isoformat(),
                    last_status="error",
                    last_error=str(e)[:500],
                )
            except Exception:
                logger.exception(f"[environment] {slug}: failed to record error state")

    return total_inserted


async def environment_poll_loop():
    """Startup task (see main.py): poll configured connectors forever."""
    logger.info("[environment] Poll loop started")
    while True:
        try:
            await asyncio.sleep(TICK_SECONDS)
            db = next(get_db())
            try:
                await poll_once(db)
            finally:
                db.close()
        except Exception as e:
            logger.error(f"[environment] Poll loop error: {e}")
            await asyncio.sleep(ERROR_RETRY_SECONDS)


def backfill_running(slug: str) -> bool:
    return slug in _backfills_running


async def run_backfill(slug: str, days: int) -> None:
    """
    Fetch and persist historical observations for one connector. Launched via
    asyncio.create_task from the route; progress is visible through the
    connector's persisted state. Bus events are suppressed (historical data).
    """
    _backfills_running.add(slug)
    db = next(get_db())
    try:
        connector_cls = registry.get(slug)
        config = service.get_connector_config(db, slug)
        service.save_connector_state(db, slug, backfill={"status": "running"})

        observations = await connector_cls(config).backfill(days)
        inserted = service.emit_observations(db, slug, observations,
                                             publish_events=False)
        db.commit()

        deltas = service.compute_pressure_deltas(db, slug)
        inserted += service.emit_observations(db, slug, deltas,
                                              publish_events=False)
        db.commit()

        service.save_connector_state(db, slug, backfill={
            "status": "done",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "inserted": inserted,
        })
        logger.info(f"[environment] {slug}: backfill done, {inserted} new rows")
    except Exception as e:
        logger.error(f"[environment] {slug}: backfill failed: {e}")
        db.rollback()
        try:
            service.save_connector_state(db, slug, backfill={
                "status": "error", "error": str(e)[:500],
            })
        except Exception:
            logger.exception(f"[environment] {slug}: failed to record backfill error")
    finally:
        _backfills_running.discard(slug)
        db.close()
