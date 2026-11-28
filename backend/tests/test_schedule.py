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


def test_scoped_schedule_reads_only_permitted_categories(limited_client, limited_user, account, patient, db_session, monkeypatch):
    from crud.users import create_role, get_permission_by_name
    from routes import schedule
    from routes.auth import create_access_token
    from schemas.nutrition_schedule import NutritionSchedule
    from schemas.patient import AccessLevel, PatientAccess

    path = '/api/schedule/daily'
    permission = get_permission_by_name(db_session, 'nutrition.read')
    limited_user.roles.append(create_role(db_session, 'test_nutrition', 'Nutrition', permission_ids=[permission.id]))
    db_session.commit()
    assert limited_client.get(path, params={'patient_id': patient.id}).status_code == 404  # A role alone grants no access to this patient.

    grant = PatientAccess(patient_id=patient.id, user_id=limited_user.id, access_level=AccessLevel.VIEWER,
                          granted_at=datetime(2020, 1, 1), is_active=True)
    meal = NutritionSchedule(patient_id=patient.id, name='Lunch', schedule_type='meal', cron_expression='0 12 * * *')
    db_session.add_all([grant, meal])
    db_session.commit()

    def unexpected(*args, **kwargs):
        pytest.fail('Read data from an excluded schedule category')

    monkeypatch.setattr(schedule, 'get_scheduled_medications', unexpected)
    monkeypatch.setattr('crud.reminder_timeline.find_grace_period_doses', unexpected)
    monkeypatch.setattr(schedule, 'get_scheduled_care_tasks', unexpected)

    params = {'patient_id': patient.id, 'include_prior_day': 'true'}
    combined = limited_client.get(path, params=params)
    combined.raise_for_status()
    body = combined.json()
    assert body['medications'] == body['care_tasks'] == []
    assert [(row['name'], row['is_yesterday']) for row in body['nutrition']] == [('Lunch', True), ('Lunch', False)]
    assert all(row['can_remind_later'] is False for row in body['nutrition'])
    assert limited_client.get(path, params={**params, 'category': 'nutrition'}).json() == body
    assert limited_client.get(path, params={**params, 'category': 'care_tasks'}).status_code == 403
    assert limited_client.get(path, params={**params, 'category': 'unexpected'}).status_code == 422
    for legacy_route in ('/api/schedules/daily', '/api/care-tasks/day', '/api/care-task-schedules/daily'):
        assert limited_client.get(legacy_route, params={'patient_id': patient.id}).status_code == 403

    # The live board remains available when the selected caregiver has entered chart-only mode.
    token = create_access_token(user=limited_user, account=account, read_restricted=True)
    assert limited_client.get(path, params={**params, 'category': 'nutrition'},
                              headers={'Authorization': f'Bearer {token}'}).json() == body
    grant.expires_at = datetime(2021, 1, 1)
    db_session.commit()
    assert limited_client.get(path, params={**params, 'category': 'nutrition'}).status_code == 404


def test_schedule_rejects_other_accounts_profiles(admin_client, db_session):
    from crud.patients import create_patient
    from models.users import Account

    other_account = Account(name='Other family', slug='other-schedule-family', password_hash='unused')
    db_session.add(other_account)
    db_session.flush()
    patient = create_patient(db_session, {'account_id': other_account.id, 'first_name': 'Other', 'last_name': 'Patient'})
    for path in ('/api/schedule/daily', '/api/schedules/daily', '/api/care-tasks/day', '/api/care-task-schedules/daily'):
        response = admin_client.get(path, params={'patient_id': patient.id})
        assert response.status_code == 404, (path, response.text)


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


