"""Schedule snapshots, dashboard counts and MQTT delivery share occurrence identity."""
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
import json
from unittest.mock import Mock
from zoneinfo import ZoneInfo

import pytest

from crud.care_tasks import add_care_task
from crud import schedule_status
from crud.schedule_status import dashboard_schedule_counts, get_schedule_status
from crud.scheduling import add_care_task_schedule
from mqtt import publisher
from schemas.care_task_schedule import CareTaskSchedule
from schemas.schedule_reminder import ScheduleReminder
from utils.datetime_utils import local_day_bounds

TZ = ZoneInfo('America/New_York')
UTC = timezone.utc
FIRING = datetime(2026, 10, 30, 3, 50, tzinfo=UTC)
END = FIRING + timedelta(days=8)
LATER = FIRING + timedelta(days=5, minutes=30)


def schedule(db, patient):
    task_id = add_care_task(db, 'Transfer practice', category_id=None, patient_id=patient.id)
    sid = add_care_task_schedule(db, task_id, '50 3 30 10 *', patient_id=patient.id,
                                 reminder_window_minutes=8 * 24 * 60)
    db.get(CareTaskSchedule, sid).created_at = FIRING - timedelta(days=1)
    db.commit()
    return sid


def snooze(db, patient, sid, chosen):
    item = ScheduleReminder(patient_id=patient.id, category='care_tasks', schedule_id=sid,
                            scheduled_at=FIRING, original_due_at=FIRING, deadline_at=END,
                            remind_at=chosen, updated_at=FIRING)
    db.add(item)
    db.commit()
    return item


def snapshot(db, patient, now):
    return get_schedule_status(db, patient.id, now, sections=['care_task_counts'], include_alerts=True)


def test_custom_window_recovers_open_earlier_day_then_expires(db_session, patient):
    schedule(db_session, patient)
    counts = lambda now: dashboard_schedule_counts(db_session, patient.id, 'care_task_counts', now)
    assert counts(END - timedelta(seconds=1)) == {'due': 1, 'overdue': 1, 'due_now': 0, 'late': 1}
    assert counts(END) == {'due': 0, 'overdue': 0, 'due_now': 0, 'late': 0}


def test_snooze_moves_only_original_occurrence_onto_future_selected_day(db_session, patient, admin_client, monkeypatch):
    from routes import schedule as route

    sid = schedule(db_session, patient)
    snooze(db_session, patient, sid, LATER)
    now = FIRING
    monkeypatch.setattr(route, 'local_day_bounds', lambda tz: local_day_bounds(tz, now))

    def day(when):
        return admin_client.get('/api/schedule/daily', params={'patient_id': patient.id, 'category': 'care_tasks',
                                 'target_date': when.astimezone(TZ).date().isoformat()}).json()['care_tasks']

    assert day(FIRING) == []
    row, = day(LATER)
    assert row['reminder_state'] == 'snoozed'
    assert row['scheduled_time'] == row['original_due_at'] == FIRING.isoformat()
    assert row['effective_time'] == row['remind_at'] == LATER.isoformat()
    assert row['deadline_at'] == END.isoformat()
    assert row['schedule_id'] == sid and not row['is_yesterday']
    assert row['can_remind_later']
    now = END
    missed, = day(LATER)
    assert missed['reminder_state'] == 'missed' and not missed['can_remind_later']


