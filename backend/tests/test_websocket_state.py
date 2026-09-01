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
"""Alarm flags on the sensor_update broadcast.

The top-level spo2/bpm in that payload are last-writer-wins across every
reader on the system. The live dashboard therefore scopes itself to
`state['patient_readings'][pid]`, which means each entry has to carry its own
alarm flags — otherwise a board showing patient A inherits patient B's alarm.
"""

from modules.websocket_module import reading_alarm_flags

LIMITS = dict(min_spo2=90, max_spo2=100, min_bpm=55, max_bpm=155)


def test_in_range_raises_nothing():
    assert reading_alarm_flags({"spo2": 97, "bpm": 84}, **LIMITS) == {
        "spo2_alarm": False, "bpm_alarm": False, "alarm": False,
    }


def test_low_spo2_and_high_bpm_each_raise():
    assert reading_alarm_flags({"spo2": 84, "bpm": 84}, **LIMITS)["spo2_alarm"] is True
    assert reading_alarm_flags({"spo2": 97, "bpm": 190}, **LIMITS)["bpm_alarm"] is True
    assert reading_alarm_flags({"spo2": 84, "bpm": 190}, **LIMITS)["alarm"] is True


def test_minus_one_is_a_disconnect_not_an_alarm():
    # The pulse ox reports its own disconnect in band as -1. That is below
    # min_spo2 numerically, so a naive comparison would alarm on every unplug.
    flags = reading_alarm_flags({"spo2": -1, "bpm": -1}, **LIMITS)
    assert flags == {"spo2_alarm": False, "bpm_alarm": False, "alarm": False}


def test_missing_and_non_numeric_values_are_safe():
    assert reading_alarm_flags({}, **LIMITS)["alarm"] is False
    assert reading_alarm_flags({"spo2": None, "bpm": None}, **LIMITS)["alarm"] is False
    assert reading_alarm_flags({"spo2": "97", "bpm": "84"}, **LIMITS)["alarm"] is False


def test_boundaries_are_inclusive():
    # Exactly at a limit is in range; one step past it is not.
    assert reading_alarm_flags({"spo2": 90, "bpm": 55}, **LIMITS)["alarm"] is False
    assert reading_alarm_flags({"spo2": 89, "bpm": 55}, **LIMITS)["spo2_alarm"] is True
    assert reading_alarm_flags({"spo2": 90, "bpm": 54}, **LIMITS)["bpm_alarm"] is True


def test_two_patients_get_independent_flags():
    """The whole point: one patient alarming must not flag the other."""
    readings = {1: {"spo2": 97, "bpm": 84}, 2: {"spo2": 80, "bpm": 84}}
    flags = {pid: reading_alarm_flags(r, **LIMITS) for pid, r in readings.items()}
    assert flags[1]["alarm"] is False
    assert flags[2]["alarm"] is True
