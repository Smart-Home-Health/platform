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
"""
Smart Device Integrations Package

This package provides a plugin-style system for integrating external health devices
and services (Withings, iHealth, etc.) following a standardized interface.

Each integration must:
1. Inherit from BaseIntegration
2. Implement all abstract methods
3. Output VitalReading objects that get normalized into the vitals table
"""

from .base import BaseIntegration, VitalReading, DeviceInfo, SyncResult, IntegrationError, AuthenticationError, SyncError
from .registry import IntegrationRegistry, get_integration, registry

__all__ = [
    'BaseIntegration',
    'VitalReading',
    'DeviceInfo',
    'SyncResult',
    'IntegrationError',
    'AuthenticationError',
    'SyncError',
    'IntegrationRegistry',
    'get_integration',
    'registry',
]

# Auto-register integrations by importing them
from . import manual
from . import withings
from . import epic
from . import mqtt
from . import ventilator
from . import frigate
