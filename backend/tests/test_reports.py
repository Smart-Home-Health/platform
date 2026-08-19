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
"""Wave 4 — reports: day-over-day / overnight / weekly-summary contract,
the vital_type + aggregation allowlists (400), date parsing (400), and the
require_read_access gate."""
import pytest


def test_day_over_day_ok(admin_client, patient):
    resp = admin_client.get("/api/reports/day-over-day", params={
        "patient_id": patient.id, "vital_type": "heart_rate",
        "dates": "2026-06-01", "aggregation": "hour",
    })
    assert resp.status_code == 200, resp.text


def test_day_over_day_rejects_bad_vital_type(admin_client, patient):
    resp = admin_client.get("/api/reports/day-over-day", params={
        "patient_id": patient.id, "vital_type": "telepathy", "dates": "2026-06-01",
    })
    assert resp.status_code == 400


def test_day_over_day_rejects_bad_aggregation(admin_client, patient):
    resp = admin_client.get("/api/reports/day-over-day", params={
        "patient_id": patient.id, "vital_type": "heart_rate",
        "dates": "2026-06-01", "aggregation": "decade",
    })
    assert resp.status_code == 400


def test_overnight_ok(admin_client, patient):
    resp = admin_client.get("/api/reports/overnight", params={
        "patient_id": patient.id, "report_date": "2026-06-01",
    })
    assert resp.status_code == 200, resp.text


def test_overnight_reports_sensor_coverage(admin_client, db_session, patient):
    """The overnight header says how much of the window the sensor actually
    covered. It is derived from the sample count at the same ~4s cadence the
    time-below-90 figure already assumes, and capped at the window itself."""
    from datetime import datetime, timedelta, timezone
    from schemas.pulse_ox_data import PulseOxData

    # 3 AM UTC on the 2nd sits inside the 8 PM–8 AM window whether the account
    # keeps UTC or a US timezone, so the count is the same either way.
    start = datetime(2026, 6, 2, 3, 0, tzinfo=timezone.utc)
    db_session.add_all([
        PulseOxData(patient_id=patient.id, timestamp=start + timedelta(seconds=i * 4),
                    spo2=97, bpm=90, pa=2.0, created_at=start)
        for i in range(150)  # 150 samples × 4s = 10 minutes of wall clock
    ])
    db_session.commit()

    resp = admin_client.get("/api/reports/overnight", params={
        "patient_id": patient.id, "report_date": "2026-06-01",
    })
    assert resp.status_code == 200, resp.text
    vs = resp.json()["vitals_summary"]
    assert vs["sample_count"] == 150
    assert vs["coverage_minutes"] == 10.0        # ten minutes hold a reading
    assert vs["window_minutes"] == 720.0        # 8 PM -> 8 AM
    assert vs["coverage_minutes"] <= vs["window_minutes"]


def test_overnight_rejects_bad_date(admin_client, patient):
    resp = admin_client.get("/api/reports/overnight", params={
        "patient_id": patient.id, "report_date": "not-a-date",
    })
    assert resp.status_code == 400


def test_weekly_summary_ok(admin_client, patient):
    resp = admin_client.get("/api/reports/weekly-summary", params={"patient_id": patient.id})
    assert resp.status_code == 200, resp.text


def test_weekly_summary_daily_carries_the_days_range(admin_client, db_session, patient):
    """Each day in the weekly sparkline reports its own low/high, not just the
    mean — a week of 97% averages hides the night that dipped to 55."""
    from datetime import datetime, timedelta, timezone
    from schemas.pulse_ox_data import PulseOxData

    day = datetime(2026, 6, 10, 15, 0, tzinfo=timezone.utc)  # mid-afternoon: same date in any US tz
    db_session.add_all([
        PulseOxData(patient_id=patient.id, timestamp=day + timedelta(seconds=i * 4),
                    spo2=spo2, bpm=90, pa=2.0, created_at=day)
        for i, spo2 in enumerate([99, 55, 97])
    ])
    db_session.commit()

    resp = admin_client.get("/api/reports/weekly-summary", params={
        "patient_id": patient.id, "end_date": "2026-06-10",
    })
    assert resp.status_code == 200, resp.text
    daily = resp.json()["vitals"]["spo2"]["daily"]
    entry = next(d for d in daily if d["date"] == "2026-06-10")
    assert entry["low"] == 55
    assert entry["high"] == 99
    assert entry["avg"] == pytest.approx(83.7, abs=0.1)


