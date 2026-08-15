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
Home Assistant room-sensor connector (GH #48) — push-mode registry entry.

Readings arrive through the WS listener in backend/homeassistant/, which
calls service.emit_observations directly with source_type "home_assistant";
this class only makes the source visible to the environment framework
(/api/environment/connectors and the Environment admin page). Configuration
lives at /api/integrations/home_assistant, not in connector config.
"""
from typing import Dict

from environment.base import EnvironmentConnector
from environment.registry import register


@register
class HomeAssistantEnvConnector(EnvironmentConnector):
    slug = "home_assistant"
    name = "Home Assistant"
    description = ("Room and indoor sensors ingested live from mapped Home "
                   "Assistant entities (configure under Integrations > Home Assistant)")
    metrics_provided = [
        "temperature", "relative_humidity", "co2", "pm25", "voc",
        "noise_level", "barometric_pressure", "aqi",
    ]
    poll_capable = False

    @classmethod
    def is_configured(cls, config: Dict) -> bool:
        from homeassistant.service import connection_available, get_config
        from state_manager import get_db_session
        try:
            with get_db_session() as db:
                return connection_available(get_config(db))
        except Exception:
            return False
