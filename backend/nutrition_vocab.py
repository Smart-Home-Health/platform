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
"""Single owner of the nutrition vocabularies and the mappings between them.

Before this module the same translations were re-derived independently in
several places (``inferLocation`` in JS vs ``_output_label`` in Python, the
schedule-type-to-item-type assignment in ``routes/schedule.py``, ...), which is
how they drifted apart. Everything that needs to convert between these
vocabularies imports from here so there is exactly one definition.
"""
from typing import Optional


# =====================
# BRISTOL STOOL SCALE
# =====================

# The legacy free-text `consistency` vocabulary predates the Bristol scale.
# Both columns stay populated: `consistency` is projected straight into the
# monitoring timeline (routes/monitoring.py) and rendered by NutritionOverview,
# while `bristol_scale` is what the rebuilt sheet actually collects.
BRISTOL_MIN = 1
BRISTOL_MAX = 7

BRISTOL_TO_CONSISTENCY = {
    1: 'pellets',       # separate hard lumps
    2: 'constipated',   # lumpy, sausage-shaped
    3: 'solid',         # sausage with cracks
    4: 'solid',         # smooth / soft sausage
    5: 'soft',          # soft blobs, clear edges
    6: 'loose',         # mushy, ragged edges
    7: 'watery',        # entirely liquid
}

# Reverse map. Not simply an inversion: 3 and 4 both mean 'solid', and the
# legacy vocabulary carries 'diarrhea' which has no distinct Bristol number.
CONSISTENCY_TO_BRISTOL = {
    'pellets': 1,
    'constipated': 2,
    'solid': 4,
    'soft': 5,
    'loose': 6,
    'watery': 7,
    'diarrhea': 7,
}

# Descriptor shown beside the 1-7 picker ("TYPE 4 - SMOOTH / SOFT").
BRISTOL_LABELS = {
    1: 'Separate hard lumps',
    2: 'Lumpy / sausage',
    3: 'Cracked sausage',
    4: 'Smooth / soft',
    5: 'Soft blobs',
    6: 'Mushy / ragged',
    7: 'Watery',
}


def consistency_for_bristol(bristol: Optional[int]) -> Optional[str]:
    """Legacy `consistency` value for a Bristol number, or None."""
    if bristol is None:
        return None
    return BRISTOL_TO_CONSISTENCY.get(int(bristol))


def bristol_for_consistency(consistency: Optional[str]) -> Optional[int]:
    """Bristol number for a legacy `consistency` value, or None."""
    if not consistency:
        return None
    return CONSISTENCY_TO_BRISTOL.get(str(consistency).strip().lower())


# =====================
# OUTPUT LOCATION
# =====================

# `location` is a real column now. The three booleans stay in sync with it for
# back-compat: crud/scheduling.py, the monitoring timeline and external MQTT
# consumers still read them.
LOCATION_RESTROOM = 'restroom'
LOCATION_DIAPER = 'diaper'
LOCATION_CATHETER = 'catheter'
LOCATION_ACCIDENT = 'accident'

LOCATION_TYPES = [
    LOCATION_RESTROOM,
    LOCATION_DIAPER,
    LOCATION_CATHETER,
    LOCATION_ACCIDENT,
]

LOCATION_LABELS = {
    LOCATION_RESTROOM: 'Restroom',
    LOCATION_DIAPER: 'Diaper',
    LOCATION_CATHETER: 'Catheter',
    LOCATION_ACCIDENT: 'Accident',
}


def location_from_flags(is_diaper=False, is_catheter=False, is_accident=False) -> str:
    """Derive `location` from the legacy booleans.

    Checked in the same priority order the frontend's `inferLocation` used, so
    a row with more than one flag set resolves the way it always has.
    """
    if is_catheter:
        return LOCATION_CATHETER
    if is_diaper:
        return LOCATION_DIAPER
    if is_accident:
        return LOCATION_ACCIDENT
    return LOCATION_RESTROOM


def flags_for_location(location: Optional[str]) -> dict:
    """The legacy booleans for a `location`. Restroom is all-false."""
    loc = (location or LOCATION_RESTROOM).strip().lower()
    return {
        'is_diaper': loc == LOCATION_DIAPER,
        'is_catheter': loc == LOCATION_CATHETER,
        'is_accident': loc == LOCATION_ACCIDENT,
    }


# =====================
# INTAKE TYPE
# =====================

ITEM_TYPE_FOOD = 'food'
ITEM_TYPE_LIQUID = 'liquid'
ITEM_TYPE_SUPPLEMENT = 'supplement'
ITEM_TYPE_TUBE_FEED = 'tube_feed'

