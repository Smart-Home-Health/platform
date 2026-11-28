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
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text

from crud import schedule_reminders
from schemas.care_task import CareTask
from schemas.care_task_schedule import CareTaskSchedule
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.nutrition_item import NutritionItem
from schemas.nutrition_schedule import NutritionSchedule, NutritionScheduleComponent
from schemas.schedule_reminder import ScheduleReminder

SLOT = datetime(2026, 11, 27, 15, tzinfo=timezone.utc)
NOW = SLOT + timedelta(minutes=2)


@pytest.fixture
def clock(monkeypatch):
    monkeypatch.setattr(schedule_reminders, 'utc_now', lambda: NOW)


def fixture_schedules(db, patient, category, *, hours=(15, 18), minutes=300):
    stamps = dict(created_at=SLOT - timedelta(days=7), updated_at=SLOT - timedelta(days=7))
    scope = dict(account_id=patient.account_id, patient_id=patient.id)
    if category == 'medications':
        parent = Medication(name='Test medication', quantity=20, quantity_unit='tablet', **scope, **stamps)
        model, fields = MedicationSchedule, dict(medication=parent, dose_amount=1)
    elif category == 'care_tasks':
        model, fields = CareTaskSchedule, dict(care_task=CareTask(name='Test task', **scope, **stamps))
    else:
        model, fields = NutritionSchedule, dict(name='Test feed', schedule_type='meal')
    records = [model(patient_id=patient.id, cron_expression=f'0 {hour} * * *', reminder_window_minutes=minutes,
                     **fields, **stamps) for hour in hours]
    db.add_all(records)
    db.commit()
    return records


def identity(patient, schedule):
    return dict(patient_id=patient.id, schedule_id=schedule.id, scheduled_time=SLOT.isoformat())


def put(client, category, key, when, **kwargs):
    return client.put(f'/api/schedule/reminders/{category}', json={**key, 'remind_at': when.isoformat(), **kwargs})


@pytest.mark.parametrize('category,complete,log,id_field', [
    ('medications', 'medication', 'medication', 'log_id'),
    ('nutrition', 'nutrition', 'nutrition_intake', 'intake_id'),
    ('care_tasks', 'care-task', 'care_task', 'log_id'),
])
def test_occurrence_overlap_deadline_and_charting(db_session, admin_client, patient, clock, category, complete, log, id_field):
    first, second = fixture_schedules(db_session, patient, category)
    if category == 'nutrition':
        # Two differently named routines use the same library formula.
        food = NutritionItem(patient_id=patient.id, account_id=patient.account_id, item_type='tube_feed', name='Formula')
        for index, record in enumerate((first, second)):
            record.name = f'Feed {index}'
            record.components.append(NutritionScheduleComponent(item=food, amount=100, amount_unit='ml'))
        db_session.commit()
    key = identity(patient, first)
    next_at = SLOT + timedelta(hours=3)
    deadline = SLOT + timedelta(hours=5)
    assert put(admin_client, category, key, deadline + timedelta(seconds=1)).json()['detail']['code'] == 'after_deadline'
    blocked = put(admin_client, category, key, next_at)
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()['detail']['next_at'] == next_at.isoformat()
    # Revalidate the warning if another schedule was edited before acceptance.
    second.cron_expression = '0 17 * * *'
    db_session.commit()
    blocked = put(admin_client, category, key, deadline, confirm_next_at=next_at.isoformat())
    assert blocked.status_code == 409
    earlier = (SLOT + timedelta(hours=2)).isoformat()
    assert blocked.json()['detail']['next_at'] == earlier
    response = put(admin_client, category, key, deadline, confirm_next_at=earlier)
    assert response.status_code == 200, response.text
    row = db_session.query(ScheduleReminder).one()
    assert (row.original_due_at, row.deadline_at, row.remind_at) == (SLOT, deadline, deadline)

    # Changing the schedule's default cannot extend this occurrence's captured window.
    first.reminder_window_minutes = 600
    db_session.commit()
    assert put(admin_client, category, key, deadline + timedelta(minutes=1)).status_code == 422
    cancel = admin_client.request('DELETE', f'/api/schedule/reminders/{category}', json=key)
    assert cancel.status_code == 200 and row.remind_at is None and row.deadline_at == deadline
    assert put(admin_client, category, key, SLOT + timedelta(minutes=15)).status_code == 200

    done = admin_client.post(f'/api/schedule/complete/{complete}', json={**key, 'completed_at': SLOT.isoformat()})
    assert done.status_code == 200 and done.json()['success'], done.text
    db_session.expire_all()
    assert row.remind_at is None
    assert put(admin_client, category, key, SLOT + timedelta(minutes=30)).json()['detail']['code'] == 'occurrence_closed'
    assert admin_client.delete(f"/api/schedule/log/{log}/{done.json()[id_field]}").json()['success']
    db_session.expire_all()
    assert row.remind_at is None


