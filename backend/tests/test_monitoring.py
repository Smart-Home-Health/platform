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
"""Wave 4 — monitoring alerts: list/count, acknowledge (happy path + 404),
and the require_read_access gate."""

from datetime import datetime, timedelta, timezone

import pytest


@pytest.fixture
def alert(db_session, patient, account):
    """An unacknowledged monitoring alert for the test patient."""
    from schemas.monitoring_alert import MonitoringAlert
    now = datetime.now(timezone.utc)
    a = MonitoringAlert(
        account_id=account.id, patient_id=patient.id,
        start_time=now, created_at=now,
        acknowledged=False, spo2_min=82, spo2_alarm_triggered=True,
    )
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    return a


def _reload(db_session, alert_id):
    from schemas.monitoring_alert import MonitoringAlert
    db_session.expire_all()
    return db_session.query(MonitoringAlert).filter(MonitoringAlert.id == alert_id).first()


def test_list_alerts(admin_client):
    resp = admin_client.get("/api/monitoring/alerts")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.parametrize("source,closed,expected_end,hr_max", [
    ("live_recovery", True, 7, 114),
    ("inferred_recovery", True, 7, 114),
    ("live_gap", True, 40, 139),
    (None, True, 7, 114),  # Legacy alerts used the same 30s recovery hold.
    (None, False, None, 143),
])
def test_alert_extrema_use_only_the_patients_event(
        admin_client, db_session, account, patient, source, closed, expected_end, hr_max):
    from schemas.monitoring_alert import MonitoringAlert
    from schemas.patient import Patient
    from schemas.pulse_ox_data import PulseOxData

    start = datetime.now(timezone.utc) - timedelta(minutes=3)
    other = Patient(account_id=account.id, first_name="Other", last_name="Patient",
                    created_at=start, updated_at=start)
    db_session.add(other)
    db_session.flush()
    event = MonitoringAlert(patient_id=patient.id, start_time=start, created_at=start,
                            end_time=start + timedelta(seconds=40) if closed else None,
                            end_source=source, spo2_min=89, spo2_max=89, bpm_min=95, bpm_max=95)
    db_session.add(event)
    for second, pid, spo2, bpm in [
        (-1, patient.id, 61, 30), (0, patient.id, 89, 95),
        (2, patient.id, 84, 79), (3, other.id, 65, 180),
        (4, patient.id, -1, -1), (5, patient.id, 0, 0),
        (6, patient.id, 82, 100), (7, patient.id, 96, 114),
        (9, patient.id, 97, 138), (16, patient.id, 97, 101),
        (24, patient.id, 97, 101), (32, patient.id, 97, 101),
        (40.001, patient.id, 98, 139), (43, patient.id, 97, 143),
    ]:
        db_session.add(PulseOxData(patient_id=pid, timestamp=start + timedelta(seconds=second),
                                   spo2=spo2, bpm=bpm, created_at=start))
    db_session.commit()
    response = admin_client.get(f"/api/monitoring/alerts?patient_id={patient.id}")
    assert response.status_code == 200
    summary, = response.json()
    assert (summary["spo2_min"], summary["bpm_min"], summary["bpm_max"]) == (82, 79, hr_max)
    end = summary["event_end_time"]
    if closed:
        assert datetime.fromisoformat(end) == start + timedelta(seconds=expected_end)
    else:
        assert end is None
    detail = admin_client.get(f"/api/monitoring/alerts/{event.id}/data")
    assert detail.status_code == 200
    assert {p["patient_id"] for p in detail.json()} == {patient.id}


def test_alert_retains_opening_reading_when_raw_history_is_missing(admin_client, alert):
    summary, = admin_client.get(f"/api/monitoring/alerts?patient_id={alert.patient_id}").json()
    assert summary["spo2_min"] == 82
    assert summary["bpm_min"] is None and summary["bpm_max"] is None


