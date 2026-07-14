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
Registry for environment connectors (mirror of ``integrations.registry``).

Connectors self-register at import time via the ``@register`` decorator;
``environment/connectors/__init__.py`` imports each connector module to
trigger registration.
"""
from typing import Dict, List, Optional, Type

from .base import EnvironmentConnector


class EnvironmentRegistry:
    def __init__(self):
        self._connectors: Dict[str, Type[EnvironmentConnector]] = {}

    def register(self, connector_class: Type[EnvironmentConnector]) -> Type[EnvironmentConnector]:
        slug = connector_class.slug
        if not slug:
            raise ValueError(f"{connector_class.__name__} has no slug")
        existing = self._connectors.get(slug)
        # Allow re-registration of the same class (uvicorn --reload); reject
        # a different class claiming an existing slug.
        if existing is not None and existing.__name__ != connector_class.__name__:
            raise ValueError(f"Environment connector slug already registered: {slug}")
        self._connectors[slug] = connector_class
        return connector_class

    def get(self, slug: str) -> Optional[Type[EnvironmentConnector]]:
        return self._connectors.get(slug)

    def all(self) -> List[Type[EnvironmentConnector]]:
        return list(self._connectors.values())


registry = EnvironmentRegistry()


def register(connector_class: Type[EnvironmentConnector]) -> Type[EnvironmentConnector]:
    """Class decorator: ``@register`` above an ``EnvironmentConnector``."""
    return registry.register(connector_class)