def test_reminder_defaults_snapshot_and_reset(admin_client, db_session, patient):
    path = f'/api/schedule/reminder-defaults/{patient.id}'
    assert admin_client.get(path).json() == {'reminder_window_minutes': None, 'can_edit': True}
    old_med, = fixture_schedules(db_session, patient, 'medications', hours=(15,), minutes=None)
    old_task, = fixture_schedules(db_session, patient, 'care_tasks', hours=(15,), minutes=None)
    assert admin_client.put(path, json={'reminder_window_minutes': 180}).status_code == 200
    data = {'cron_expression': '0 17 * * *', 'patient_id': patient.id}
    med_id = admin_client.post(f'/api/add/schedule/{old_med.medication_id}',
                               json={**data, 'description': 'Test', 'dose_amount': 1}).json()['id']
    task_id = admin_client.post(f'/api/add/care-task-schedule/{old_task.care_task_id}', json=data).json()['id']
    meal = admin_client.post('/api/nutrition/schedules', json={**data, 'name': 'Lunch', 'schedule_type': 'meal'}).json()
    assert admin_client.put(path, json={'reminder_window_minutes': 240}).status_code == 200
    med = db_session.get(MedicationSchedule, med_id)
    task = db_session.get(CareTaskSchedule, task_id)
    assert med.reminder_window_minutes == task.reminder_window_minutes == meal['reminder_window_minutes'] == 180
    assert med.grace_period_hours == 3 and old_med.grace_period_hours is None and old_task.reminder_window_minutes is None
    assert admin_client.put(f'/api/schedules/{med_id}', json={'grace_period_hours': 2.5}).status_code == 200
    assert med.reminder_window_minutes is None and med.grace_period_hours == 2.5
    assert admin_client.put(f'/api/care-task-schedules/{task_id}', json={'reminder_window_minutes': None}).status_code == 200
    assert task.reminder_window_minutes is None
    meal = admin_client.put(f"/api/nutrition/schedules/{meal['id']}", json={'reminder_window_minutes': None}).json()
    assert meal['reminder_window_minutes'] is None
    assert admin_client.put(path, json={'reminder_window_minutes': None}).json()['reminder_window_minutes'] is None


def test_legacy_deadlines_cross_dst_and_configured_cadence():
    tz = ZoneInfo('America/New_York')
    due = datetime(2026, 10, 31, 4, tzinfo=timezone.utc)
    assert schedule_reminders.reminder_deadline({}, due, due, tz, 'care_tasks') == due + timedelta(hours=49)
    assert schedule_reminders.reminder_deadline({}, due, due + timedelta(days=1), tz, 'nutrition') == due + timedelta(hours=73)
    weekly = {'cron_expression': '0 4 * * 6', 'grace_period_hours': None}
    assert schedule_reminders.reminder_deadline(weekly, due, due, tz, 'medications') == due + timedelta(days=4.2)
    assert schedule_reminders.reminder_deadline({**weekly, 'grace_period_hours': 36}, due, due, tz, 'medications') == due + timedelta(hours=36)


def test_expired_and_unscheduled_rows_rejected_and_bulk_delete_cleans_up(admin_client, db_session, patient, monkeypatch, clock):
    task, = fixture_schedules(db_session, patient, 'care_tasks', hours=(15,), minutes=10)
    key = identity(patient, task)
    assert put(admin_client, 'care_tasks', {**key, 'scheduled_time': NOW.isoformat()}, SLOT + timedelta(minutes=6)).status_code == 404
    assert put(admin_client, 'care_tasks', key, SLOT + timedelta(minutes=10)).status_code == 200
    monkeypatch.setattr(schedule_reminders, 'utc_now', lambda: SLOT + timedelta(minutes=10))
    assert put(admin_client, 'care_tasks', key, SLOT + timedelta(minutes=10)).json()['detail']['code'] == 'occurrence_closed'
    db_session.execute(text('DELETE FROM care_task_schedule WHERE id=:id'), {'id': task.id})
    db_session.commit()
    assert db_session.query(ScheduleReminder).count() == 0


