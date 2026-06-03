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
Standard healthcare terminology mappings (the "FHIR at the edges" backbone).

Maps the app's internal ``VitalType`` / ``VitalUnit`` enums to standard codes:
- LOINC for observation/measurement identity (FHIR ``Observation.code``)
- UCUM for units (FHIR ``Quantity.code``)

Reused by the (deferred) Epic FHIR ingest connector and any future read-only
``/fhir/*`` export façade. Dependency-free.

Coverage note: only the vitals with a well-established LOINC code are seeded here.
Composite/derived types (sleep stages, some body-composition metrics) are left out
deliberately and can be filled in incrementally — callers must handle ``None``.
"""
from typing import Dict, Optional

from integrations.base import VitalType, VitalUnit

LOINC_SYSTEM = "http://loinc.org"
UCUM_SYSTEM = "http://unitsofmeasure.org"

# VitalType -> LOINC code. Omitted types have no agreed single LOINC code yet.
VITAL_TYPE_TO_LOINC: Dict[VitalType, str] = {
    VitalType.HEART_RATE: "8867-4",
    VitalType.SPO2: "59408-5",  # default: SpO2 by pulse oximetry; see SPO2_LOINC_* for source-aware choice
    VitalType.BLOOD_PRESSURE_SYSTOLIC: "8480-6",
    VitalType.BLOOD_PRESSURE_DIASTOLIC: "8462-4",
    VitalType.BLOOD_PRESSURE_MAP: "8478-0",
    VitalType.TEMPERATURE: "8310-5",
    VitalType.WEIGHT: "29463-7",
    VitalType.BMI: "39156-5",
    VitalType.BLOOD_GLUCOSE: "2339-0",
    VitalType.RESPIRATORY_RATE: "9279-1",
    VitalType.STEPS: "55423-8",
    VitalType.BODY_FAT: "41982-0",
    VitalType.PERFUSION_INDEX: "61006-3",
}

# SpO2 has two valid LOINC codes depending on how it was measured:
SPO2_LOINC_PULSE_OX = "59408-5"  # Oxygen saturation in Arterial blood by Pulse oximetry (device readings)
SPO2_LOINC_GENERIC = "2708-6"    # Oxygen saturation in Arterial blood (manual/unspecified method)

# Reverse lookup: LOINC code -> VitalType. Both SpO2 codes resolve back to SPO2.
LOINC_TO_VITAL_TYPE: Dict[str, VitalType] = {
    code: vt for vt, code in VITAL_TYPE_TO_LOINC.items()
}
LOINC_TO_VITAL_TYPE[SPO2_LOINC_GENERIC] = VitalType.SPO2

# VitalUnit -> UCUM unit code. The enum value is the human-friendly label; this is
# the standards-compliant UCUM code that belongs in FHIR ``Quantity.code``.
VITAL_UNIT_TO_UCUM: Dict[VitalUnit, str] = {
    VitalUnit.BPM: "/min",
    VitalUnit.PERCENT: "%",
    VitalUnit.MMHG: "mm[Hg]",
    VitalUnit.FAHRENHEIT: "[degF]",
    VitalUnit.CELSIUS: "Cel",
    VitalUnit.KG: "kg",
    VitalUnit.LBS: "[lb_av]",
    VitalUnit.MG_DL: "mg/dL",
    VitalUnit.MMOL_L: "mmol/L",
    VitalUnit.STEPS: "{steps}",
    VitalUnit.MINUTES: "min",
    VitalUnit.HOURS: "h",
    VitalUnit.BREATHS_PER_MIN: "/min",
}


def loinc_for(vital_type, source: Optional[str] = None) -> Optional[str]:
    """Return the LOINC code for a VitalType (or its string value), or None.

    ``source`` is the ``Vital.source`` value. It only affects SpO2: manual entry
    maps to the generic arterial O2 saturation code (2708-6), while any other
    source (pulse-ox / device reading) maps to the pulse-oximetry code (59408-5).
    """
    try:
        vital_type = VitalType(vital_type)
    except ValueError:
        return None
    if vital_type == VitalType.SPO2:
        return SPO2_LOINC_GENERIC if (source or '').lower() == 'manual' else SPO2_LOINC_PULSE_OX
    return VITAL_TYPE_TO_LOINC.get(vital_type)


def vital_type_for_loinc(code: str) -> Optional[VitalType]:
    """Return the VitalType for a LOINC code, or None if unmapped."""
    return LOINC_TO_VITAL_TYPE.get(code)


def ucum_for(unit) -> Optional[str]:
    """Return the UCUM code for a VitalUnit (or its string value), or None."""
    try:
        unit = VitalUnit(unit)
    except ValueError:
        return None
    return VITAL_UNIT_TO_UCUM.get(unit)
