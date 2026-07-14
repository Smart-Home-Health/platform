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
Environment connector abstraction.

A connector adapts one external data source (weather API, MQTT topics, Home
Assistant entities, a webhook...) into normalized ``EnvObservation`` records.
Connectors are home-scoped: their config lives in the account-level settings
table (see ``environment.service``), not on a patient.

Two operating modes:

- **Poll-mode** (``poll_capable = True``, the default): the background poller
  calls ``poll()`` on the configured interval and persists the result.
  Example: Open-Meteo.
- **Push-mode** (``poll_capable = False``): readings arrive via an external
  transport (MQTT message, webhook POST). The transport handler calls
  ``service.emit_observations`` directly; ``poll()`` is never invoked.
  Planned for the room-level connectors (GH #48).
"""
from abc import ABC
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional


@dataclass
class EnvObservation:
    """One normalized reading, pre-persistence.

    ``unit`` must already be the metric's canonical unit — connectors convert
    on ingest; ``service.emit_observations`` rejects anything else.
    """
    timestamp: datetime
    metric: str
    value: float
    unit: str
    scope: str = "outdoor"
    location: str = ""            # "" = whole-scope reading
    source_id: Optional[str] = None
    quality: str = "measured"


class EnvironmentConnector(ABC):
    """
    Base class for environmental data connectors.

    Subclasses set the class metadata, implement ``poll()`` (poll-mode) and
    optionally ``backfill()``, and register themselves with
    ``environment.registry.register``. Instances are constructed with the
    connector's config dict (from the settings table) per operation — they
    hold no long-lived state.
    """

    slug: str = ""
    name: str = ""
    description: str = ""
    # Catalog metric names this connector can emit (informational, for the UI).
    metrics_provided: List[str] = []
    # False for push-mode connectors; the poller skips them (see module docstring).
    poll_capable: bool = True

    def __init__(self, config: Dict):
        self.config = config or {}

    @classmethod
    def get_config_schema(cls) -> Dict:
        """JSON Schema for the connector's config, for the settings UI."""
        return {"type": "object", "properties": {}}

    @classmethod
    def is_configured(cls, config: Dict) -> bool:
        """Whether the config dict has everything needed to operate."""
        return True

    async def poll(self) -> List[EnvObservation]:
        """Fetch recent readings. Poll-mode connectors must override."""
        return []

    async def backfill(self, days: int) -> List[EnvObservation]:
        """Fetch historical readings. Optional; override where supported."""
        raise NotImplementedError(f"{self.slug} does not support backfill")

    async def test_connection(self) -> bool:
        """Cheap reachability check for the settings UI."""
        try:
            await self.poll()
            return True
        except Exception:
            return False
