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
"""Care-task rebuild: the shared vocabulary, and the completion and history
bugs that made adherence stats disagree with what actually happened."""
from datetime import datetime, timedelta, timezone


# =====================
# SHARED VOCABULARY
# =====================

def test_nutrition_category_matches_more_than_the_word_nutrition():
    """The form matched 'nutrition' exactly while the API matched six keywords,
    so a Feeding task hid its prefill fields but still opened the intake sheet
    on completion — with nothing to prefill it from."""
    from care_task_vocab import is_nutrition_category

    for name in ('Nutrition', 'Feeding', 'Tube feeding', 'Meal prep', 'Food', 'Supplements'):
        assert is_nutrition_category(name) is True, name
    for name in ('Hygiene', 'Repositioning', None, ''):
        assert is_nutrition_category(name) is False, name


def test_completion_timing_window():
    from care_task_vocab import completion_timing

    at = datetime(2026, 8, 18, 12, 0, tzinfo=timezone.utc)
    on_time = completion_timing(at, at + timedelta(minutes=10))
    assert on_time == {'completed_early': False, 'completed_late': False}

    assert completion_timing(at, at + timedelta(minutes=30))['completed_late'] is True
    assert completion_timing(at, at - timedelta(minutes=30))['completed_early'] is True

    # A PRN completion has no scheduled time to be early or late for.
    assert completion_timing(None, at) == {'completed_early': False, 'completed_late': False}


def test_completion_timing_survives_mixed_awareness():
    """scheduled_time is stored as a naive UTC wall clock in places."""
    from care_task_vocab import completion_timing

    naive = datetime(2026, 8, 18, 12, 0)
    aware = datetime(2026, 8, 18, 12, 40, tzinfo=timezone.utc)
    assert completion_timing(naive, aware)['completed_late'] is True


# =====================
# FIXTURES
# =====================

def _category(admin_client, name='Hygiene'):
    resp = admin_client.post("/api/add/care-task-category", json={"name": name, "color": "#3B82F6"})
    assert resp.status_code == 200
    return resp.json()["id"]


def _task(admin_client, patient, cat_id, name='Brush teeth'):
    resp = admin_client.post("/api/add/care-task",
                             json={"name": name, "category_id": cat_id, "patient_id": patient.id})
    assert resp.status_code == 200
    return resp.json()["id"]


def _schedule(db_session, task_id, patient_id, cron='0 8 * * *', notes=None):
    from schemas.care_task_schedule import CareTaskSchedule
    from utils.datetime_utils import utc_now
    row = CareTaskSchedule(care_task_id=task_id, patient_id=patient_id,
                           cron_expression=cron, description='Daily at 08:00',
                           active=True, notes=notes,
                           created_at=utc_now(), updated_at=utc_now())
    db_session.add(row)
    db_session.commit()
    return row


# =====================
# COMPLETION
# =====================

def test_schedule_completion_requires_permission(limited_client, patient, db_session):
    """This endpoint had no permission dependency at all, and took the
    performing user straight from the request body.

    Built through the session rather than admin_client: both client fixtures
    wrap the same object, so asking for one after the other just overwrites
    the auth header.
    """
    from schemas.care_task import CareTask
    from schemas.care_task_category import CareTaskCategory
    from utils.datetime_utils import utc_now

    cat = CareTaskCategory(name='Perm check', color='#3B82F6',
                           created_at=utc_now(), updated_at=utc_now())
    db_session.add(cat)
    db_session.flush()
    task = CareTask(name='Gated task', category_id=cat.id, patient_id=patient.id,
                    active=True, created_at=utc_now(), updated_at=utc_now())
    db_session.add(task)
    db_session.flush()
    sched = _schedule(db_session, task.id, patient.id)

    resp = limited_client.post("/api/schedule/complete/care-task", json={
        "schedule_id": sched.id, "patient_id": patient.id,
        "scheduled_time": "2026-08-18T08:00:00", "user_id": 999,
    })
    assert resp.status_code == 403


