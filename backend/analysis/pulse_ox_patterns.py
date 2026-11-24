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
"""Retrospective, relative pulse-ox patterns for review, independent of monitor alarms."""
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import NamedTuple
from uuid import UUID, uuid5

BASELINE_WINDOW = timedelta(minutes=2)
BASELINE_MINIMUM = timedelta(seconds=30)
PAIR_WINDOW = timedelta(seconds=20)
MAX_GAP = timedelta(seconds=10)
PATTERN_NAMESPACE = UUID('dc6ad3fc-8323-41fe-908c-889d359504bf')


class _Reading(NamedTuple):
    at: datetime
    spo2: int
    bpm: int
    motion: str | None


@dataclass(frozen=True)
class PulseOxPattern:
    start_time: datetime
    end_time: datetime
    min_spo2: int
    min_bpm: int
    max_bpm: int
    motion_detected: bool

    @property
    def id(self) -> str:
        # Scoped to the patient's stream. Stable across re-analysis and patient backup/restore.
        return str(uuid5(PATTERN_NAMESPACE, self.start_time.astimezone(timezone.utc).isoformat()))


def _continuous_runs(readings, as_of):
    run = []
    previous = None
    for at, spo2, bpm, motion in readings:
        if at > as_of:
            break
        if at == previous:
            continue
        previous = at
        valid = spo2 is not None and 0 < spo2 <= 100 and bpm is not None and bpm > 0
        if run and (not valid or at - run[-1].at > MAX_GAP):
            yield run, True
            run = []
        if valid:
            run.append(_Reading(at, spo2, bpm, motion))
    if run:
        yield run, False


def _summarize(run, first, last):
    interval = run[first:last + 1]
    return PulseOxPattern(start_time=run[first].at, end_time=run[last].at,
                          min_spo2=min(r.spo2 for r in interval), min_bpm=min(r.bpm for r in interval),
                          max_bpm=max(r.bpm for r in interval), motion_detected=any(r.motion == 'ON' for r in interval))


def _patterns_in_run(run, start, finished, spo2_drop, bpm_rise):
    dips, rises = deque(), deque()
    baseline_start = 0
    first = last = None
    for i, (at, spo2, bpm, _) in enumerate(run):
        while at - run[baseline_start].at > BASELINE_WINDOW:
            baseline_start += 1
        if at < start or at - run[baseline_start].at < BASELINE_MINIMUM:
            continue
        for hits in (dips, rises):
            while hits and at - run[hits[0]].at > PAIR_WINDOW:
                hits.popleft()
        if first is not None and (not dips or not rises):
            yield _summarize(run, first, last)
            first = None
            dips.clear()
            rises.clear()

        # Keep the reference fixed once a pair is confirmed, so a sustained change
        # cannot become its own baseline and truncate the recorded range.
        if first is None:
            history = run[baseline_start:i]
            reference_spo2 = median(r.spo2 for r in history)
            reference_bpm = median(r.bpm for r in history)
        if reference_spo2 - spo2 >= spo2_drop:
            dips.append(i)
        if bpm - reference_bpm >= bpm_rise:
            rises.append(i)
        if len(dips) >= 2 and len(rises) >= 2:
            if first is None:
                first = min(dips[0], rises[0])
            last = max(dips[-1], rises[-1])
    if first is not None and finished:
        yield _summarize(run, first, last)


def detect_pulse_ox_patterns(
    readings: Iterable[tuple[datetime, int | None, int | None, str | None]],
    start: datetime, as_of: datetime, *, spo2_drop: int = 2, bpm_rise: int = 10,
) -> list[PulseOxPattern]:
    """Analyze ordered (aware timestamp, SpO2, bpm, motion) readings through as_of.

    Compare against the preceding median. Require two distinct readings of each
    change within twenty seconds, in either order. Motion flags travel with the
    result so the reviewer can consider movement when interpreting the readings.
    Earlier samples may supply a baseline. Only paired changes from start onward
    contribute to results. A live, still-changing pattern is held until it closes.
    """
    patterns = []
    for run, interrupted in _continuous_runs(readings, as_of):
        finished = interrupted or as_of - run[-1].at > MAX_GAP
        patterns.extend(_patterns_in_run(run, start, finished, spo2_drop, bpm_rise))
    return patterns