@pytest.mark.parametrize("open_ended", [False, True])
def test_detailed_alert_samples_exclude_interleaved_other_patient(
        admin_client, db_session, account, patient, open_ended):
    """Live input during restore must not enter another patient's alert detail."""
    from datetime import timedelta
    from schemas.monitoring_alert import MonitoringAlert
    from schemas.patient import Patient
    from schemas.pulse_ox_data import PulseOxData

    now = datetime(2026, 7, 4, 12, 0, tzinfo=timezone.utc)
    other = Patient(account_id=account.id, first_name="Other", last_name="Resident",
                    created_at=now, updated_at=now)
    db_session.add(other)
    db_session.flush()
    samples = []
    for offset, patient_id, spo2 in ((0, patient.id, 97), (1, other.id, 80),
                                   (2, patient.id, 98), (3, patient.id, 99)):
        sample = PulseOxData(patient_id=patient_id, timestamp=now + timedelta(seconds=offset),
                             spo2=spo2, bpm=75, created_at=now)
        db_session.add(sample)
        db_session.flush()  # Ensure the other patient's ID lies inside the interval.
        samples.append(sample)
    db_session.add(MonitoringAlert(
        account_id=account.id, patient_id=patient.id, start_time=now, created_at=now,
        start_data_id=samples[0].id,
        end_data_id=None if open_ended else samples[2].id,
        end_time=None if open_ended else samples[2].timestamp,
        acknowledged=False,
    ))
    db_session.commit()

    response = admin_client.get(
        f"/api/monitoring/alerts?patient_id={patient.id}&detailed=true")
    assert response.status_code == 200
    alert, = response.json()
    expected = [samples[0].id, samples[2].id]
    if open_ended:
        expected.append(samples[3].id)
    assert [point["id"] for point in alert["data_points"]] == expected


def test_alerts_count(admin_client, alert):
    resp = admin_client.get("/api/monitoring/alerts/count")
    assert resp.status_code == 200
    assert resp.json()["count"] >= 1


def test_alerts_count_scoped_to_patient(admin_client, alert):
    """The dashboard badge asks for one patient; another patient's alerts
    must not count toward it."""
    resp = admin_client.get(f"/api/monitoring/alerts/count?patient_id={alert.patient_id}")
    assert resp.json()["count"] == 1
    resp = admin_client.get(f"/api/monitoring/alerts/count?patient_id={alert.patient_id + 1000}")
    assert resp.json()["count"] == 0