def test_completion_records_whether_it_was_late(admin_client, patient, db_session):
    """Completions from this path never set completed_late, so every one of
    them counted as on time in the adherence stats."""
    from schemas.care_task_log import CareTaskLog

    cat = _category(admin_client)
    task = _task(admin_client, patient, cat)
    sched = _schedule(db_session, task, patient.id)

    scheduled = datetime.now(timezone.utc) - timedelta(hours=2)
    resp = admin_client.post("/api/schedule/complete/care-task", json={
        "schedule_id": sched.id, "patient_id": patient.id,
        "scheduled_time": scheduled.replace(tzinfo=None).isoformat(),
        "early_override": True,
    })
    assert resp.status_code == 200, resp.text

    log = db_session.query(CareTaskLog).filter(
        CareTaskLog.id == resp.json()["log_id"]).first()
    assert log.completed_late is True
    assert log.completed_early is False
    # And it credits the signed-in user rather than whatever the body claimed.
    assert log.performed_by is not None


def test_completion_offers_intake_for_a_nutrition_task(admin_client, patient, db_session):
    """Which page a task was completed from decided whether intake was
    offered; this path never returned the hook."""
    import json

    cat = _category(admin_client, name='Feeding')
    task = _task(admin_client, patient, cat, name='Morning feed')
    prefill = {"nutrition": {"item_name": "Peptamen", "amount": 250, "amount_unit": "ml"}}
    sched = _schedule(db_session, task, patient.id, notes=json.dumps(prefill))

    resp = admin_client.post("/api/schedule/complete/care-task", json={
        "schedule_id": sched.id, "patient_id": patient.id,
        "scheduled_time": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["requires_nutrition_tracking"] is True
    assert body["nutrition_data"]["item_name"] == "Peptamen"
    assert body["care_task"]["is_nutrition_related"] is True


def test_a_skip_is_neither_early_nor_late(admin_client, patient, db_session):
    from schemas.care_task_log import CareTaskLog

    cat = _category(admin_client)
    task = _task(admin_client, patient, cat)
    sched = _schedule(db_session, task, patient.id)

    scheduled = datetime.now(timezone.utc) - timedelta(hours=3)
    resp = admin_client.post("/api/schedule/complete/care-task", json={
        "schedule_id": sched.id, "patient_id": patient.id,
        "scheduled_time": scheduled.replace(tzinfo=None).isoformat(),
        "skipped": True,
    })
    assert resp.status_code == 200, resp.text
    log = db_session.query(CareTaskLog).filter(CareTaskLog.id == resp.json()["log_id"]).first()
    assert log.status == 'skipped'
    assert log.completed_late is False
    assert log.completed_early is False
    # A skip records nothing to eat.
    assert resp.json()["requires_nutrition_tracking"] is False


# =====================
# HISTORY
# =====================

def test_history_includes_completions_of_a_global_task(admin_client, patient, db_session):
    """History filtered on the task definition's patient_id, so completions of
    a global task (patient_id NULL) never appeared for anyone."""
    from schemas.care_task_log import CareTaskLog
    from utils.datetime_utils import utc_now

    cat = _category(admin_client)
    # A global task belongs to no patient.
    resp = admin_client.post("/api/add/care-task",
                             json={"name": "Global check", "category_id": cat})
    assert resp.status_code == 200
    task_id = resp.json()["id"]

    db_session.add(CareTaskLog(
        care_task_id=task_id, patient_id=patient.id, completed_at=utc_now(),
        is_scheduled=False, status='completed', created_at=utc_now(),
    ))
    db_session.commit()

    body = admin_client.get(f"/api/care-tasks/history?patient_id={patient.id}").json()
    rows = body if isinstance(body, list) else body.get('history', body.get('logs', []))
    assert any(r.get('task_name') == 'Global check' for r in rows), rows


def test_completion_stats_keep_same_named_tasks_apart(admin_client, patient, db_session):
    """The accumulator keyed on task name, so two tasks sharing one merged."""
    from schemas.care_task_log import CareTaskLog
    from utils.datetime_utils import utc_now

    cat = _category(admin_client)
    a = _task(admin_client, patient, cat, name='Repositioning')
    b = _task(admin_client, patient, cat, name='Repositioning')
    assert a != b

    for task_id in (a, b):
        db_session.add(CareTaskLog(
            care_task_id=task_id, patient_id=patient.id, completed_at=utc_now(),
            is_scheduled=False, status='completed', created_at=utc_now(),
        ))
    db_session.commit()

    body = admin_client.get(
        f"/api/care-tasks/stats/completion?patient_id={patient.id}&days=30").json()
    rows = body if isinstance(body, list) else body.get('stats', body.get('tasks', []))
    ids = [r.get('task_id') for r in rows if r.get('task_name') == 'Repositioning']
    assert sorted(ids) == sorted([a, b]), rows


# =====================
# CANONICAL DAY SHAPE
# =====================

CANONICAL_KEYS = {
    'schedule_id', 'care_task_id', 'name', 'description', 'schedule_description',
    'category_id', 'category_name', 'category_color', 'scheduled_time', 'hour',
    'minute', 'completed', 'status', 'completed_at', 'completed_by', 'log_id',
    'is_prn', 'is_yesterday', 'is_nutrition', 'notes', 'type',
}


def test_canonical_item_reconciles_both_dialects():
    """Two producers named the same fields differently, so each view learned
    one dialect and missed anything added to the other."""
    from crud.scheduling import canonical_care_task_item

    at = datetime(2026, 8, 18, 8, 0, tzinfo=timezone.utc)
    done = datetime(2026, 8, 18, 8, 5, tzinfo=timezone.utc)

    old_style = canonical_care_task_item({
        'schedule_id': 1, 'care_task_id': 2, 'care_task_name': 'Morning feed',
        'care_task_description': 'via tube', 'care_task_category_name': 'Feeding',
        'care_task_category_color': '#abc', 'scheduled_time': at,
        'is_completed': True, 'completed_time': done, 'performed_by': 7,
    })
    new_style = canonical_care_task_item({
        'schedule_id': 1, 'care_task_id': 2, 'name': 'Morning feed',
        'description': 'via tube', 'category_name': 'Feeding',
        'category_color': '#abc', 'scheduled_time': at,
        'completed': True, 'completed_at': done, 'completed_by': 7,
    })

    assert old_style == new_style
    assert set(old_style) == CANONICAL_KEYS
    assert old_style['name'] == 'Morning feed'
    assert old_style['completed'] is True
    # Resolved server-side so no caller re-guesses it from the category name.
    assert old_style['is_nutrition'] is True


def test_canonical_item_defaults_are_safe():
    from crud.scheduling import canonical_care_task_item

    item = canonical_care_task_item({'care_task_id': 3, 'name': 'Repositioning'})
    assert item['completed'] is False
    assert item['is_prn'] is False
    assert item['is_yesterday'] is False
    assert item['is_nutrition'] is False
    assert item['hour'] is None


def test_day_endpoint_returns_canonical_items(admin_client, patient, db_session):
    cat = _category(admin_client, name='Hygiene day')
    task = _task(admin_client, patient, cat, name='Brush teeth')
    _schedule(db_session, task, patient.id, cron='0 8 * * *')

    resp = admin_client.get(f"/api/care-tasks/day?patient_id={patient.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert 'items' in body and 'counts' in body
    assert body['counts']['total'] == len(body['items'])
    for item in body['items']:
        assert set(item) == CANONICAL_KEYS, set(item) ^ CANONICAL_KEYS


def test_day_endpoint_requires_read_access(client, patient):
    """This endpoint had no auth dependency while its siblings did."""
    resp = client.get(f"/api/care-tasks/day?patient_id={patient.id}")
    assert resp.status_code in (401, 403)


def test_combined_schedule_speaks_the_same_shape(admin_client, patient, db_session):
    """The dashboard reads care tasks from /api/schedule/daily; it must agree
    with the care-task endpoints rather than carry its own spelling."""
    cat = _category(admin_client, name='Hygiene combined')
    task = _task(admin_client, patient, cat, name='Wash hands')
    _schedule(db_session, task, patient.id, cron='0 9 * * *')

    body = admin_client.get(f"/api/schedule/daily?patient_id={patient.id}").json()
    for item in body.get('care_tasks', []):
        assert set(item) == CANONICAL_KEYS, set(item) ^ CANONICAL_KEYS
