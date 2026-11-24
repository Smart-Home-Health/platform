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
from datetime import datetime, timedelta, timezone

import pytest

from analysis.pulse_ox_patterns import detect_pulse_ox_patterns

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def at(seconds):
    return START + timedelta(seconds=seconds)


def reading(second, spo2=98, bpm=75, motion=None):
    return (at(second), spo2, bpm, motion)


BASELINE = [reading(i) for i in range(0, 60, 2)]


@pytest.mark.parametrize('dip_first', [True, False])
def test_small_changes_in_either_order_with_observed_extrema(dip_first):
    dip = [(96, 75), (95, 73)]
    rise = [(98, 85), (98, 89)]
    early, late = (dip, rise) if dip_first else (rise, dip)
    rows = [reading(60, *early[0]), reading(62, *early[1]), reading(64), reading(66),
            reading(68, *late[0]), reading(70, *late[1])]
    [pattern] = detect_pulse_ox_patterns(BASELINE + rows, at(60), at(100))
    assert (pattern.start_time, pattern.end_time) == (at(60), at(70))
    assert (pattern.min_spo2, pattern.min_bpm, pattern.max_bpm) == (95, 73, 89)
    assert detect_pulse_ox_patterns(BASELINE + rows, at(60), at(70)) == []  # still live
    assert detect_pulse_ox_patterns(BASELINE + rows, at(64), at(100)) == []
    assert detect_pulse_ox_patterns(BASELINE + rows, at(60), at(100), spo2_drop=4) == []


@pytest.mark.parametrize('samples', [
    [reading(60, 95, 89), reading(60, 95, 89)],  # retransmission
    [reading(60, 95), reading(62, 95)],  # oxygen only
    [reading(60, 98, 89), reading(62, 98, 89)],  # pulse only
    [reading(60, 95), reading(62, 95)] + [reading(i) for i in range(64, 86, 2)]
    + [reading(86, 98, 89), reading(88, 98, 89)],  # separated by more than 20s
    [reading(60, 95), reading(62, 95), reading(76, 98, 89), reading(78, 98, 89)],  # gap
    [reading(60, 95), reading(62, 95), reading(64, -1, -1), reading(66, 98, 89), reading(68, 98, 89)],
    [reading(60, 105, 89), reading(62, 94, 92)],  # impossible SpO2
])
def test_unconfirmed_or_discontinuous_changes(samples):
    assert detect_pulse_ox_patterns(BASELINE + samples, START, at(200)) == []


def test_sustained_pattern_and_separate_recurrence():
    sustained = [reading(i, 95, 89) for i in range(60, 212, 2)] + [reading(212, 93, 98)]
    recovered = [reading(i) for i in range(214, 400, 2)]
    next_event = [reading(400, 96, 87), reading(402, 96, 87)]
    first, second = detect_pulse_ox_patterns(BASELINE + sustained + recovered + next_event, START, at(430))
    assert (first.start_time, first.end_time, first.min_spo2, first.max_bpm) == (at(60), at(212), 93, 98)
    assert second.start_time == at(400)
    assert first.id != second.id
    assert detect_pulse_ox_patterns(BASELINE + sustained + recovered, START, at(398)) == [first]


def test_oximeter_motion_flag_is_carried_with_the_reviewed_readings():
    rows = BASELINE + [reading(60, 95, 89, 'ON'), reading(62, 94, 92, 'OFF')]
    assert detect_pulse_ox_patterns(rows, START, at(59)) == []
    [pattern] = detect_pulse_ox_patterns(rows, START, at(80))
    assert pattern.motion_detected