@pytest.mark.parametrize("writer", ["daily-schedule", "administer"])
def test_backdated_medication_credits_only_its_selected_occurrence(
    admin_client, patient, db_session, monkeypatch, writer,
):
    from sqlalchemy import text
    from crud import medications
    from routes import schedule
    from schemas.medication_log import MedicationLog
    from utils import datetime_utils

    # It's 00:31 in New York. Yesterday's 15:00 dose was given at 19:59,
    # near a different firing of the very same schedule.
    recorded = datetime.fromisoformat("2020-11-27T00:31:00-05:00").astimezone(timezone.utc)
    due = datetime.fromisoformat("2020-11-26T15:00:00-05:00")
    given = datetime.fromisoformat("2020-11-26T19:59:00-05:00")
    monkeypatch.setattr(datetime_utils, "utc_now", lambda: recorded)
    monkeypatch.setattr(medications, "utc_now", lambda: recorded)
    monkeypatch.setattr(schedule, "utc_now", lambda: recorded)
    db_session.execute(text("SET LOCAL TIME ZONE 'America/New_York'"))
    med_id = _make_med(admin_client, patient, start_date="2020-01-01")
    added = admin_client.post(f"/api/add/schedule/{med_id}", json={
        "cron_expression": "0 0,3,20 * * *", "description": "Afternoon and evening",
        "dose_amount": 1, "patient_id": patient.id,
    })
    assert added.status_code == 200, added.text
    schedule_id = added.json()["id"]

    payload = {"patient_id": patient.id, "schedule_id": schedule_id,
               "scheduled_time": due.isoformat(), "dose_amount": 1.5, "early_override": True}
    if writer == "daily-schedule":
        response = admin_client.post("/api/schedule/complete/medication", json={
            **payload, "completed_at": given.isoformat(),
        })
    else:
        response = admin_client.post(f"/api/medications/{med_id}/administer", json={
            **payload, "administered_at": given.isoformat(),
        })
    assert response.status_code == 200 and response.json()["success"], response.text
    log = db_session.query(MedicationLog).filter_by(schedule_id=schedule_id).one()

    # An ad-hoc dose at 19:00 doesn't fulfill the 19:00 scheduled dose.
    adjacent = due + timedelta(hours=4)
    prn = admin_client.post(f"/api/medications/{med_id}/administer", json={
        "patient_id": patient.id, "dose_amount": 0.5, "administered_at": adjacent.isoformat(),
    })
    assert prn.status_code == 200 and prn.json()["success"], prn.text
    skip_time = due + timedelta(hours=7)
    skip = admin_client.post("/api/schedule/complete/medication", json={
        **payload, "scheduled_time": skip_time.isoformat(), "completed_at": skip_time.isoformat(),
        "dose_amount": 0,
    })
    assert skip.status_code == 200 and skip.json()["success"], skip.text

    daily_url = f"/api/schedule/daily?patient_id={patient.id}&target_date=2020-11-26"
    board_url = f"/api/schedules/daily?patient_id={patient.id}"
    daily = admin_client.get(daily_url).json()["medications"]
    board = admin_client.get(board_url).json()["scheduled_medications"]
    expected = {due: log.id, adjacent: None, skip_time: skip.json()["log_id"]}
    assert {datetime.fromisoformat(row["scheduled_time"]): row["log_id"]
            for row in daily if row["schedule_id"] == schedule_id} == expected
    # The board spans yesterday and today. Only the two explicitly selected
    # occurrences should be closed across all six firings.
    assert len(board) == 6
    completed = {datetime.fromisoformat(row["scheduled_time"]): row for row in board if row["is_completed"]}
    assert {dt: row["log_id"] for dt, row in completed.items()} == {due: log.id, skip_time: skip.json()["log_id"]}
    assert completed[due]["actual_dose"] == 1.5
    assert completed[due]["status"] == "completed_late"
    assert datetime.fromisoformat(completed[due]["administered_at"]) == given
    assert completed[skip_time]["status"] == "skipped"
    assert log.created_at == recorded

    undo = admin_client.delete(f"/api/schedule/log/medication/{log.id}")
    assert undo.status_code == 200, undo.text
    remaining = admin_client.get(board_url).json()["scheduled_medications"]
    assert [row["log_id"] for row in remaining if row["is_completed"]] == [skip.json()["log_id"]]


