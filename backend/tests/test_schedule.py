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
"""Wave 2 — schedule: daily contract, off-window guard (409 + override), and
the undo path (soft-delete + on-hand quantity restore)."""
from datetime import date, datetime, timedelta, timezone

import pytest


def _make_med(admin_client, patient, quantity=10, start_date="2026-06-01"):
    return admin_client.post("/api/add/medication", json={
        "name": "Ibuprofen", "concentration": "200mg", "quantity": quantity,
        "quantity_unit": "tablets", "instructions": "as directed",
        "start_date": start_date, "is_patient_specific": True,
        "admin_patient_id": patient.id,
    }).json()["id"]


def test_daily_schedule_contract(admin_client, patient):
    resp = admin_client.get(
        f"/api/schedule/daily?patient_id={patient.id}"
        f"&target_date={date.today().isoformat()}&tz_offset_minutes=0"
    )
    assert resp.status_code == 200
    assert "medications" in resp.json()


@pytest.mark.parametrize("database_tz,completion_mode", [
    ("UTC", "single"),
    ("America/New_York", "single"),
    ("America/New_York", "bulk"),
    ("America/New_York", "legacy"),
])
@pytest.mark.parametrize("item_type,collection,log_type", [
    ("medication", "medications", "medication"),
    ("care-task", "care_tasks", "care_task"),
])
def test_schedule_completion_matches_local_midnight_across_database_timezones(
    admin_client, patient, db_session, database_tz, completion_mode, item_type, collection, log_type,
):
    """A 00:30 Eastern occurrence survives completion/refetch/undo when
    PostgreSQL runs outside UTC. Medication/care scheduled_time columns are
    legacy naive UTC; both new writes and existing records must retain that
    representation instead of being shifted by the database timezone."""
    from sqlalchemy import text
    from schemas.medication_log import MedicationLog
    from schemas.care_task_log import CareTaskLog

    scheduled = datetime(2020, 1, 15, 5, 30, tzinfo=timezone.utc)
    completed = scheduled + timedelta(minutes=15)
    cron = "30 5 * * *"
    if item_type == "medication":
        item_id = _make_med(admin_client, patient, start_date="2020-01-01")
        response = admin_client.post(f"/api/add/schedule/{item_id}", json={
            "cron_expression": cron, "description": "After midnight",
            "dose_amount": 1, "patient_id": patient.id,
        })
    else:
        category_id = admin_client.post("/api/add/care-task-category", json={
            "name": "Respiratory",
        }).json()["id"]
        item_id = admin_client.post("/api/add/care-task", json={
            "name": "Trach care", "category_id": category_id,
            "patient_id": patient.id, "active": True,
        }).json()["id"]
        response = admin_client.post(f"/api/add/care-task-schedule/{item_id}", json={
            "cron_expression": cron, "patient_id": patient.id,
        })
    assert response.status_code == 200, response.text
    schedule_id = response.json()["id"]

    log_model = MedicationLog if item_type == "medication" else CareTaskLog
    if completion_mode == "legacy":
        # Seed the representation already in the database before switching
        # the session timezone; this must remain readable without a migration.
        db_session.execute(text("SELECT set_config('TimeZone', 'UTC', true)"))
        values = {
            "patient_id": patient.id, "schedule_id": schedule_id,
            "scheduled_time": scheduled.replace(tzinfo=None),
            "is_scheduled": True, "created_at": completed,
        }
        if item_type == "medication":
            values.update(medication_id=item_id, administered_at=completed, dose_amount=1)
        else:
            values.update(care_task_id=item_id, completed_at=completed, status="completed")
        db_session.add(log_model(**values))
        db_session.commit()

    db_session.execute(text("SELECT set_config('TimeZone', :tz, true)"), {"tz": database_tz})

    payload = {
        "schedule_id": schedule_id, "patient_id": patient.id,
        "scheduled_time": scheduled.isoformat(), "completed_at": completed.isoformat(),
    }
    if completion_mode != "legacy":
        if completion_mode == "bulk":
            response = admin_client.post("/api/schedule/complete/bulk", json={collection: [payload]})
        else:
            response = admin_client.post(f"/api/schedule/complete/{item_type}", json=payload)
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["success"] is True, result
        if completion_mode == "bulk":
            assert result[collection][0]["success"] is True, result

    # Verify storage as well as the board: passing an aware value into the
    # legacy column silently writes local clock time in a non-UTC session.
    db_session.expire_all()
    log = db_session.query(log_model).filter(log_model.schedule_id == schedule_id).one()
    assert log.scheduled_time == scheduled.replace(tzinfo=None)
    log_id = log.id

    day_url = f"/api/schedule/daily?patient_id={patient.id}&target_date=2020-01-15"
    rows = admin_client.get(day_url).json()[collection]
    matches = [row for row in rows if row["schedule_id"] == schedule_id]
    assert len(matches) == 1
    assert matches[0]["completed"] is True
    assert matches[0]["log_id"] == log_id
    assert datetime.fromisoformat(matches[0]["completed_at"]) == completed

    undo = admin_client.delete(f"/api/schedule/log/{log_type}/{log_id}")
    assert undo.status_code == 200, undo.text
    after_undo = admin_client.get(day_url).json()[collection]
    assert [row["completed"] for row in after_undo if row["schedule_id"] == schedule_id] == [False]