def test_acknowledge_alert(admin_client, db_session, alert):
    resp = admin_client.post(f"/api/monitoring/alerts/{alert.id}/acknowledge",
                             json={"oxygen_used": 2.0, "oxygen_unit": "L"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert _reload(db_session, alert.id).acknowledged is True


def test_acknowledge_unknown_alert_404(admin_client):
    resp = admin_client.post("/api/monitoring/alerts/999999/acknowledge", json={})
    assert resp.status_code == 404


def test_read_restricted_cannot_list_alerts(client, admin_user, account):
    from routes.auth import create_access_token
    token = create_access_token(user=admin_user, account=account,
                                auth_level="full", read_restricted=True)
    resp = client.get("/api/monitoring/alerts",
                      headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_requires_auth(client):
    assert client.get("/api/monitoring/alerts").status_code == 401


# --- /api/monitoring/history/recent (live dashboard backfill) ---

@pytest.fixture
def pulse_ox_rows(db_session, patient):
    """A minute of 1 Hz-ish pulse-ox samples, plus a disconnect sentinel."""
    from datetime import timedelta
    from schemas.pulse_ox_data import PulseOxData
    now = datetime.now(timezone.utc)
    rows = [
        PulseOxData(patient_id=patient.id, timestamp=now - timedelta(seconds=i * 5),
                    spo2=97, bpm=90, pa=2.0, created_at=now)
        for i in range(12)
    ]
    rows.append(PulseOxData(patient_id=patient.id, timestamp=now - timedelta(seconds=3),
                            spo2=-1, bpm=-1, pa=0, created_at=now))
    db_session.add_all(rows)
    db_session.commit()
    return rows


def test_recent_history_raw_bucket(admin_client, patient, pulse_ox_rows):
    resp = admin_client.get(f"/api/monitoring/history/recent?patient_id={patient.id}&minutes=15")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bucket_seconds"] == 2
    # 12 real samples; the spo2 = -1 sentinel row is excluded
    assert data["count"] == 12
    assert all(p["spo2"] == 97 for p in data["points"])
    assert data["points"] == sorted(data["points"], key=lambda p: p["t"])


def test_recent_history_bucketed(admin_client, patient, pulse_ox_rows):
    resp = admin_client.get(f"/api/monitoring/history/recent?patient_id={patient.id}&minutes=1440")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bucket_seconds"] == 300
    # All samples fall in one or two 5-minute buckets
    assert 1 <= data["count"] <= 2
    assert data["points"][0]["bpm"] == pytest.approx(90, abs=0.1)


def test_recent_history_clamps_params(admin_client, patient):
    resp = admin_client.get(
        f"/api/monitoring/history/recent?patient_id={patient.id}&minutes=99999&max_points=5")
    assert resp.status_code == 200
    data = resp.json()
    assert data["minutes"] == 1440
    assert data["bucket_seconds"] == 300  # snapped to the coarsest step


def test_recent_history_patient_scoped(admin_client, db_session, account, pulse_ox_rows):
    from crud.patients import create_patient
    other = create_patient(db_session, {
        "first_name": "Other", "last_name": "Patient",
        "account_id": account.id, "is_active": True,
    })
    db_session.commit()
    resp = admin_client.get(f"/api/monitoring/history/recent?patient_id={other.id}&minutes=15")
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


def test_recent_history_requires_auth(client, patient):
    assert client.get(f"/api/monitoring/history/recent?patient_id={patient.id}").status_code == 401


# ---------------------------------------------------------------------------
# Timeline: the day view's alert list.
# ---------------------------------------------------------------------------

def _alert(db_session, account, patient, start, end=None, **kw):
    from schemas.monitoring_alert import MonitoringAlert
    a = MonitoringAlert(
        account_id=account.id, patient_id=patient.id,
        start_time=start, end_time=end, created_at=start, **kw,
    )
    db_session.add(a)
    return a


def test_timeline_returns_the_days_alerts(admin_client, db_session, account, patient):
    from datetime import timedelta
    day = datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc)
    _alert(db_session, account, patient, day, day + timedelta(seconds=82),
           spo2_alarm_triggered=True, spo2_min=88)
    db_session.commit()

    resp = admin_client.get(
        f"/api/monitoring/timeline?patient_id={patient.id}&target_date=2026-03-04")
    assert resp.status_code == 200
    alerts = resp.json()["alerts"]
    assert len(alerts) == 1
    assert alerts[0]["spo2_alarm"] is True
    assert alerts[0]["spo2_min"] == 88
    assert alerts[0]["id"] is not None


def test_timeline_leaves_an_open_alert_open(admin_client, db_session, account, patient):
    day = datetime(2026, 3, 5, 9, 30, tzinfo=timezone.utc)
    _alert(db_session, account, patient, day, None, hr_alarm_triggered=True)
    db_session.commit()

    resp = admin_client.get(
        f"/api/monitoring/timeline?patient_id={patient.id}&target_date=2026-03-05")
    assert resp.status_code == 200
    alerts = resp.json()["alerts"]
    assert len(alerts) == 1
    # No synthesised end: the client needs the null to say "ongoing" rather
    # than compute a duration that never happened.
    assert alerts[0]["end"] is None


def test_timeline_finds_an_old_day_behind_many_newer_alerts(
        admin_client, db_session, account, patient):
    """The day view used to take the 200 most recent alerts and filter to the
    day afterwards, so a day sitting further back than that returned none."""
    from datetime import timedelta
    old_day = datetime(2026, 1, 2, 8, 0, tzinfo=timezone.utc)
    _alert(db_session, account, patient, old_day, old_day + timedelta(minutes=1),
           spo2_alarm_triggered=True)
    # 250 newer alerts, all on other days.
    newer = datetime(2026, 2, 1, 0, 0, tzinfo=timezone.utc)
    for i in range(250):
        _alert(db_session, account, patient, newer + timedelta(hours=i),
               newer + timedelta(hours=i, minutes=1))
    db_session.commit()

    resp = admin_client.get(
        f"/api/monitoring/timeline?patient_id={patient.id}&target_date=2026-01-02")
    assert resp.status_code == 200
    assert len(resp.json()["alerts"]) == 1


def test_timeline_alerts_are_patient_scoped(admin_client, db_session, account, patient):
    from crud.patients import create_patient
    day = datetime(2026, 3, 6, 10, 0, tzinfo=timezone.utc)
    other = create_patient(db_session, {
        "first_name": "Other", "last_name": "Patient",
        "account_id": account.id, "is_active": True,
    })
    db_session.commit()
    _alert(db_session, account, other, day, day, spo2_alarm_triggered=True)
    db_session.commit()

    resp = admin_client.get(
        f"/api/monitoring/timeline?patient_id={patient.id}&target_date=2026-03-06")
    assert resp.status_code == 200
    assert resp.json()["alerts"] == []


@pytest.mark.parametrize("day,start_hour,day_hours", [
    ("2026-11-19", 5, 24),
    ("2026-03-08", 5, 23),
    ("2026-11-01", 4, 25),
])
def test_timeline_covers_exact_local_day(admin_client, db_session, account, patient, day, start_hour, day_hours):
    from sqlalchemy import text
    from schemas.pulse_ox_data import PulseOxData

    # Midnight in the patient's timezone expressed as an absolute instant.
    start = datetime.fromisoformat(day).replace(hour=start_hour, tzinfo=timezone.utc)
    end = start + timedelta(hours=day_hours)
    expected = [start, start + timedelta(minutes=90), start + timedelta(minutes=150),
                start + timedelta(hours=4, minutes=59), start + timedelta(hours=5), end - timedelta(minutes=1)]
    for ts in [start - timedelta(minutes=1), *expected, end]:
        db_session.add(PulseOxData(patient_id=patient.id, timestamp=ts, spo2=97, bpm=75, created_at=ts))
        _alert(db_session, account, patient, ts, None)
    db_session.flush()
    # Reproduce add-on installations whose PostgreSQL session uses local time.
    db_session.execute(text("SET LOCAL TIME ZONE 'America/New_York'"))
    result = admin_client.get(f"/api/monitoring/timeline?patient_id={patient.id}&target_date={day}")
    assert result.status_code == 200
    data = result.json()
    assert [datetime.fromisoformat(r['ts']) for r in data['pulse_ox']] == expected
    assert [datetime.fromisoformat(a['start']) for a in data['alerts']] == expected
    assert datetime.fromisoformat(data['day_start']) == start
    assert datetime.fromisoformat(data['day_end']) == end
    assert data['timezone'] == 'America/New_York'


def test_timeline_today_uses_patient_timezone(admin_client, patient, monkeypatch):
    from routes import monitoring
    monkeypatch.setattr(monitoring, "utc_now", lambda: datetime(2026, 11, 20, 3, tzinfo=timezone.utc))
    result = admin_client.get(f"/api/monitoring/timeline?patient_id={patient.id}")
    assert result.status_code == 200
    data = result.json()
    assert data["today"] == data["date"] == "2026-11-19"


def test_timeline_preserves_valid_reading_bounds_per_signal(admin_client, db_session, patient):
    from schemas.pulse_ox_data import PulseOxData

    start = datetime(2026, 11, 19, 12, tzinfo=timezone.utc)
    for seconds, spo2, bpm in [(0, 96, 70), (10, 98, -1), (70, 99, 75), (130.001, 97, None)]:
        ts = start + timedelta(seconds=seconds)
        db_session.add(PulseOxData(patient_id=patient.id, timestamp=ts, spo2=spo2, bpm=bpm, created_at=ts))
    db_session.flush()
    response = admin_client.get(f'/api/monitoring/timeline?patient_id={patient.id}&target_date=2026-11-19')
    assert response.status_code == 200
    a, b, c = response.json()['pulse_ox']
    assert a['spo2'] == 97 and a['sample_offsets_ms'] == {'spo2': [0, 10000], 'bpm': [0, 0]}
    assert b['sample_offsets_ms'] == {'spo2': [10000, 10000], 'bpm': [10000, 10000]}
    assert c['sample_offsets_ms'] == {'spo2': [10001, 10001]} and c['bpm'] is None