def test_legacy_medication_board_local_times_require_an_unambiguous_firing(
    admin_client, patient, db_session, monkeypatch,
):
    from sqlalchemy import text
    from schemas.medication_log import MedicationLog
    from schemas.medication_schedule import MedicationSchedule
    from utils import datetime_utils

    db_session.execute(text("SET LOCAL TIME ZONE 'America/New_York'"))
    due = datetime.fromisoformat("2020-11-26T01:00:00-05:00")
    wall = due.replace(tzinfo=None)  # Old board saved 01:00 instead of 06:00 UTC.
    entered = due + timedelta(hours=4)
    monkeypatch.setattr(datetime_utils, "utc_now", lambda: due + timedelta(days=1))
    med_id = _make_med(admin_client, patient, start_date="2020-01-01")
    expected = {}
    for case in ("taken", "skipped", "ambiguous", "edited"):
        # 05:00 and 06:00 UTC both fit an administration flagged late at 10:00 UTC.
        cron = "0 5,6 * * *" if case == "ambiguous" else "0 6 * * *"
        published = due - timedelta(days=2)
        schedule = MedicationSchedule(medication_id=med_id, patient_id=patient.id, dose_amount=1,
                                      cron_expression=cron, active=True, created_at=published,
                                      updated_at=entered + timedelta(minutes=1) if case == "edited" else published)
        db_session.add(schedule)
        db_session.flush()
        skipped = case == "skipped"
        log = MedicationLog(medication_id=med_id, patient_id=patient.id, schedule_id=schedule.id,
                            scheduled_time=wall, is_scheduled=True, created_at=entered,
                            dose_amount=0 if skipped else 1, notes="Skipped" if skipped else "",
                            administered_at=due if skipped else entered, administered_late=not skipped)
        db_session.add(log)
        db_session.flush()
        if case in ("taken", "skipped"):
            expected[(schedule.id, due)] = (log.id, skipped)
    db_session.commit()

    daily = admin_client.get(f"/api/schedule/daily?patient_id={patient.id}&target_date=2020-11-26")
    board = admin_client.get(f"/api/schedules/daily?patient_id={patient.id}")
    for rows, flag, count in ((daily.json()["medications"], "completed", 5),
                              (board.json()["scheduled_medications"], "is_completed", 10)):
        assert len(rows) == count
        assert {(row["schedule_id"], datetime.fromisoformat(row["scheduled_time"])):
                (row["log_id"], row["actual_dose"] == 0 if flag == "is_completed" else row["skipped"])
                for row in rows if row[flag]} == expected
    # Reading either endpoint leaves the original audit records intact.
    db_session.expire_all()
    assert {log.scheduled_time for log in db_session.query(MedicationLog).filter_by(medication_id=med_id)} == {wall}


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

    for category in ('medications', 'care_tasks'):
        response = admin_client.get('/api/schedule/daily', params={
            'patient_id': patient.id, 'category': category, 'target_date': without['date'],
        })
        response.raise_for_status()
        scoped = response.json()
        assert scoped[category] == without[category]
        assert all(scoped[key] == [] for key in ('medications', 'care_tasks', 'nutrition') if key != category)


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