def test_reminder_actions_require_writable_grant_and_role(db_session, limited_client, limited_user, patient, clock):
    from crud.patients import create_patient
    from crud.users import create_role, get_permission_by_name
    from schemas.patient import AccessLevel, PatientAccess

    task, = fixture_schedules(db_session, patient, 'care_tasks', hours=(15,))
    other = create_patient(db_session, dict(account_id=patient.account_id, first_name='Second', last_name='Profile'))
    foreign, = fixture_schedules(db_session, other, 'care_tasks', hours=(15,))
    key = identity(patient, task)
    when = SLOT + timedelta(minutes=15)
    defaults = f'/api/schedule/reminder-defaults/{patient.id}'
    grant = PatientAccess(patient_id=patient.id, user_id=limited_user.id, access_level=AccessLevel.CAREGIVER,
                          granted_at=SLOT, is_active=True)
    db_session.add(grant)
    db_session.commit()
    assert limited_client.get(defaults).json()['can_edit'] is False
    assert limited_client.put(defaults, json={'reminder_window_minutes': 20}).status_code == 403
    assert limited_client.put(f'/api/care-task-schedules/{task.id}', json={'reminder_window_minutes': 20}).status_code == 403
    assert put(limited_client, 'care_tasks', key, when).status_code == 403
    permissions = [get_permission_by_name(db_session, name).id for name in ('care_tasks.perform', 'care_tasks.update')]
    limited_user.roles.append(create_role(db_session, 'test_remind', 'Test role', permission_ids=permissions))
    grant.access_level = AccessLevel.VIEWER
    db_session.commit()
    assert put(limited_client, 'care_tasks', key, when).status_code == 403
    grant.access_level = AccessLevel.CAREGIVER
    db_session.commit()
    assert put(limited_client, 'care_tasks', identity(other, foreign), when).status_code == 404
    assert put(limited_client, 'care_tasks', identity(patient, foreign), when).status_code == 404
    assert limited_client.put(f'/api/care-task-schedules/{foreign.id}', json={'reminder_window_minutes': 20}).status_code == 404
    assert put(limited_client, 'care_tasks', key, when).status_code == 200
    grant.is_active = False
    db_session.commit()
    assert limited_client.request('DELETE', '/api/schedule/reminders/care_tasks', json=key).status_code == 404
    assert db_session.query(ScheduleReminder).one().remind_at == when


def test_legacy_scheduled_log_without_firing_clears_credited_reminder(admin_client, db_session, patient, clock):
    med, = fixture_schedules(db_session, patient, 'medications', hours=(15,))
    assert put(admin_client, 'medications', identity(patient, med), SLOT + timedelta(minutes=10)).status_code == 200
    response = admin_client.post(f'/api/medications/{med.medication_id}/administer', json={
        'patient_id':patient.id, 'schedule_id':med.id, 'dose_amount':1, 'administered_at':NOW.isoformat(),
    })
    assert response.status_code == 200, response.text
    assert db_session.query(ScheduleReminder).one().remind_at is None


def test_future_reminder_can_shorten_to_original_due_but_never_earlier(admin_client, db_session, patient, monkeypatch):
    monkeypatch.setattr(schedule_reminders, 'utc_now', lambda: SLOT - timedelta(minutes=30))
    med, = fixture_schedules(db_session, patient, 'medications', hours=(15,))
    key = identity(patient, med)
    assert put(admin_client, 'medications', key, SLOT + timedelta(minutes=10)).status_code == 200
    early = put(admin_client, 'medications', key, SLOT - timedelta(minutes=1))
    assert early.status_code == 422 and early.json()['detail']['code'] == 'before_due'
    assert db_session.query(ScheduleReminder).one().remind_at == SLOT + timedelta(minutes=10)
    assert put(admin_client, 'medications', key, SLOT).status_code == 200