def test_off_window_administration_blocked_then_overridden(admin_client, patient):
    med_id = _make_med(admin_client, patient, quantity=10)
    future = (datetime.utcnow() + timedelta(hours=3)).isoformat()

    early = admin_client.post(f"/api/medications/{med_id}/administer", json={
        "dose_amount": 2, "patient_id": patient.id,
        "scheduled_time": future, "early_override": False,
    })
    assert early.status_code == 409

    ok = admin_client.post(f"/api/medications/{med_id}/administer", json={
        "dose_amount": 2, "patient_id": patient.id,
        "scheduled_time": future, "early_override": True,
    })
    assert ok.status_code == 200


def test_daily_schedule_include_prior_day_meds_and_tasks(admin_client, patient):
    """include_prior_day must add yesterday's medications and care tasks
    (marked is_yesterday), not just nutrition; without the flag the response
    stays single-day (the admin schedule grid relies on that)."""
    med_id = _make_med(admin_client, patient)
    assert admin_client.post(f"/api/add/schedule/{med_id}", json={
        "cron_expression": "0 12 * * *", "description": "daily noon",
        "dose_amount": 1, "patient_id": patient.id,
    }).status_code == 200

    category_id = admin_client.post("/api/add/care-task-category", json={
        "name": "Respiratory",
    }).json()["id"]
    task_id = admin_client.post("/api/add/care-task", json={
        "name": "Trach care", "category_id": category_id,
        "patient_id": patient.id, "active": True,
    }).json()["id"]
    assert admin_client.post(f"/api/add/care-task-schedule/{task_id}", json={
        "cron_expression": "0 12 * * *", "patient_id": patient.id,
    }).status_code == 200

    with_prior = admin_client.get(
        f"/api/schedule/daily?patient_id={patient.id}&include_prior_day=true"
    ).json()
    assert sorted(m["is_yesterday"] for m in with_prior["medications"]) == [False, True]
    assert sorted(t["is_yesterday"] for t in with_prior["care_tasks"]) == [False, True]

    without = admin_client.get(f"/api/schedule/daily?patient_id={patient.id}").json()
    assert [m["is_yesterday"] for m in without["medications"]] == [False]
    assert [t["is_yesterday"] for t in without["care_tasks"]] == [False]


def test_daily_schedule_prior_day_no_duplicate_prn(admin_client, patient, db_session):
    """A PRN dose given yesterday must appear exactly once (in the prior-day
    window) when include_prior_day=true — the two day windows are disjoint."""
    from schemas.medication_log import MedicationLog
    from utils.datetime_utils import resolve_tz_for_patient, local_day_bounds

    med_id = _make_med(admin_client, patient)

    tz = resolve_tz_for_patient(db_session, patient.id)
    bounds = local_day_bounds(tz)
    prn_time = bounds["yesterday_start_utc"] + timedelta(hours=12)
    log = MedicationLog(
        medication_id=med_id, patient_id=patient.id, schedule_id=None,
        administered_at=prn_time, dose_amount=1, is_scheduled=False,
        created_at=prn_time,
    )
    db_session.add(log)
    db_session.commit()

    data = admin_client.get(
        f"/api/schedule/daily?patient_id={patient.id}&include_prior_day=true"
    ).json()
    prn_rows = [m for m in data["medications"] if m.get("log_id") == log.id]
    assert len(prn_rows) == 1
    assert prn_rows[0]["is_yesterday"] is True
    assert prn_rows[0]["is_prn"] is True


def test_undo_restores_quantity_and_soft_deletes_log(admin_client, patient, db_session):
    from schemas.medication import Medication
    from schemas.medication_log import MedicationLog

    med_id = _make_med(admin_client, patient, quantity=10)
    assert admin_client.post(f"/api/medications/{med_id}/administer",
                             json={"dose_amount": 2, "patient_id": patient.id}).status_code == 200

    db_session.expire_all()
    assert db_session.query(Medication).get(med_id).quantity == 8  # 10 - 2

    log = (db_session.query(MedicationLog)
           .filter(MedicationLog.medication_id == med_id)
           .order_by(MedicationLog.id.desc()).first())
    assert log is not None

    undo = admin_client.delete(f"/api/schedule/log/medication/{log.id}")
    assert undo.status_code == 200

    db_session.expire_all()
    # Quantity restored…
    assert db_session.query(Medication).get(med_id).quantity == 10
    # …and the log is excluded from reads by the global soft-delete filter.
    assert db_session.query(MedicationLog).filter(MedicationLog.id == log.id).first() is None