def test_live_care_task_completion_credits_only_selected_patient_and_occurrence(
    db_session, admin_client, patient, account, monkeypatch,
):
    from zoneinfo import ZoneInfo
    from sqlalchemy import text
    from crud import scheduling
    from crud.patients import create_patient
    from crud.schedule_status import get_schedule_status
    from schemas.care_task import CareTask
    from schemas.care_task_log import CareTaskLog
    from schemas.care_task_schedule import CareTaskSchedule
    from utils.datetime_utils import local_day_bounds

    other = create_patient(db_session, {'first_name': 'Other', 'last_name': 'Patient', 'account_id': account.id})
    at = datetime(2026, 11, 25, 14, 46, tzinfo=timezone.utc)  # 09:46 in New York
    local_tz = ZoneInfo('America/New_York')
    monkeypatch.setattr(scheduling, 'utc_now', lambda: at)
    monkeypatch.setattr(scheduling, 'local_day_bounds', lambda tz: local_day_bounds(tz, at))
    db_session.execute(text("SET LOCAL TIME ZONE 'America/New_York'"))

    task = CareTask(name='Respiratory care', account_id=account.id, active=True,
                    created_at=at, updated_at=at)
    db_session.add(task)
    db_session.flush()
    schedule = CareTaskSchedule(care_task_id=task.id, cron_expression='0 5,12,15 * * *',
                                active=True, created_at=at, updated_at=at)
    db_session.add(schedule)
    db_session.commit()
    # The catalog task and schedule are shared; the first active patient differs
    # from the patient whose occurrence the caregiver selected.
    path = f'/api/care-task-schedules/{schedule.id}'
    response = admin_client.post(f'{path}/complete', json={
        'patient_id': other.id, 'scheduled_time': '2026-11-25T07:00:00-05:00',
        'early_override': True, 'notes': 'Completed via live dashboard',
    })
    assert response.status_code == 200, response.text
    log = db_session.get(CareTaskLog, response.json()['id'])
    assert log.scheduled_time == datetime(2026, 11, 25, 12)
    assert log.completed_at == at and log.completed_late and log.patient_id == other.id

    def completed_rows(patient_id):
        day = admin_client.get(f'/api/schedule/daily?patient_id={patient_id}&target_date=2026-11-25').json()
        return [row for row in day['care_tasks'] if row['schedule_id'] == schedule.id and row['completed']]

    assert [row['log_id'] for row in completed_rows(other.id)] == [log.id]
    assert completed_rows(patient.id) == []
    # The HA reminder must also retire exactly this patient's 7 AM entry.
    def late_times(patient_id):
        snapshot = get_schedule_status(db_session, patient_id, now=at, sections=['care_task_counts'])
        return {item['due_at'] for item in snapshot['late']}

    morning_slot = '2026-11-25T12:00:00+00:00'
    assert late_times(patient.id) - late_times(other.id) == {morning_slot}
    assert morning_slot not in late_times(other.id)
    # Other reads (day board and overdue badges) must agree with the combined schedule.
    board = scheduling.get_daily_care_task_schedule(db_session, patient_id=other.id, tz=local_tz)
    credited = [item for item in board['scheduled_care_tasks'] if item['is_completed']]
    assert [item['scheduled_time'] for item in credited] == [datetime(2026, 11, 25, 12, tzinfo=timezone.utc)]
    assert not any(item['is_completed'] for item in scheduling.get_daily_care_task_schedule(
        db_session, patient_id=patient.id, tz=local_tz)['scheduled_care_tasks'])

    # A separate PRN completion does not clear an open firing of the same task.
    assert admin_client.post(f'/api/care-tasks/{task.id}/complete', json={
        'patient_id': other.id, 'completed_at': at.isoformat(),
    }).status_code == 200
    assert len(completed_rows(other.id)) == 1
    # Backdated PRNs immediately either side of local midnight stay on their
    # own calendar days even though both happened on the same UTC date.
    for when in ('2026-11-24T23:59:00-05:00', '2026-11-25T00:00:00-05:00'):
        assert admin_client.post(f'/api/care-tasks/{task.id}/complete', json={
            'patient_id': other.id, 'completed_at': when,
        }).status_code == 200
    board = scheduling.get_daily_care_task_schedule(db_session, patient_id=other.id, tz=local_tz)
    prns = [row for row in board['scheduled_care_tasks'] if row.get('is_prn')]
    assert [row['is_yesterday'] for row in prns] == [True, False, False]
    assert len(completed_rows(other.id)) == 1
    skipped = admin_client.post(f'{path}/skip', json={
        'patient_id': other.id, 'scheduled_time': '2026-11-25T00:00:00-05:00',
    })
    assert skipped.status_code == 200, skipped.text
    assert [row['status'] for row in completed_rows(other.id)] == ['skipped', 'completed']
    assert completed_rows(patient.id) == []

    # Older clients omit patient_id for a schedule bound to one patient.
    schedule.patient_id = other.id
    db_session.commit()
    assert admin_client.post(f'{path}/skip', json={
        'patient_id': patient.id, 'scheduled_time': '2026-11-25T10:00:00-05:00',
    }).status_code == 404
    old_client = admin_client.post(f'{path}/skip', json={'scheduled_time': '2026-11-25T10:00:00-05:00'})
    assert old_client.status_code == 200, old_client.text
    assert db_session.get(CareTaskLog, old_client.json()['id']).patient_id == other.id


