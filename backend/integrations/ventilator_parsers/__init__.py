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
