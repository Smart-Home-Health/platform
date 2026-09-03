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
"""The synthetic two-patient test that docs/alert-subsystem-handoff.md 3.1 asks for.

StateModule used to keep its alert tracking (`current_alert_id`,
`alert_recovery_start_time`, `alert_last_valid_sample_time`) as single scalars
on the module instance. The dev dataset cannot show whether that matters: this
install has only ever carried one real stream (handoff §4), so the question
has to be answered here, with two synthetic streams interleaved through one
StateModule. Before the state was keyed by patient, the three two-patient
tests below each reproduced one of the failure modes inferred in the handoff.

The restart tests cover the other half of the fix: state is rehydrated from
open rows on startup, including the last valid sample time — without that, the
first sample after a long outage would run a fresh recovery countdown and
stamp the end at the moment monitoring resumed, which is the exact failure
PR #141 removed.

The samples are fed to _check_pulse_ox_thresholds directly (as
_handle_pulse_ox_update would) so the timeline is synthetic and the live
engine sees only the pulse-ox rows a test chooses to write.
"""
import asyncio
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import pytest

import state_manager
from bus import EventBus
from crud.alert_closure import GAP_SECONDS, LIVE_GAP, LIVE_RECOVERY, RECOVERY_SECONDS
from modules.state_module import StateModule
from utils.datetime_utils import make_utc, utc_now

ALARM_SPO2 = 82   # below min_spo2 (90 by default in load_thresholds)
NORMAL_SPO2 = 97
NORMAL_BPM = 80

START = datetime(2026, 6, 2, 3, 0, tzinfo=timezone.utc)


@pytest.fixture
def two_patients(db_session, account):
    from crud.patients import create_patient
    made = []
    for first in ("Alpha", "Beta"):
        p = create_patient(db_session, {
            "first_name": first, "last_name": "Stream",
            "account_id": account.id, "is_active": True,
        })
        made.append(p)
    db_session.commit()
    return made


@pytest.fixture
def state_module(db_session, monkeypatch):
    """A real StateModule whose DB access lands on the transactional session."""
    @contextmanager
    def _test_session():
        yield db_session

    monkeypatch.setattr(state_manager, "get_db_session", _test_session)
    return StateModule(EventBus())


def _feed(sm, t, spo2, bpm, patient_id):
    """One sample through the live state machine, at a timeline we control."""
    point = {"timestamp": t, "spo2": spo2, "bpm": bpm, "perfusion": 2.0, "raw": None}
    asyncio.run(sm._check_pulse_ox_thresholds(spo2, bpm, t, point, patient_id=patient_id))


def _alerts(db, patient_id):
    from schemas.monitoring_alert import MonitoringAlert
    return (db.query(MonitoringAlert)
            .filter(MonitoringAlert.patient_id == patient_id)
            .order_by(MonitoringAlert.id).all())


def _open_alert(db, patient_id, start=START, **kw):
    from schemas.monitoring_alert import MonitoringAlert
    a = MonitoringAlert(patient_id=patient_id, start_time=start, end_time=None,
                        created_at=start, spo2_min=ALARM_SPO2, **kw)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def _samples(db, patient_id, runs):
    """Write pulse-ox rows; `runs` is (offset_s, count, spo2, bpm) at 2s cadence."""
    from schemas.pulse_ox_data import PulseOxData
    rows = []
    for offset, count, spo2, bpm in runs:
        for i in range(count):
            ts = START + timedelta(seconds=offset + i * 2)
            rows.append(PulseOxData(patient_id=patient_id, timestamp=ts,
                                    spo2=spo2, bpm=bpm, pa=2.0, created_at=ts))
    db.add_all(rows)
    db.commit()
    return rows


# --- Two concurrent streams --------------------------------------------------

def test_single_stream_opens_and_recovery_closes(state_module, db_session, two_patients):
    """Harness validity: one stream drives open → 30s recovery → close."""
    a, _ = two_patients
    t0 = utc_now()

    _feed(state_module, t0, ALARM_SPO2, NORMAL_BPM, a.id)
    rows = _alerts(db_session, a.id)
    assert len(rows) == 1 and rows[0].end_time is None

    # Normal readings at the real 2s cadence until the countdown completes.
    for s in range(2, RECOVERY_SECONDS + 4, 2):
        _feed(state_module, t0 + timedelta(seconds=s), NORMAL_SPO2, NORMAL_BPM, a.id)

    rows = _alerts(db_session, a.id)
    assert len(rows) == 1
    assert rows[0].end_time is not None
    assert rows[0].end_source == LIVE_RECOVERY


def test_second_patients_alarm_opens_its_own_row(state_module, db_session, two_patients):
    """While A's alert is open, B's out-of-range samples open B's own row.

    A single shared `current_alert_id` sent B's samples down the ALARM branch
    of A's alert, so B's episode was never recorded at all — the missing-row
    half of 3.1, and the clinically serious one.
    """
    a, b = two_patients
    t0 = utc_now()

    _feed(state_module, t0, ALARM_SPO2, NORMAL_BPM, a.id)
    for s in (1, 3, 5):
        _feed(state_module, t0 + timedelta(seconds=s), ALARM_SPO2 - 2, NORMAL_BPM, b.id)

    assert len(_alerts(db_session, a.id)) == 1
    assert len(_alerts(db_session, b.id)) == 1