@pytest.fixture
def recording_schedules(db_session, patient):
    from schemas.care_task import CareTask
    from schemas.care_task_schedule import CareTaskSchedule
    from schemas.medication import Medication
    from schemas.medication_schedule import MedicationSchedule
    from schemas.nutrition_schedule import NutritionSchedule

    at = datetime.now(timezone.utc)
    stamps = dict(created_at=at, updated_at=at)
    scope = dict(patient_id=patient.id, account_id=patient.account_id)
    med = Medication(name="Test medication", quantity=10, quantity_unit="tablet", **scope, **stamps)
    task = CareTask(name="Test task", **scope, **stamps)
    schedule = dict(patient_id=patient.id, cron_expression="0 12 * * *", **stamps)
    records = {
        "medication": MedicationSchedule(medication=med, dose_amount=1, **schedule),
        "care-task": CareTaskSchedule(care_task=task, **schedule),
        "nutrition": NutritionSchedule(name="Test meal", schedule_type="meal", **schedule),
    }
    db_session.add_all(records.values())
    db_session.commit()
    return records


def _recording_grant(db, user, patient, permission, level):
    from crud.users import create_role, get_permission_by_name
    from schemas.patient import PatientAccess

    role = create_role(db, 'test_record', 'Test recording', permission_ids=[get_permission_by_name(db, permission).id])
    user.roles.append(role)
    grant = PatientAccess(patient_id=patient.id, user_id=user.id, access_level=level,
                          granted_at=datetime(2020, 1, 1), is_active=True)
    db.add(grant)
    db.commit()
    return grant


@pytest.mark.parametrize("kind,permission,collection,log_type,id_key", [
    ("medication", "medications.administer", "medications", "medication", "log_id"),
    ("medication", "medications.update", "medications", "medication", "log_id"),
    ("nutrition", "nutrition.create", "nutrition", "nutrition_intake", "intake_id"),
    ("nutrition", "nutrition.update", "nutrition", "nutrition_intake", "intake_id"),
    ("care-task", "care_tasks.perform", "care_tasks", "care_task", "log_id"),
])
def test_recording_requires_writable_profile_and_category(
    limited_client, limited_user, patient, db_session, recording_schedules, kind, permission, collection, log_type, id_key,
):
    from schemas.patient import AccessLevel

    item = dict(patient_id=patient.id, schedule_id=recording_schedules[kind].id,
                scheduled_time=datetime.now(timezone.utc).isoformat())
    complete = f"/api/schedule/complete/{kind}"
    bulk = "/api/schedule/complete/bulk"
    assert limited_client.post(complete, json=item).status_code == 403
    grant = _recording_grant(db_session, limited_user, patient, permission, AccessLevel.VIEWER)
    grant.is_active = False
    db_session.commit()
    assert limited_client.post(complete, json=item).status_code == 404
    grant.is_active = True
    db_session.commit()
    assert limited_client.post(complete, json=item).status_code == 403
    assert limited_client.post(bulk, json={collection: [item]}).status_code == 403

    grant.access_level = AccessLevel.CAREGIVER
    db_session.commit()
    # A category-specific recording role can chart and undo that category alone.
    other = "medication" if kind == "nutrition" else "nutrition"
    other_item = {**item, "schedule_id": recording_schedules[other].id}
    assert limited_client.post(f"/api/schedule/complete/{other}", json=other_item).status_code == 403
    response = limited_client.post(complete, json=item)
    assert response.status_code == 200, response.text
    assert response.json()["success"], response.text
    undo = f"/api/schedule/log/{log_type}/{response.json()[id_key]}"
    grant.access_level = AccessLevel.VIEWER
    db_session.commit()
    assert limited_client.delete(undo).status_code == 403
    grant.access_level = AccessLevel.CAREGIVER
    db_session.commit()
    assert limited_client.delete(undo).json() == {"success": True}


