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

from datetime import datetime, timezone

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


def test_alerts_count(admin_client, alert):
    resp = admin_client.get("/api/monitoring/alerts/count")
    assert resp.status_code == 200
    assert resp.json()["count"] >= 1


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