@pytest.mark.parametrize('final', [True, False])
def test_due_reminder_delivery_retries_and_respects_current_permissions(db_session, patient, monkeypatch, final):
    import state_manager

    sid = schedule(db_session, patient)
    chosen = END if final else LATER
    record = snooze(db_session, patient, sid, chosen)
    before = snapshot(db_session, patient, chosen - timedelta(seconds=1))
    assert not before['late'] and not before['due_now'] and not before['upcoming']
    assert not before.get('reminder_alerts')
    # The minute polling loop wakes after the chosen time, including after expiry.
    now = chosen + timedelta(seconds=37)
    monkeypatch.setattr(schedule_status, 'utc_now', lambda: now)
    pending = snapshot(db_session, patient, now)
    alert, = pending['reminder_alerts']
    assert alert == {'category': 'Care task', 'name': 'Transfer practice', 'due_at': chosen.isoformat(),
                     'scheduled_time': FIRING.isoformat(), 'at_deadline': final,
                     'occurrence_id': f'care_tasks/{sid}/{FIRING.isoformat()}'}
    assert not pending['late']
    assert len(pending['due_now']) == (0 if final else 1)
    if not final:
        assert not snapshot(db_session, patient, END).get('reminder_alerts')

    config = {'enabled': True, 'sections': {'schedule_details': 'get', 'care_task_counts': 'off'}}
    monkeypatch.setattr(publisher, 'get_patient_mqtt_config', lambda pid: config)
    monkeypatch.setattr(publisher, 'get_mqtt_settings', lambda: {'enabled': True})
    monkeypatch.setattr(state_manager, 'get_db_session', lambda: nullcontext(db_session))
    client = Mock()
    message = client.publish.return_value
    pub = publisher.MQTTPublisher(client)
    message.rc = 0
    assert pub.publish_schedule_details(patient.id, pending)
    assert not json.loads(client.publish.call_args.args[1]).get('reminder_alerts')
    assert record.notified_at is None

    config['sections']['care_task_counts'] = 'get'
    message.is_published.return_value = False
    assert not pub.publish_schedule_details(patient.id, pending)
    assert record.notified_at is None
    message.is_published.return_value = True
    assert pub.publish_schedule_details(patient.id, pending)
    assert json.loads(client.publish.call_args.args[1])['reminder_alerts'] == [alert]
    assert record.notified_at is not None
    assert not snapshot(db_session, patient, now).get('reminder_alerts')
    # Replaying a snapshot taken before acknowledgement does not send it again.
    assert pub.publish_schedule_details(patient.id, pending)
    assert not json.loads(client.publish.call_args.args[1]).get('reminder_alerts')


def test_old_medication_in_grace_stays_hidden_until_future_reminder(db_session, patient, admin_client, monkeypatch):
    from crud.medications import add_medication, add_medication_schedule
    from routes import schedule as route
    from schemas.medication_schedule import MedicationSchedule

    # Neither the original Friday nor the chosen Wednesday is on Monday's
    # grid. The separate grace-dose query must still honor the saved reminder.
    monday = FIRING + timedelta(days=3)
    selected = FIRING + timedelta(days=5)
    mid = add_medication(db_session, 'Weekly tablet', quantity=4, patient_id=patient.id)
    sid = add_medication_schedule(db_session, mid, '50 3 * * 5', patient_id=patient.id, grace_period_hours=150)
    db_session.get(MedicationSchedule, sid).created_at = FIRING - timedelta(days=1)
    db_session.add(ScheduleReminder(patient_id=patient.id, category='medications', schedule_id=sid,
                                   scheduled_at=FIRING, original_due_at=FIRING, deadline_at=FIRING + timedelta(hours=150),
                                   remind_at=selected, updated_at=FIRING))
    db_session.commit()
    monkeypatch.setattr(route, 'local_day_bounds', lambda tz: local_day_bounds(tz, monday))

    def grid(when):
        return admin_client.get('/api/schedule/daily', params={'patient_id': patient.id, 'category': 'medications',
                                'target_date': when.astimezone(TZ).date().isoformat()}).json()['medications']

    assert grid(monday) == []
    assert dashboard_schedule_counts(db_session, patient.id, 'meds_counts', monday)['due'] == 0
    row, = grid(selected)
    assert row['reminder_state'] == 'snoozed'
    assert row['scheduled_time'] == FIRING.isoformat()
    assert row['effective_time'] == selected.isoformat()


def test_rare_medication_remains_active_for_its_whole_legacy_grace(db_session, patient):
    from crud.medications import add_medication, add_medication_schedule
    from schemas.medication_schedule import MedicationSchedule

    mid = add_medication(db_session, 'Annual dose', quantity=2, patient_id=patient.id)
    sid = add_medication_schedule(db_session, mid, '50 3 30 10 *', patient_id=patient.id)
    db_session.get(MedicationSchedule, sid).created_at = FIRING - timedelta(days=20)
    db_session.commit()
    counts = lambda now: dashboard_schedule_counts(db_session, patient.id, 'meds_counts', now)
    assert counts(FIRING + timedelta(days=150))['late'] == 1
    assert counts(FIRING + timedelta(days=220))['late'] == 0
