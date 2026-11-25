from datetime import datetime, timedelta, timezone

from crud.care_tasks import add_care_task
from crud.equipment import add_equipment_simple
from crud.medications import add_medication, add_medication_schedule
from crud.schedule_status import SCHEDULE_BADGES, get_schedule_status, schedule_badge_counts
from crud.scheduling import add_care_task_schedule
from models.users import Account
from schemas.medication_log import MedicationLog
from schemas.nutrition_schedule import NutritionSchedule


def test_schedule_details_across_midnight_and_completion(db_session, patient, account):
    db = db_session
    # Tuesday 11:45 pm in the profile's timezone. Tomorrow starts at 05:00 UTC.
    now = datetime(2026, 11, 25, 4, 45, tzinfo=timezone.utc)
    missed = now - timedelta(hours=2)
    med = add_medication(db, "Example medication", quantity=10, patient_id=patient.id)
    sid = add_medication_schedule(db, med, "45 2 * * 3", patient_id=patient.id)
    task = add_care_task(db, "Example task", category_id=None, patient_id=patient.id)
    add_care_task_schedule(db, task, "45 3 * * 3", patient_id=patient.id)
    db.add(NutritionSchedule(patient_id=patient.id, name="Example feed", schedule_type="meal",
                             cron_expression="15 5 * * 3", notes="private note"))
    for name, days in (("Late filter", -1), ("Today's change", 0), ("Next change", 7), ("Later", 8)):
        add_equipment_simple(db, name, useful_days=10, last_changed=now + timedelta(days=days - 10),
                             account_id=account.id)
    other = Account(name="Other family", slug="other", password_hash="x")
    db.add(other)
    db.flush()
    add_equipment_simple(db, "Unrelated shared equipment", useful_days=10,
                         last_changed=now - timedelta(days=20), account_id=other.id)
    db.commit()

    snapshot = get_schedule_status(db, patient.id, now)
    assert snapshot["generated_at"] == now.isoformat()
    assert snapshot["late_count"] == 2, [i["name"] for i in snapshot["late"]]
    assert snapshot["late"] == [
        {"category": "Equipment", "name": "Late filter", "due_date": "2026-11-23"},
        {"category": "Medication", "name": "Example medication", "due_at": missed.isoformat()},
    ]
    assert {i["name"] for i in snapshot["due_now"]} == {"Example task", "Today's change"}
    assert snapshot["upcoming"] == [
        {"category": "Nutrition", "name": "Example feed", "due_at": "2026-11-25T05:15:00+00:00"},
        {"category": "Equipment", "name": "Next change", "due_date": "2026-12-01"},
    ]

    assert schedule_badge_counts(snapshot, SCHEDULE_BADGES) == {
        'meds_late': 1, 'meds_due_now': 0, 'nutrition_late': 0, 'nutrition_due_now': 1,
        'care_tasks_late': 0, 'care_tasks_due_now': 1, 'equipment_late': 1, 'equipment_due_now': 1,
    }

    log = MedicationLog(medication_id=med, patient_id=patient.id, schedule_id=sid,
                        scheduled_time=None, administered_at=missed + timedelta(minutes=10),
                        is_scheduled=True, dose_amount=0, created_at=now)
    db.add(log)
    db.flush()
    assert get_schedule_status(db, patient.id, now)["late_count"] == 1
    db.delete(log)
    db.flush()
    assert get_schedule_status(db, patient.id, now)["late_count"] == 2


def test_schedule_feed_excludes_other_patients_and_accounts(db_session, account, patient):
    from crud.patients import create_patient
    from schemas.medication import Medication
    from schemas.medication_schedule import MedicationSchedule
    from schemas.care_task import CareTask
    from schemas.care_task_schedule import CareTaskSchedule

    db = db_session
    other = Account(name="Unrelated", slug="unrelated", password_hash="x")
    db.add(other)
    db.flush()
    sibling = create_patient(db, {"first_name": "Other", "last_name": "Profile", "account_id": account.id})
    now = datetime(2026, 11, 24, 15, tzinfo=timezone.utc)
    for name, owner, pid in [
        ("Our shared", account.id, None), ("Another profile", account.id, sibling.id),
        ("Other account", other.id, None),
    ]:
        med = Medication(name=name, account_id=owner, patient_id=pid, quantity=12, quantity_unit="units",
                         created_at=now, updated_at=now)
        task = CareTask(name=name, account_id=owner, patient_id=pid, created_at=now, updated_at=now)
        db.add_all([med, task])
        db.flush()
        params = dict(patient_id=None, cron_expression="30 12 * * 2", created_at=now, updated_at=now)
        db.add_all([MedicationSchedule(medication_id=med.id, **params),
                    CareTaskSchedule(care_task_id=task.id, **params)])
    db.flush()
    late = get_schedule_status(db, patient.id, now)["late"]
    assert [(i["name"], i["category"]) for i in late] == [
        ("Our shared", "Care task"), ("Our shared", "Medication"),
    ]


def test_refresh_publishes_details_without_badge_permissions(db_session, patient, monkeypatch):
    import asyncio
    from contextlib import nullcontext
    from unittest.mock import Mock
    from bus import EventBus
    from modules.mqtt_module import MQTTModule
    from mqtt.publisher import MQTTPublisher
    from mqtt import publisher, settings
    import state_manager
    import json

    cfg = {'enabled': True, 'sections': {'schedule_details': 'get'}}
    monkeypatch.setattr(settings, 'get_patient_mqtt_config', lambda pid: cfg)
    monkeypatch.setattr(publisher, 'get_patient_mqtt_config', lambda pid: cfg)
    monkeypatch.setattr(publisher, 'get_mqtt_settings', lambda: {'enabled': True})
    monkeypatch.setattr(state_manager, 'get_db_session', lambda: nullcontext(db_session))
    client = Mock()
    client.publish.return_value.rc = 0
    module = MQTTModule(EventBus())
    module.set_mqtt_components(None, MQTTPublisher(client))
    asyncio.run(module.refresh_patient_schedule(patient.id))
    (topic, raw), flags = client.publish.call_args
    assert topic == f'shh/patient/{patient.id}/schedule'
    assert flags == {'qos': 1, 'retain': False}
    body = json.loads(raw)
    assert body == {'generated_at': body['generated_at'], 'late': [], 'late_count': 0,
                    'due_now': [], 'upcoming': []}
    assert not module._patient_state_cache

    cfg['sections'].clear()
    asyncio.run(module.refresh_patient_schedule(patient.id))
    client.publish.assert_called_once()
