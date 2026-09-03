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
"""Reconstructing when a monitoring alert actually ended.

The shapes tested here are taken from real rows that went wrong in the live
database, so each one names the failure it stands for.
"""
from datetime import datetime, timedelta, timezone

import pytest

from crud.alert_closure import (
    GAP_SECONDS, RECOVERY_SECONDS, Thresholds,
    classify_sample, infer_alert_end, load_thresholds,
    resweep_implausible_closures, sweep_open_alerts,
)

THRESHOLDS = Thresholds(90, 100, 55, 155)
START = datetime(2026, 6, 2, 3, 0, tzinfo=timezone.utc)


def _samples(db, patient_id, runs):
    """Write pulse-ox rows.

    `runs` is a list of (offset_seconds, count, spo2, bpm) laid down at the 2s
    cadence a real reader produces.
    """
    from schemas.pulse_ox_data import PulseOxData
    rows = []
    for offset, count, spo2, bpm in runs:
        for i in range(count):
            ts = START + timedelta(seconds=offset + i * 2)
            rows.append(PulseOxData(
                patient_id=patient_id, timestamp=ts,
                spo2=spo2, bpm=bpm, pa=2.0, created_at=ts,
            ))
    db.add_all(rows)
    db.commit()
    return rows


def _alert(db, patient_id, start=START, end=None, **kw):
    from schemas.monitoring_alert import MonitoringAlert
    a = MonitoringAlert(
        patient_id=patient_id, start_time=start, end_time=end,
        created_at=start, spo2_min=kw.pop("spo2_min", 88), **kw,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def _restless_alarm(count):
    """Out-of-range readings that keep moving, at the usual 2s cadence.

    Values vary so the run is not read as a stuck sensor, and the cadence is
    unbroken so it is not read as monitoring having stopped -- leaving "still
    going" as the only honest conclusion.
    """
    return [(i * 2, 1, 80 + (i % 5), 80 + (i % 3)) for i in range(count)]


def _infer(db, patient):
    return infer_alert_end(
        db, patient_id=patient.id, start_time=START, thresholds=THRESHOLDS,
    )


# --- classification --------------------------------------------------------

@pytest.mark.parametrize("spo2,bpm,expected", [
    (97, 80, "normal"),
    (88, 80, "alarm"),       # below min_spo2
    (97, 40, "alarm"),       # below min_bpm
    (-1, -1, "disconnected"),
    (-1, 80, "disconnected"),  # one dead channel is enough
    (0, 80, "disconnected"),
    (None, None, "disconnected"),
])
def test_classify_sample(spo2, bpm, expected):
    assert classify_sample(spo2, bpm, THRESHOLDS) == expected


def test_thresholds_come_from_the_lowercase_settings_keys(db_session):
    """crud/monitoring reads uppercase keys that match nothing; we must not."""
    from crud.settings import save_setting
    save_setting(db_session, "min_spo2", 85, "int", "test")
    db_session.commit()
    assert load_thresholds(db_session).min_spo2 == 85


# --- the recovery rule -----------------------------------------------------

def test_recovery_ends_once_the_values_have_held_for_thirty_seconds(db_session, patient):
    # 30s of desat, then normal for well over the recovery window.
    _samples(db_session, patient.id, [(0, 15, 88, 80), (30, 40, 97, 80)])

    got = _infer(db_session, patient)

    assert got.outcome == "recovery"
    # The countdown starts at the first normal sample (offset 30) and completes
    # RECOVERY_SECONDS later.
    assert (got.end_time - START).total_seconds() == pytest.approx(
        30 + RECOVERY_SECONDS, abs=2)


def test_a_brief_normal_blip_does_not_end_the_alert(db_session, patient):
    """Values touching normal for a moment is not the episode resolving."""
    _samples(db_session, patient.id, [
        (0, 5, 88, 80),
        (10, 2, 97, 80),     # 4s of normal, nowhere near enough
        (14, 5, 88, 80),
        (24, 40, 97, 80),    # the real recovery
    ])

    got = _infer(db_session, patient)

    assert got.outcome == "recovery"
    assert (got.end_time - START).total_seconds() == pytest.approx(
        24 + RECOVERY_SECONDS, abs=2)


def test_a_hole_in_the_stream_restarts_the_recovery_countdown(db_session, patient):
    """Twenty seconds of normal, a hole, then normal again is not fifty."""
    _samples(db_session, patient.id, [
        (0, 5, 88, 80),
        (10, 10, 97, 80),    # 20s of normal, then nothing for 40s
        (70, 40, 97, 80),
    ])

    got = _infer(db_session, patient)

    assert got.outcome == "recovery"
    # Counted from the second run, not from the first.
    assert (got.end_time - START).total_seconds() == pytest.approx(
        70 + RECOVERY_SECONDS, abs=2)


# --- monitoring stopping ---------------------------------------------------

def test_ends_at_the_last_sample_before_a_gap(db_session, patient):
    """Alert 1308's shape: data stops, and resumes thirteen hours later.

    Reading the first sample after the gap as the recovery would put this
    episode at thirteen hours; it was about a minute.
    """
    _samples(db_session, patient.id, [
        (0, 15, 88, 80),                 # 30s of desat, then silence
        (13 * 3600, 40, 97, 80),
    ])

    got = _infer(db_session, patient)

    assert got.outcome == "monitoring_ended"
    assert (got.end_time - START).total_seconds() == pytest.approx(28, abs=2)


def test_the_alert_2220_shape_a_recovery_cut_short_by_a_gap(db_session, patient):
    """The row that was recorded as 381.7 minutes long.

    Twenty-two seconds of normal readings -- short of the thirty the rule
    wants -- then the sensor came off for six hours. The old engine took the
    first sample on its return as proof the patient had been well all along.
    """
    _samples(db_session, patient.id, [
        (0, 1, 89, 92),          # the desat: a single sample
        (2, 12, 90, 90),         # 22s of normal, then nothing
        (6 * 3600, 40, 95, 85),
    ])

    got = _infer(db_session, patient)

    assert got.outcome == "monitoring_ended"
    minutes = (got.end_time - START).total_seconds() / 60
    assert minutes < 1, f"expected well under a minute, got {minutes:.1f}"


def test_a_long_disconnect_run_counts_as_a_gap(db_session, patient):
    """A probe left off streams -1 at full cadence: rows, but no readings.

    Nothing here is a hole in the *sample* stream, so a gap rule measured on
    the last row of any kind would never fire and the alert would be recorded
    as lasting the whole probe-off.
    """
    _samples(db_session, patient.id, [
        (0, 15, 88, 80),
        (30, 900, -1, -1),       # 30 minutes of nothing-readings
        (1830, 40, 97, 80),
    ])

    got = _infer(db_session, patient)

    assert got.outcome == "monitoring_ended"
    assert (got.end_time - START).total_seconds() == pytest.approx(28, abs=2)


def test_a_short_disconnect_blip_does_not_end_the_alert(db_session, patient):
    """A momentary probe re-seat should not chop the episode in two."""
    _samples(db_session, patient.id, [
        (0, 15, 88, 80),
        (30, 5, -1, -1),         # 10s of probe-off, far short of the gap
        (40, 5, 88, 80),         # still desaturating
        (50, 40, 97, 80),
    ])

    got = _infer(db_session, patient)

    assert got.outcome == "recovery"
    assert (got.end_time - START).total_seconds() == pytest.approx(
        50 + RECOVERY_SECONDS, abs=2)


def test_a_stream_that_simply_ends_closes_at_the_last_sample(db_session, patient):
    """Ids 143/573: two normal samples, then no data for seventeen days.

    A gap is only visible when a later sample exists to measure against, so a
    stream that just stops needs its own answer rather than falling through to
    "cannot tell".
    """
    _samples(db_session, patient.id, [(0, 22, 88, 80), (44, 2, 90, 99)])

    got = _infer(db_session, patient)

    assert got.outcome == "monitoring_ended"
    assert (got.end_time - START).total_seconds() == pytest.approx(46, abs=2)


def test_a_stuck_sensor_bounds_the_alert(db_session, patient):
    """A reading frozen at one value is a fault, not an endless desaturation."""
    _samples(db_session, patient.id, [(0, 900, 88, 70)])

    got = _infer(db_session, patient)

    assert got.outcome == "monitoring_ended"
    assert got.detail == "stuck_sensor"
    assert (got.end_time - START).total_seconds() < 120


def test_no_samples_at_all_gives_a_zero_length_episode(db_session, patient):
    got = _infer(db_session, patient)

    assert got.outcome == "no_data"
    assert got.end_time == START


def test_an_episode_still_running_is_left_alone(db_session, patient):
    """Unbroken, genuinely out-of-range readings past the lookahead bound.

    Truncating this at the bound would be inventing an answer, so the row must
    stay open rather than be given a plausible-looking end. The readings vary
    so this is not mistaken for a stuck sensor, and the stream continues past
    the bound so it is not mistaken for monitoring having stopped.
    """
    _samples(db_session, patient.id, _restless_alarm(400))

    got = infer_alert_end(
        db_session, patient_id=patient.id, start_time=START,
        thresholds=THRESHOLDS, max_lookahead_minutes=10,
    )

    assert got.outcome == "indeterminate"
    assert got.end_time is None


def test_an_end_can_never_land_before_the_start(db_session, patient):
    """The scan reaches back before start_time to catch the opening sample."""
    _samples(db_session, patient.id, [(-2, 1, 88, 80), (3600, 10, 97, 80)])

    got = _infer(db_session, patient)

    assert got.end_time >= START


# --- the sweep -------------------------------------------------------------

def test_the_sweep_closes_a_stranded_alert_and_records_how(db_session, patient):
    _samples(db_session, patient.id, [(0, 15, 88, 80), (30, 40, 97, 80)])
    alert = _alert(db_session, patient.id)

    summary = sweep_open_alerts(db_session, now=START + timedelta(hours=2))

    assert summary["closed"] == 1
    db_session.refresh(alert)
    assert alert.end_time is not None
    assert alert.end_source == "inferred_recovery"
    assert alert.end_time.tzinfo is not None


def test_the_sweep_leaves_alerts_inside_the_grace_window_alone(db_session, patient):
    """An episode the live engine may still be managing is not ours to close."""
    _samples(db_session, patient.id, [(0, 15, 88, 80), (30, 40, 97, 80)])
    alert = _alert(db_session, patient.id)

    summary = sweep_open_alerts(db_session, now=START + timedelta(minutes=5))

    assert summary["examined"] == 0
    db_session.refresh(alert)
    assert alert.end_time is None


def test_the_sweep_gives_up_visibly_rather_than_guessing(db_session, patient):
    """An alert it cannot resolve stays open, but is marked so it is not
    rescanned every five minutes forever."""
    # Unbroken alarm readings running past the two-hour lookahead, so the scan
    # genuinely reaches its bound with nothing concluded.
    _samples(db_session, patient.id, _restless_alarm(3700))
    alert = _alert(db_session, patient.id)

    first = sweep_open_alerts(db_session, now=START + timedelta(hours=3))
    assert first["indeterminate"] == 1
    db_session.refresh(alert)
    assert alert.end_time is None
    assert alert.end_source == "indeterminate"

    second = sweep_open_alerts(db_session, now=START + timedelta(hours=3))
    assert second["examined"] == 0


def test_the_sweep_respects_its_batch_limit(db_session, patient):
    _samples(db_session, patient.id, [(0, 15, 88, 80), (30, 40, 97, 80)])
    for i in range(4):
        _alert(db_session, patient.id, start=START + timedelta(seconds=i))

    summary = sweep_open_alerts(db_session, now=START + timedelta(hours=2), limit=2)

    assert summary["examined"] == 2


def test_the_sweep_ignores_alerts_that_are_already_closed(db_session, patient):
    _samples(db_session, patient.id, [(0, 15, 88, 80), (30, 40, 97, 80)])
    _alert(db_session, patient.id, end=START + timedelta(minutes=3))

    assert sweep_open_alerts(db_session, now=START + timedelta(hours=2))["examined"] == 0


# --- correcting ends written across a silence ------------------------------

def _mis_closed(db, patient):
    """Alert 2220's shape, recorded as ending when monitoring came back."""
    _samples(db, patient.id, [
        (0, 1, 89, 92), (2, 12, 90, 90), (6 * 3600, 40, 95, 85),
    ])
    return _alert(db, patient.id, end=START + timedelta(hours=6, seconds=2))


def test_an_end_written_across_a_silence_is_shortened(db_session, patient):
    alert = _mis_closed(db_session, patient)

    summary = resweep_implausible_closures(db_session, dry_run=False)

    assert summary["rewritten"] == 1
    db_session.refresh(alert)
    assert (alert.end_time - START).total_seconds() / 60 < 1
    assert alert.end_source == "inferred_monitoring_ended"
    # The value we overwrote is a clinical record; it is kept, not dropped.
    assert alert.end_time_superseded is not None


def test_a_plausible_closure_is_never_touched(db_session, patient):
    """Continuous data throughout: nothing here is evidence of a problem."""
    _samples(db_session, patient.id, [(0, 15, 88, 80), (30, 200, 97, 80)])
    alert = _alert(db_session, patient.id, end=START + timedelta(minutes=4))

    summary = resweep_implausible_closures(db_session, dry_run=False)

    assert summary["selected"] == 0
    db_session.refresh(alert)
    assert alert.end_time == START + timedelta(minutes=4)
    assert alert.end_source is None


def test_a_correction_may_only_ever_shorten(db_session, patient):
    """The failure being undone always overstates, so a rule that cannot
    lengthen cannot invent alert time."""
    _samples(db_session, patient.id, [
        (0, 1, 89, 92), (2, 12, 90, 90), (6 * 3600, 40, 95, 85),
    ])
    alert = _alert(db_session, patient.id, end=START + timedelta(seconds=1))

    resweep_implausible_closures(db_session, dry_run=False)

    db_session.refresh(alert)
    assert alert.end_time == START + timedelta(seconds=1)


def test_a_dry_run_changes_nothing(db_session, patient):
    alert = _mis_closed(db_session, patient)
    original = alert.end_time

    summary = resweep_implausible_closures(db_session, dry_run=True)

    assert summary["rewritten"] == 1
    db_session.refresh(alert)
    assert alert.end_time == original
    assert alert.end_source is None


def test_correcting_twice_changes_nothing_the_second_time(db_session, patient):
    _mis_closed(db_session, patient)

    resweep_implausible_closures(db_session, dry_run=False)
    again = resweep_implausible_closures(db_session, dry_run=False)

    assert again["selected"] == 0


def test_a_silence_visible_only_past_the_recorded_end_is_still_found(db_session, patient):
    """The sample that closes an alert is written just after end_time.

    A window clipped at end_time drops it, so the silence before it vanishes
    and the row looks continuous. That hid a fifth of the affected rows.
    """
    _samples(db_session, patient.id, [(0, 1, 89, 92), (2, 12, 90, 90)])
    end = START + timedelta(hours=6)
    # The reading that triggered the close, landing microseconds afterwards.
    _samples_at = end + timedelta(microseconds=300)
    from schemas.pulse_ox_data import PulseOxData
    db_session.add(PulseOxData(
        patient_id=patient.id, timestamp=_samples_at,
        spo2=95, bpm=85, pa=2.0, created_at=_samples_at,
    ))
    alert = _alert(db_session, patient.id, end=end)
    db_session.commit()

    summary = resweep_implausible_closures(db_session, dry_run=False)

    assert summary["selected"] == 1, "the post-end sample must be in the window"
    db_session.refresh(alert)
    assert (alert.end_time - START).total_seconds() / 60 < 1


# --- the maintenance endpoint ----------------------------------------------

def test_alert_closures_needs_a_system_administrator(limited_client):
    resp = limited_client.post(
        "/api/system/maintenance/alert-closures", json={"dry_run": True})
    assert resp.status_code == 403
