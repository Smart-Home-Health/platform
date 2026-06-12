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
"""Ventilator log parsers.

Each parser is registered by model slug (the value stored in
PatientIntegration.settings["model"]). The ventilator integration's
import_file() dispatches to the right parser based on that slug.
"""
from typing import Dict, Type

from .base import VentilatorParser
from .vocsn import VocsnParser


PARSERS: Dict[str, Type[VentilatorParser]] = {
    VocsnParser.model_slug: VocsnParser,
}


def get_parser(model_slug: str) -> Type[VentilatorParser]:
    """Look up a parser class by model slug. Raises KeyError when unknown."""
    return PARSERS[model_slug]


SUPPORTED_MODELS = [
    {"value": slug, "label": cls.model_label}
    for slug, cls in PARSERS.items()
]