ITEM_TYPES = [
    ITEM_TYPE_FOOD,
    ITEM_TYPE_LIQUID,
    ITEM_TYPE_SUPPLEMENT,
    ITEM_TYPE_TUBE_FEED,
]

# Intake types that count toward fluid totals. `hydration` is a legacy value
# that predates the normalization below and may still exist in old rows.
FLUID_ITEM_TYPES = {ITEM_TYPE_LIQUID, ITEM_TYPE_TUBE_FEED, 'hydration'}

# Tube-feed delivery route.
FEED_ROUTE_BOLUS = 'bolus'
FEED_ROUTE_PUMP = 'pump'
FEED_ROUTE_GRAVITY = 'gravity'

FEED_ROUTES = [FEED_ROUTE_BOLUS, FEED_ROUTE_PUMP, FEED_ROUTE_GRAVITY]

# Optional meal context. `supplement` deliberately absent: it is an intake
# *type*, and listing it in both places was the ambiguity the rebuild removes.
# Reads still accept it for rows written before that change.
MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'other']
LEGACY_MEAL_TYPES = MEAL_TYPES + ['supplement']

# `routes/schedule.py` used to assign `schedule_type` straight into
# `item_type`, so the column accumulated schedule vocabulary. These three are
# the real intake-producing schedule types.
SCHEDULE_TYPE_TO_ITEM_TYPE = {
    'meal': ITEM_TYPE_FOOD,
    'snack': ITEM_TYPE_FOOD,
    'hydration': ITEM_TYPE_LIQUID,
    'supplement': ITEM_TYPE_SUPPLEMENT,
    'tube_feed': ITEM_TYPE_TUBE_FEED,
}

# ...and these are care activities that must never create an intake row.
NON_INTAKE_SCHEDULE_TYPES = {'diaper_check', 'bathroom_assist', 'catheter_care'}

# The meal context implied by a schedule type, where there is one.
SCHEDULE_TYPE_TO_MEAL_TYPE = {
    'snack': 'snack',
}


def item_type_for_schedule_type(schedule_type: Optional[str]) -> Optional[str]:
    """Normalized `item_type` for a nutrition schedule.

    Returns None when the schedule describes a care activity rather than an
    intake (a diaper check produces no food or fluid), so callers can skip
    creating a row instead of writing a bogus `item_type`.
    """
    key = (schedule_type or '').strip().lower()
    if not key:
        return ITEM_TYPE_FOOD
    if key in NON_INTAKE_SCHEDULE_TYPES:
        return None
    if key in SCHEDULE_TYPE_TO_ITEM_TYPE:
        return SCHEDULE_TYPE_TO_ITEM_TYPE[key]
    if key in ITEM_TYPES:
        return key
    return ITEM_TYPE_FOOD


def normalize_item_type(item_type: Optional[str]) -> str:
    """Coerce any historical `item_type` value onto the supported set."""
    key = (item_type or '').strip().lower()
    if key in ITEM_TYPES:
        return key
    return item_type_for_schedule_type(key) or ITEM_TYPE_FOOD


# =====================
# VOLUME CONVERSION
# =====================

# Millilitres per unit. The same factors were previously inlined at half a
# dozen call sites across routes/nutrition.py and crud/nutrition.py.
_ML_PER_UNIT = {
    'ml': 1.0,
    'milliliter': 1.0,
    'milliliters': 1.0,
    'cc': 1.0,
    'oz': 29.5735,
    'ounce': 29.5735,
    'ounces': 29.5735,
    'cup': 236.588,
    'cups': 236.588,
    'l': 1000.0,
    'liter': 1000.0,
    'liters': 1000.0,
}

# Qualitative stool sizes -- deliberately NOT convertible to a volume. A diaper
# is described by wetness, not by an invented millilitre figure.
QUALITATIVE_AMOUNT_UNITS = {'smear', 'small', 'medium', 'large'}


def to_ml(amount, amount_unit) -> Optional[float]:
    """Volume in millilitres, or None when the unit is not a real volume.

    Returns None for the qualitative sizes rather than guessing a number, so
    callers can tell "no measurement" apart from "measured zero".
    """
    if amount is None:
        return None
    unit = (amount_unit or 'ml').strip().lower()
    factor = _ML_PER_UNIT.get(unit)
    if factor is None:
        return None
    try:
        return float(amount) * factor
    except (TypeError, ValueError):
        return None
