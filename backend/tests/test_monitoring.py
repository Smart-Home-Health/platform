# Smart Home Health Hub
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