def test_bulk_recording_preflights_all_profiles_and_categories(
    patient, db_session, recording_schedules, limited_client, limited_user,
):
    from crud.patients import create_patient
    from schemas.medication_log import MedicationLog
    from schemas.patient import AccessLevel

    _recording_grant(db_session, limited_user, patient, "medications.update", AccessLevel.CAREGIVER)
    other = create_patient(db_session, dict(first_name="Other", last_name="Profile", account_id=patient.account_id))
    med = recording_schedules["medication"]
    item = dict(patient_id=patient.id, schedule_id=med.id, scheduled_time=datetime.now(timezone.utc).isoformat())
    meal = {**item, "schedule_id": recording_schedules["nutrition"].id}
    path = "/api/schedule/complete/bulk"
    assert limited_client.post(path, json={"medications": [item], "nutrition": [meal]}).status_code == 403
    assert limited_client.post(path, json={"medications": [item, {**item, "patient_id": other.id}]}).status_code == 404

    med.patient_id = other.id
    db_session.commit()
    assert limited_client.post(path, json={"medications": [item]}).status_code == 404
    med.patient_id = None
    med.medication.patient_id = other.id
    db_session.commit()
    assert limited_client.post("/api/schedule/complete/medication", json=item).status_code == 404
    assert db_session.query(MedicationLog).count() == 0
    assert med.medication.quantity == 10

    med.medication.patient_id = None  # A shared catalog entry in this account still works.
    db_session.commit()
    assert limited_client.post(path, json={"medications": [item]}).json()["medications"][0]["success"]
    assert db_session.query(MedicationLog).one().patient_id == patient.id


def test_nutrition_mixed_undo_preflights_every_member(limited_client, limited_user, db_session, patient):
    from crud.patients import create_patient
    from schemas.nutrition_output import NutritionOutput
    from schemas.patient import AccessLevel

    _recording_grant(db_session, limited_user, patient, "nutrition.create", AccessLevel.CAREGIVER)
    other = create_patient(db_session, dict(first_name="Other", last_name="Profile", account_id=patient.account_id))
    outputs = [NutritionOutput(patient_id=pid, output_type="urine", occurred_at=datetime.now(timezone.utc))
               for pid in (patient.id, other.id, patient.id)]
    db_session.add_all(outputs)
    db_session.commit()
    first, foreign, second = (row.id for row in outputs)
    path = "/api/schedule/log/nutrition_output/"
    for key in (str(foreign), f"mixed-{first}-{foreign}", f"mixed-{first}-99999999"):
        assert limited_client.delete(path + key).status_code == 404
    assert db_session.query(NutritionOutput).count() == 3
    assert limited_client.delete(path + f"mixed-{first}-{second}").json() == {"success": True}
    assert db_session.query(NutritionOutput).one().id == foreign


def test_nutrition_completion_scopes_schedule_and_saved_items(patient, db_session, recording_schedules, admin_client):
    from crud.patients import create_patient
    from schemas.nutrition_intake import NutritionIntake
    from schemas.nutrition_item import NutritionItem

    other = create_patient(db_session, dict(first_name="Other", last_name="Profile", account_id=patient.account_id))
    saved = NutritionItem(patient_id=other.id, account_id=patient.account_id, item_type="food", name="Test food")
    db_session.add(saved)
    db_session.commit()
    schedule = recording_schedules["nutrition"]
    source = {"schedule_id": schedule.id, "patient_id": patient.id, "scheduled_time": datetime.now(timezone.utc).isoformat()}
    part = {"item_id": saved.id, "item_name": "Test food", "item_type": "food", "amount": 1, "amount_unit": "serving"}
    for payload in ({**source, "patient_id": other.id}, {**source, "items": [part]}):
        assert admin_client.post("/api/schedule/complete/nutrition", json=payload).status_code == 404
        assert admin_client.post("/api/schedule/complete/bulk", json={"nutrition": [payload]}).status_code == 404
    assert db_session.query(NutritionIntake).count() == 0
