# Smart Home Health Hub
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
# event_publisher.py
"""Helpers for publishing events to the in-process EventBus from sync CRUD code.

CRUD functions run synchronously inside the async request handler's event loop,
so we schedule the (async) bus publish as a task on the running loop — mirroring
the established pattern in ``crud/nutrition.py``.
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger("event_publisher")


def get_event_bus():
    """Resolve the process-wide EventBus from the main module's registry."""
    try:
        from main import get_modules
        return get_modules().get("event_bus")
    except Exception as e:
        logger.error(f"Failed to get event bus: {e}")
        return None


def publish_event(event) -> None:
    """Publish an event to the bus from sync code, best-effort.

    Never raises — a failed publish must not break the originating write.
    """
    try:
        bus = get_event_bus()
        if not bus:
            logger.warning("Event bus not available for publishing")
            return
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(bus.publish(event))
        else:
            loop.run_until_complete(bus.publish(event))
    except Exception as e:
        logger.error(f"Failed to publish event: {e}")


def publish_due_counts_changed(category: str, patient_id: Optional[int] = None) -> None:
    """Notify dashboards that a due-count badge category should be refetched."""
    from events import DueCountsChanged
    publish_event(DueCountsChanged(ts=datetime.now(), category=category, patient_id=patient_id))
