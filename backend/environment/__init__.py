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
Environmental data platform: normalized observations + connector abstraction.

Home-level (not patient-level) environmental readings — weather, indoor air
quality — stored as normalized rows in the ``environmental_observations``
hypertable. Connectors (Open-Meteo, and later MQTT/Home Assistant/webhook
sources) adapt external data into ``EnvObservation`` records and persist them
through ``service.emit_observations``.

Mirrors the ``integrations`` package pattern (registry + import-time
self-registration) but is deliberately separate: integrations are bound to a
per-patient ``PatientIntegration`` row and persist vitals, while environment
connectors are home-scoped and persist observations.
"""

# Imported for the registration side-effect (each connector module applies
# @register at import time). Must stay at the bottom to avoid circular imports.
from environment import connectors  # noqa: E402,F401
