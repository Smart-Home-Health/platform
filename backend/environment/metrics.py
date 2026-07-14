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
Controlled vocabulary for environmental observations.

Code-level catalog (same approach as ``terminology.py``): importable without a
DB session by connectors, validators, and tests. If user-defined metrics are
ever needed (e.g. custom room sensors), this can graduate to a seeded lookup
table like ``vent_parameter_dictionary`` without changing callers of
``validate_observation``.

Units are canonical per metric. Connectors must convert to the canonical unit
on ingest; ``validate_observation`` rejects non-canonical units rather than
converting, so a connector emitting the wrong unit fails loudly instead of
storing silently wrong values.
"""
from typing import Dict

# Observation scopes:
#   outdoor - outside the home (weather, outdoor AQ)
#   indoor  - whole-home ambient (values essentially uniform through the house)
#   room    - per-location values that genuinely vary (temp, RH, CO2, PM2.5)
SCOPES = ("outdoor", "indoor", "room")

# measured  - physical sensor reading
# estimated - API/model/forecast-derived, or computed (e.g. pressure deltas)
QUALITIES = ("measured", "estimated")

# Windows (hours) for materialized pressure-change metrics.
PRESSURE_DELTA_WINDOWS = (1, 3, 6, 12, 24)

METRICS: Dict[str, Dict] = {
    "barometric_pressure":     {"unit": "hPa",       "label": "Barometric pressure (surface)"},
    "barometric_pressure_msl": {"unit": "hPa",       "label": "Barometric pressure (sea level)"},
    "temperature":             {"unit": "°C",        "label": "Temperature"},
    "relative_humidity":       {"unit": "%",         "label": "Relative humidity"},
    "precipitation":           {"unit": "mm",        "label": "Precipitation"},
    "aqi":                     {"unit": "AQI",       "label": "Air quality index (US)"},
    "pm25":                    {"unit": "µg/m³",     "label": "PM2.5"},
    "ozone":                   {"unit": "µg/m³",     "label": "Ozone"},
    "pollen":                  {"unit": "grains/m³", "label": "Pollen"},
    "co2":                     {"unit": "ppm",       "label": "CO2"},
    "voc":                     {"unit": "ppb",       "label": "VOC"},
    "noise_level":             {"unit": "dB",        "label": "Noise level"},
}
METRICS.update({
    f"pressure_delta_{w}h": {
        "unit": "hPa",
        "label": f"Pressure change over {w}h",
        "derived": True,
    }
    for w in PRESSURE_DELTA_WINDOWS
})


def canonical_unit(metric: str) -> str:
    """Return the canonical unit for a metric; raises ValueError if unknown."""
    try:
        return METRICS[metric]["unit"]
    except KeyError:
        raise ValueError(f"Unknown environmental metric: {metric!r}")


def is_derived(metric: str) -> bool:
    return bool(METRICS.get(metric, {}).get("derived"))


def validate_observation(metric: str, unit: str, scope: str, quality: str) -> None:
    """
    Validate an observation's vocabulary fields, raising ValueError with a
    specific message on the first problem found.
    """
    if metric not in METRICS:
        raise ValueError(f"Unknown environmental metric: {metric!r}")
    expected_unit = METRICS[metric]["unit"]
    if unit != expected_unit:
        raise ValueError(
            f"Non-canonical unit {unit!r} for metric {metric!r} "
            f"(expected {expected_unit!r}); convert on ingest"
        )
    if scope not in SCOPES:
        raise ValueError(f"Invalid scope {scope!r} (expected one of {SCOPES})")
    if quality not in QUALITIES:
        raise ValueError(f"Invalid quality {quality!r} (expected one of {QUALITIES})")
    if is_derived(metric) and quality != "estimated":
        raise ValueError(f"Derived metric {metric!r} must have quality='estimated'")
