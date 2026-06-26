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
"""Wave 5 — FHIR terminology helpers (LOINC / UCUM mapping). Pure functions,
no DB. Covers the source-aware SpO2 split and the bidirectional roundtrip."""

import pytest

from integrations.base import VitalType, VitalUnit
import terminology as t


def test_loinc_for_known_type():
    assert t.loinc_for(VitalType.HEART_RATE) == "8867-4"


def test_loinc_for_accepts_string_value():
    assert t.loinc_for(VitalType.HEART_RATE.value) == "8867-4"


def test_loinc_for_unknown_string_is_none():
    assert t.loinc_for("not_a_vital") is None


@pytest.mark.parametrize("vt", [
    VitalType.HEART_RATE, VitalType.TEMPERATURE, VitalType.WEIGHT,
    VitalType.RESPIRATORY_RATE, VitalType.BLOOD_GLUCOSE,
])
def test_loinc_roundtrip(vt):
    """A mapped type -> code -> type returns the original VitalType."""
    code = t.loinc_for(vt)
    assert code is not None
    assert t.vital_type_for_loinc(code) == vt


def test_spo2_source_aware_codes():
    # Manual entry uses the generic arterial-O2 code; device/pulse-ox the other.
    assert t.loinc_for(VitalType.SPO2, source="manual") == t.SPO2_LOINC_GENERIC
    assert t.loinc_for(VitalType.SPO2, source="pulse_ox") == t.SPO2_LOINC_PULSE_OX
    assert t.loinc_for(VitalType.SPO2) == t.SPO2_LOINC_PULSE_OX  # default


def test_both_spo2_codes_map_back_to_spo2():
    assert t.vital_type_for_loinc(t.SPO2_LOINC_GENERIC) == VitalType.SPO2
    assert t.vital_type_for_loinc(t.SPO2_LOINC_PULSE_OX) == VitalType.SPO2


def test_vital_type_for_unknown_loinc_is_none():
    assert t.vital_type_for_loinc("0000-0") is None


def test_ucum_for_known_unit():
    assert t.ucum_for(VitalUnit.MMHG) == "mm[Hg]"
    assert t.ucum_for(VitalUnit.PERCENT) == "%"


def test_ucum_for_unknown_unit_is_none():
    assert t.ucum_for("furlongs") is None
