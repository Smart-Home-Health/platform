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
Home Assistant inbound integration (registry entry).

Like the MQTT integration this is config-only: the actual work is push-based
(the WS listener in backend/homeassistant/), so sync_data is a no-op. Being
registered gives it an integrations-table row (used as the `source` label on
ingested vitals) and a card in the integrations UI. Connection config and
entity mappings live under /api/integrations/home_assistant (home-level, not
per-patient).
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from .base import BaseIntegration, DeviceInfo, SyncResult, VitalType
from .registry import register


@register
class HomeAssistantIntegration(BaseIntegration):
    slug = "home_assistant"
    name = "Home Assistant"
    description = "Ingest selected Home Assistant entities as patient vitals or environmental observations"
    auth_type = "none"
    supported_vitals = [
        VitalType.SPO2.value,
        VitalType.HEART_RATE.value,
        VitalType.BLOOD_PRESSURE_SYSTOLIC.value,
        VitalType.BLOOD_PRESSURE_DIASTOLIC.value,
        VitalType.BLOOD_PRESSURE_MAP.value,
        VitalType.TEMPERATURE.value,
        VitalType.RESPIRATORY_RATE.value,
        VitalType.BLOOD_GLUCOSE.value,
        VitalType.WEIGHT.value,
    ]

    @classmethod
    def get_config_schema(cls) -> Dict[str, Any]:
        # Home-level config; managed by /api/integrations/home_assistant, not
        # the per-patient integration settings editor.
        return {"type": "object", "properties": {}}

    async def authenticate(self, auth_data: Dict[str, Any]) -> Dict[str, Any]:
        return {"authenticated": True, "type": "home_assistant"}

    async def refresh_credentials(self) -> Dict[str, Any]:
        return {"authenticated": True, "type": "home_assistant"}

    async def fetch_devices(self) -> List[DeviceInfo]:
        return []

    async def sync_data(
        self,
        since: Optional[datetime] = None,
        device_ids: Optional[List[str]] = None,
    ) -> SyncResult:
        return SyncResult(
            success=True,
            readings_count=0,
            readings=[],
            error_message="Home Assistant ingestion is push-based (live WebSocket), no sync needed.",
            sync_timestamp=datetime.utcnow(),
        )

    async def test_connection(self) -> bool:
        from homeassistant.client import HAClient, HAClientError
        from homeassistant.service import get_config
        from state_manager import get_db_session
        try:
            with get_db_session() as db:
                config = get_config(db)
            await HAClient.from_config(config).test_connection()
            return True
        except (HAClientError, Exception):
            return False
