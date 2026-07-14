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
"""GH #49 — environmental correlation stats: planted-association math,
soft-delete exclusion, insufficiency honesty, guardrailed copy, and the
clinical-events overlay endpoint."""

import json
from datetime import datetime, timedelta, timezone

import pytest

from environment.base import EnvObservation
from environment.service import emit_observations

# Words that must never appear in user-facing correlation copy: causal claims
# or care advice. Checked case-insensitively across every message.
BANNED_WORDS = ["caused", "because of", "due to", "triggers", "leads to",
                "consider ", "you should", "increase the", "decrease the"]


def _now_hour():
    return datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)


def _seed_pressure_pattern(db_session, days=30):
    """Hourly pressure_delta_6h series: a 4-hour block of -6.0 hPa every 3rd
    day, +0.5 otherwise. Returns the list of drop-block start hours."""
    end = _now_hour()
    start = end - timedelta(days=days)
    obs, drop_starts = [], []
    h = start
    while h <= end:
        hours_in = int((h - start).total_seconds() // 3600)
        day = hours_in // 24
        hour_of_day = hours_in % 24
        in_drop = (day % 3 == 0) and (10 <= hour_of_day < 14)
        if in_drop and hour_of_day == 10:
            drop_starts.append(h)
        obs.append(EnvObservation(
            timestamp=h, metric="pressure_delta_6h",
            value=-6.0 if in_drop else 0.5, unit="hPa",
            scope="outdoor", location="", source_id="test",
            quality="estimated",
        ))
        h += timedelta(hours=1)
    emit_observations(db_session, "open_meteo", obs, publish_events=False)
    db_session.commit()
    return drop_starts


def _plant_spo2_alarms(db_session, patient, account, times):
    from schemas.monitoring_alert import MonitoringAlert
    for t in times:
        db_session.add(MonitoringAlert(
            account_id=account.id, patient_id=patient.id,
            start_time=t, created_at=t,
            acknowledged=True, spo2_min=84, spo2_alarm_triggered=True,
        ))
    db_session.commit()


def _make_respiratory_task(db_session, account, name="Suction", category="Respiratory"):
    from schemas.care_task import CareTask
    from schemas.care_task_category import CareTaskCategory
    cat = (db_session.query(CareTaskCategory)
           .filter(CareTaskCategory.name == category).first())
    if cat is None:
        now = datetime.now(timezone.utc)
        cat = CareTaskCategory(account_id=account.id, name=category, active=True,
                               created_at=now, updated_at=now)
        db_session.add(cat)
        db_session.flush()
    now = datetime.now(timezone.utc)
    task = CareTask(account_id=account.id, name=name, category_id=cat.id, active=True,
                    created_at=now, updated_at=now)
    db_session.add(task)
    db_session.commit()
    return task


def _log_task(db_session, patient, task, when, voided=False):
    from schemas.care_task_log import CareTaskLog
    log = CareTaskLog(
        care_task_id=task.id, patient_id=patient.id,
        completed_at=when, status="completed", created_at=when,
        voided_at=when if voided else None,
    )
    db_session.add(log)
    db_session.commit()
    return log


def _get_card(payload, exposure, outcome):
    for c in payload["cards"]:
        if c["exposure"]["key"] == exposure and c["outcome"]["key"] == outcome:
            return c
    raise AssertionError(f"card ({exposure}, {outcome}) missing")


def _assert_no_banned_words(payload):
    blob = json.dumps(payload).lower()
    for word in BANNED_WORDS:
        assert word not in blob, f"banned word {word!r} found in correlation copy"


# ---------------------------------------------------------------------------
# Correlation math
# ---------------------------------------------------------------------------

def test_planted_association_found(admin_client, db_session, patient, account):
    drop_starts = _seed_pressure_pattern(db_session, days=30)
    # An alarm 2h after every drop-block start (inside the 6h window), plus a
    # thin scatter far outside windows.
    _plant_spo2_alarms(db_session, patient, account,
                       [d + timedelta(hours=2) for d in drop_starts])
    _plant_spo2_alarms(db_session, patient, account, [
        drop_starts[0] + timedelta(days=1, hours=8),
        drop_starts[1] + timedelta(days=1, hours=9),
    ])

    resp = admin_client.get(
        f"/api/analysis/patients/{patient.id}/env-correlations?days=30")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["source"] == "on_demand"
    assert payload["disclaimer"]
    assert len(payload["cards"]) == 11

    card = _get_card(payload, "pressure_drop_6h", "spo2_alarms")
    assert card["status"] == "ok"
    assert card["exposed_events"] == len(drop_starts)
    assert card["baseline_events"] == 2
    assert card["rate_ratio"] > 1
    assert card["ci_low"] <= card["rate_ratio"] <= card["ci_high"]
    assert "more common" in card["message"]
    assert card["exposure"]["quality"] == "estimated"
    _assert_no_banned_words(payload)


def test_voided_care_task_logs_excluded(admin_client, db_session, patient, account):
    drop_starts = _seed_pressure_pattern(db_session, days=30)
    task = _make_respiratory_task(db_session, account)
    for d in drop_starts[:5]:
        _log_task(db_session, patient, task, d + timedelta(hours=1))
    # A voided log inside a window must not count
    _log_task(db_session, patient, task,
              drop_starts[0] + timedelta(hours=3), voided=True)

    resp = admin_client.get(
        f"/api/analysis/patients/{patient.id}/env-correlations?days=30")
    card = _get_card(resp.json(), "pressure_drop_6h", "respiratory_care")
    assert card["status"] == "ok"
    assert card["exposed_events"] == 5  # not 6
    assert card["outcome"]["matched_sources"] == ["Suction"]


def test_non_respiratory_tasks_not_matched(admin_client, db_session, patient, account):
    _seed_pressure_pattern(db_session, days=30)
    from schemas.care_task_category import CareTaskCategory
    from schemas.care_task import CareTask
    now2 = datetime.now(timezone.utc)
    cat = CareTaskCategory(account_id=account.id, name="bathroom-test", active=True,
                           created_at=now2, updated_at=now2)
    db_session.add(cat)
    db_session.flush()
    task = CareTask(account_id=account.id, name="Brush Teeth", category_id=cat.id,
                    active=True, created_at=now2, updated_at=now2)
    db_session.add(task)
    db_session.commit()
    for i in range(6):
        _log_task(db_session, patient, task, _now_hour() - timedelta(days=i + 1))

    resp = admin_client.get(
        f"/api/analysis/patients/{patient.id}/env-correlations?days=30")
    card = _get_card(resp.json(), "pressure_drop_6h", "respiratory_care")
    assert card["status"] == "insufficient_data"
    assert "Not enough data yet" in card["message"]


def test_no_env_data_all_insufficient(admin_client, patient):
    resp = admin_client.get(
        f"/api/analysis/patients/{patient.id}/env-correlations?days=30")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["disclaimer"]
    assert all(c["status"] == "insufficient_data" for c in payload["cards"])
    _assert_no_banned_words(payload)


def test_too_few_events_message(admin_client, db_session, patient, account):
    drop_starts = _seed_pressure_pattern(db_session, days=30)
    _plant_spo2_alarms(db_session, patient, account,
                       [drop_starts[0] + timedelta(hours=1)])
    resp = admin_client.get(
        f"/api/analysis/patients/{patient.id}/env-correlations?days=30")
    card = _get_card(resp.json(), "pressure_drop_6h", "spo2_alarms")
    assert card["status"] == "insufficient_data"
    assert "1 of 5 needed" in card["message"]


def test_zero_baseline_events_continuity(admin_client, db_session, patient, account):
    drop_starts = _seed_pressure_pattern(db_session, days=30)
    # All events inside windows, none in baseline -> continuity correction
    _plant_spo2_alarms(db_session, patient, account,
                       [d + timedelta(hours=2) for d in drop_starts[:6]])
    resp = admin_client.get(
        f"/api/analysis/patients/{patient.id}/env-correlations?days=30")
    card = _get_card(resp.json(), "pressure_drop_6h", "spo2_alarms")
    assert card["status"] == "ok"
    assert card["continuity_corrected"] is True
    assert card["ci_high"] > card["ci_low"] > 0


def test_threshold_and_window_params_validated(admin_client, patient):
    base = f"/api/analysis/patients/{patient.id}/env-correlations"
    assert admin_client.get(f"{base}?days=5").status_code == 422
    assert admin_client.get(f"{base}?window_hours=0").status_code == 422
    assert admin_client.get(f"{base}?pressure_drop_6h_threshold=-50").status_code == 422
    assert admin_client.get(f"{base}?low_humidity_threshold=90").status_code == 422


def test_threshold_override_applies(admin_client, db_session, patient, account):
    _seed_pressure_pattern(db_session, days=30)  # drops are -6.0
    _plant_spo2_alarms(db_session, patient, account,
                       [_now_hour() - timedelta(days=i + 1) for i in range(6)])
    # Threshold -10: nothing qualifies as exposed -> insufficient exposed hours
    resp = admin_client.get(
        f"/api/analysis/patients/{patient.id}/env-correlations"
        f"?days=30&pressure_drop_6h_threshold=-10")
    card = _get_card(resp.json(), "pressure_drop_6h", "spo2_alarms")
    assert card["status"] == "insufficient_data"
    assert card["exposure"]["threshold"] == -10.0


# ---------------------------------------------------------------------------
# Clinical events endpoint
# ---------------------------------------------------------------------------

def test_clinical_events_streams(admin_client, db_session, patient, account):
    now = _now_hour()
    _plant_spo2_alarms(db_session, patient, account,
                       [now - timedelta(days=2), now - timedelta(days=4)])
    task = _make_respiratory_task(db_session, account, name="Cough Assist",
                                  category="treatments-test")
    _log_task(db_session, patient, task, now - timedelta(days=1))
    _log_task(db_session, patient, task, now - timedelta(days=3), voided=True)

    start = (now - timedelta(days=7)).isoformat()
    end = now.isoformat()
    resp = admin_client.get(
        f"/api/analysis/patients/{patient.id}/clinical-events",
        params={"from": start, "to": end})
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["events"]) == {"spo2_alarms", "oxygen_use",
                                   "respiratory_care", "symptoms"}
    assert len(body["events"]["spo2_alarms"]) == 2
    assert len(body["events"]["respiratory_care"]) == 1  # voided excluded
    assert body["events"]["respiratory_care"][0]["label"] == "Cough Assist"
    assert body["labels"]["spo2_alarms"] == "SpO2 alarms"


def test_clinical_events_range_validation(admin_client, patient):
    now = _now_hour()
    url = f"/api/analysis/patients/{patient.id}/clinical-events"
    # from >= to
    resp = admin_client.get(url, params={
        "from": now.isoformat(), "to": (now - timedelta(days=1)).isoformat()})
    assert resp.status_code == 422
    # > 366 days
    resp = admin_client.get(url, params={
        "from": (now - timedelta(days=400)).isoformat(), "to": now.isoformat()})
    assert resp.status_code == 422


def test_env_correlation_requires_auth(client, patient):
    assert client.get(
        f"/api/analysis/patients/{patient.id}/env-correlations").status_code == 401
    assert client.get(
        f"/api/analysis/patients/{patient.id}/clinical-events",
        params={"from": "2026-01-01T00:00:00", "to": "2026-01-02T00:00:00"},
    ).status_code == 401
