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