def test_other_patients_normal_samples_do_not_close_an_alert(state_module, db_session, two_patients):
    """B's healthy readings are not evidence that A recovered.

    A alarms, then A's reader drops (no samples of any kind). B streams normal
    at the usual cadence. With shared state, B's samples ran A's recovery
    countdown and closed A's alert as live_recovery ~30s later, stamping an
    end nobody observed on A.
    """
    a, b = two_patients
    t0 = utc_now()

    _feed(state_module, t0, ALARM_SPO2, NORMAL_BPM, a.id)
    for s in range(12, 12 + RECOVERY_SECONDS + 6, 2):
        _feed(state_module, t0 + timedelta(seconds=s), NORMAL_SPO2, NORMAL_BPM, b.id)

    rows = _alerts(db_session, a.id)
    assert len(rows) == 1
    assert rows[0].end_time is None, (
        f"closed as {rows[0].end_source} by the other patient's stream"
    )


def test_second_stream_does_not_mask_a_gap_in_the_first(state_module, db_session, two_patients):
    """A silence in A's stream is a silence even while B keeps streaming.

    A alarms and goes silent mid-episode. B keeps streaming (also in alarm, so
    recovery never runs). With a shared `alert_last_valid_sample_time`, B's
    samples hid A's silence from the gap rule and one row silently spanned
    the hole — the failure PR #141 fixed, resurrected by a second stream.
    """
    a, b = two_patients
    t0 = utc_now()

    for s in (0, 2, 4):
        _feed(state_module, t0 + timedelta(seconds=s), ALARM_SPO2, NORMAL_BPM, a.id)
    a_last_valid = t0 + timedelta(seconds=4)

    # A is now silent; B streams in alarm at the 2s cadence for 3 gaps' worth.
    for s in range(5, 3 * GAP_SECONDS, 2):
        _feed(state_module, t0 + timedelta(seconds=s), ALARM_SPO2 - 2, NORMAL_BPM, b.id)

    # A resumes, still out of range.
    _feed(state_module, t0 + timedelta(seconds=3 * GAP_SECONDS + 1),
          ALARM_SPO2, NORMAL_BPM, a.id)

    rows = _alerts(db_session, a.id)
    assert len(rows) == 2, "A's return after the gap should have opened a new episode"
    first = rows[0]
    assert first.end_source == LIVE_GAP
    assert first.end_time is not None
    assert abs((first.end_time - a_last_valid).total_seconds()) <= 2


# --- Restart rehydration -----------------------------------------------------

def test_rehydration_adopts_open_alert_and_gap_closes_at_last_real_sample(
        state_module, db_session, two_patients):
    """The restart case, fixed at its source.

    An alert is open, its stream stops, the process restarts, and monitoring
    resumes hours later with a normal reading. The rehydrated engine must
    close the episode at the last stored sample (live_gap), not run a fresh
    recovery countdown that stamps the end at resume time.
    """
    a, _ = two_patients
    alert = _open_alert(db_session, a.id)
    _samples(db_session, a.id, [(0, 3, ALARM_SPO2, NORMAL_BPM)])
    last_stored = START + timedelta(seconds=4)

    asyncio.run(state_module._rehydrate_open_alerts())
    st = state_module.patient_alerts[a.id]
    assert st.alert_id == alert.id
    assert st.last_valid_sample_time == make_utc(last_stored)

    _feed(state_module, START + timedelta(hours=6), NORMAL_SPO2, NORMAL_BPM, a.id)

    rows = _alerts(db_session, a.id)
    assert len(rows) == 1
    assert rows[0].end_source == LIVE_GAP
    assert make_utc(rows[0].end_time) == make_utc(last_stored)


def test_rehydration_skips_indeterminate_rows(state_module, db_session, two_patients):
    """'indeterminate' means "we looked and could not tell" — adopting it
    would put the row back into play after the sweep deliberately gave up."""
    a, _ = two_patients
    _open_alert(db_session, a.id, end_source="indeterminate")

    asyncio.run(state_module._rehydrate_open_alerts())
    assert a.id not in state_module.patient_alerts


def test_live_close_yields_when_alert_was_closed_elsewhere(
        state_module, db_session, two_patients):
    """A rehydrated alert the sweep already closed keeps its inferred end.

    If the stream resumes after the sweep has closed the row, the engine's
    recovery countdown must not overwrite the inferred end with a live time
    stamped after the resume.
    """
    from crud.monitoring import update_monitoring_alert

    a, _ = two_patients
    alert = _open_alert(db_session, a.id)
    _samples(db_session, a.id, [(0, 3, ALARM_SPO2, NORMAL_BPM)])
    asyncio.run(state_module._rehydrate_open_alerts())

    # The sweep closes the row while the engine still tracks it.
    swept_end = START + timedelta(seconds=4)
    update_monitoring_alert(db_session, alert.id, end_time=swept_end,
                            end_source="inferred_monitoring_ended")

    # Stream resumes normal within the gap threshold and recovery completes.
    resume = START + timedelta(seconds=60)
    for s in range(0, RECOVERY_SECONDS + 4, 2):
        _feed(state_module, resume + timedelta(seconds=s), NORMAL_SPO2, NORMAL_BPM, a.id)

    rows = _alerts(db_session, a.id)
    assert len(rows) == 1
    assert make_utc(rows[0].end_time) == make_utc(swept_end)
    assert rows[0].end_source == "inferred_monitoring_ended"
    assert state_module.patient_alerts[a.id].alert_id is None