def test_read_restricted_blocked(client, admin_user, account, patient):
    from routes.auth import create_access_token
    token = create_access_token(user=admin_user, account=account,
                                auth_level="full", read_restricted=True)
    resp = client.get("/api/reports/weekly-summary",
                      params={"patient_id": patient.id},
                      headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_requires_auth(client):
    assert client.get("/api/reports/weekly-summary", params={"patient_id": 1}).status_code == 401


def _alert(patient_id, start, end=None, **kw):
    """A monitoring alert row. end=None is an alert that was never closed —
    the reader restarts mid-episode and the closing write never lands."""
    from schemas.monitoring_alert import MonitoringAlert
    return MonitoringAlert(
        patient_id=patient_id, start_time=start, end_time=end,
        created_at=start, spo2_min=kw.pop("spo2_min", 88), **kw,
    )


def test_overnight_survives_an_unclosed_alert(admin_client, db_session, patient):
    """An alert with no end_time used to 500 the whole page. start_time is
    timestamptz, so the driver returns an aware datetime, while the window
    bounds are naive UTC — the `end_time or utc_end` fallback subtracted one
    from the other and raised 'can't subtract offset-naive and offset-aware
    datetimes'. One orphaned row took out the entire night's report."""
    from datetime import datetime, timezone

    db_session.add(_alert(patient.id, datetime(2026, 6, 2, 3, 0, tzinfo=timezone.utc)))
    db_session.commit()

    resp = admin_client.get("/api/reports/overnight", params={
        "patient_id": patient.id, "report_date": "2026-06-01",
    })
    assert resp.status_code == 200, resp.text


def test_overnight_counts_unclosed_alert_but_not_its_duration(admin_client, db_session, patient):
    """The episode is real so it stays in the count, but its length is not
    knowable. Running it to the end of the window would have charged this
    night ~9 hours of alert time for a desat that recovered in minutes."""
    from datetime import datetime, timedelta, timezone

    closed_start = datetime(2026, 6, 2, 2, 0, tzinfo=timezone.utc)
    db_session.add_all([
        _alert(patient.id, closed_start, closed_start + timedelta(minutes=3)),
        _alert(patient.id, datetime(2026, 6, 2, 3, 0, tzinfo=timezone.utc)),  # never closed
    ])
    db_session.commit()

    resp = admin_client.get("/api/reports/overnight", params={
        "patient_id": patient.id, "report_date": "2026-06-01",
    })
    assert resp.status_code == 200, resp.text
    alerts = resp.json()["alerts"]

    assert alerts["total"] == 2                      # both episodes counted
    assert alerts["unclosed"] == 1
    assert alerts["total_duration_minutes"] == 3.0   # only the closed one
    assert alerts["longest_duration_minutes"] == 3.0

    unclosed = [i for i in alerts["items"] if i["unclosed"]]
    assert len(unclosed) == 1
    assert unclosed[0]["duration_minutes"] is None
    assert unclosed[0]["end_time"] is None


def test_overnight_unclosed_alert_does_not_inflate_oxygen_minutes(admin_client, db_session, patient):
    """Same rule for the oxygen tile: the episode counts, the minutes don't."""
    from datetime import datetime, timezone

    db_session.add(_alert(
        patient.id, datetime(2026, 6, 2, 3, 0, tzinfo=timezone.utc),
        oxygen_used=True, oxygen_highest=2.0,
    ))
    db_session.commit()

    resp = admin_client.get("/api/reports/overnight", params={
        "patient_id": patient.id, "report_date": "2026-06-01",
    })
    assert resp.status_code == 200, resp.text
    oxygen = resp.json()["oxygen"]
    assert oxygen["episodes"] == 1
    assert oxygen["total_minutes"] == 0
    assert oxygen["highest_flow"] == 2.0


def test_weekly_summary_excludes_unclosed_alerts_from_duration(admin_client, db_session, patient):
    """The weekly total ran unclosed alerts to NOW(), so a months-old orphan
    reported more alert minutes than there are minutes in the week."""
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    closed_start = now - timedelta(days=1)
    db_session.add_all([
        _alert(patient.id, closed_start, closed_start + timedelta(minutes=5)),
        _alert(patient.id, now - timedelta(days=2)),  # never closed
    ])
    db_session.commit()

    resp = admin_client.get("/api/reports/weekly-summary", params={"patient_id": patient.id})
    assert resp.status_code == 200, resp.text
    alerts = resp.json()["alerts"]

    assert alerts["total"] == 2
    assert alerts["unclosed"] == 1
    assert alerts["total_duration_minutes"] == 5.0
    # A week only holds 10080 minutes; the old COALESCE(end_time, NOW()) put
    # roughly 2880 of them here on its own.
    assert alerts["total_duration_minutes"] < 10080
