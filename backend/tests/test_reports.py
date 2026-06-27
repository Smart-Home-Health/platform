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
