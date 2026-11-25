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
"""Patient-scoped opt-in settings, shared decisions and portable references."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from crud import schedule_manager as manager
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_output import NutritionOutput
from schemas.nutrition_schedule import NutritionSchedule
from schemas.schedule_manager import ScheduleManagerAction

NOW = datetime(2026, 11, 25, 20, tzinfo=timezone.utc)


@pytest.fixture
def meal(db_session, patient):
    schedule = NutritionSchedule(patient_id=patient.id, name='Lunch', schedule_type='meal', cron_expression='0 17 * * *')
    db_session.add(schedule)
    db_session.commit()
    return schedule


def log_feed(db, patient, meal, started=NOW, occurrence=NOW):
    intake = NutritionIntake(patient_id=patient.id, schedule_id=meal.id, item_name='Lunch',
                             item_type='tube_feed', amount=100, amount_unit='ml', consumed_at=started,
                             scheduled_time=occurrence, event_group_id=str(uuid4()), created_at=NOW, updated_at=NOW)
    db.add(intake)
    db.commit()
    return intake


def settings(meal, **kwargs):
    return manager.ManagerSettings(checks_enabled=True, check_feed_ids=[meal.id], **kwargs)


def test_opt_in_and_scope(admin_client, db_session, patient, meal, monkeypatch):
    from crud.patients import create_patient
    from models.users import Account
    monkeypatch.setattr(manager, 'utc_now', lambda: NOW)
    path = f'/api/schedule-manager/{patient.id}'
    initial = admin_client.get(path).json()
    assert not initial['settings']['feeds_enabled'] and not initial['settings']['checks_enabled']
    assert [s['id'] for s in initial['schedules']] == [meal.id]
    assert initial['suggestion'] is None and initial['history'] == []
    saved = settings(meal, feeds_enabled=True, feed_schedule_ids=[meal.id],
                     min_gap_minutes=75, overnight_schedule_id=meal.id, overnight_target='22:00')
    assert admin_client.put(path, json=saved.model_dump()).json()['settings'] == saved.model_dump()
    assert admin_client.put(path, json={**saved.model_dump(), 'min_gap_minutes': None}).status_code == 422
    foreign_account = Account(name='Second', slug='manager-other', password_hash='disabled', timezone='UTC')
    db_session.add(foreign_account)
    db_session.commit()
    foreign = create_patient(db_session, dict(first_name='Other', last_name='Person', account_id=foreign_account.id))
    other_meal = NutritionSchedule(patient_id=foreign.id, name='Other lunch', schedule_type='meal', cron_expression='0 13 * * *')
    db_session.add(other_meal)
    db_session.commit()
    assert admin_client.get(f'/api/schedule-manager/{foreign.id}').status_code == 404
    assert admin_client.put(path, json={**saved.model_dump(), 'check_feed_ids': [other_meal.id]}).status_code == 422
    assert admin_client.get(path).json()['settings'] == saved.model_dump()


def test_preview_does_not_save_and_uses_actual_events(admin_client, db_session, patient, meal, monkeypatch):
    monkeypatch.setattr(manager, 'utc_now', lambda: NOW)
    log_feed(db_session, patient, meal, started=NOW - timedelta(hours=1))
    path = f'/api/schedule-manager/{patient.id}'
    draft = settings(meal)
    preview = admin_client.post(f'{path}/preview', json=draft.model_dump())
    assert preview.status_code == 200, preview.text
    assert preview.json()['suggestion']['feed_name'] == 'Lunch'
    assert not admin_client.get(path).json()['settings']['checks_enabled']


def test_check_window_and_shared_snooze_dismiss(admin_client, db_session, patient, meal, monkeypatch):
    at = [NOW]
    monkeypatch.setattr(manager, 'utc_now', lambda: at[0])
    path = f'/api/schedule-manager/{patient.id}'
    admin_client.put(path, json=settings(meal).model_dump()).raise_for_status()
    log_feed(db_session, patient, meal)
    assert admin_client.get(path).json()['suggestion'] is None
    at[0] = NOW + timedelta(minutes=30)
    suggestion = admin_client.get(path).json()['suggestion']
    assert suggestion['feed_name'] == 'Lunch' and suggestion['last_change_at'] is None
    act = dict(action='snooze', trigger_key=suggestion['trigger_key'], request_id=str(uuid4()))
    response = admin_client.post(f'{path}/actions', json=act).json()
    assert response['suggestion'] is None and [h['action'] for h in response['history']] == ['snooze']
    assert len(admin_client.post(f'{path}/actions', json=act).json()['history']) == 1
    at[0] += timedelta(minutes=30)
    assert admin_client.get(path).json()['suggestion']['trigger_key'] == suggestion['trigger_key']
    assert admin_client.post(f'{path}/actions', json=dict(action='dismiss', trigger_key=suggestion['trigger_key'])).status_code == 200
    assert admin_client.post(f'{path}/actions', json=dict(action='changed', trigger_key=suggestion['trigger_key'])).status_code == 409
    assert admin_client.get(path).json()['suggestion'] is None
    assert db_session.query(NutritionOutput).filter_by(patient_id=patient.id).count() == 0


def test_recent_change_including_regular_bathroom_log_and_separate_dry_check(admin_client, db_session, patient, meal, monkeypatch):
    at = [NOW]
    monkeypatch.setattr(manager, 'utc_now', lambda: at[0])
    path = f'/api/schedule-manager/{patient.id}'
    draft = settings(meal, check_delay_minutes=0)
    log_feed(db_session, patient, meal, started=NOW - timedelta(minutes=5))
    output = NutritionOutput(patient_id=patient.id, output_type='urine', is_diaper=True, diaper_wetness='wet',
                             occurred_at=NOW - timedelta(minutes=10), created_at=NOW, updated_at=NOW)
    db_session.add(output)
    db_session.commit()
    assert admin_client.put(path, json=draft.model_dump()).json()['suggestion'] is None
    # An ordinary change is also a check when the cooldown outlasts the change lookback.
    shorter_lookback = {**draft.model_dump(), 'change_lookback_minutes': 1}
    assert admin_client.post(f'{path}/preview', json=shorter_lookback).json()['suggestion'] is None
    output.occurred_at = NOW - timedelta(hours=3)
    db_session.commit()
    prompt = admin_client.get(path).json()['suggestion']
    assert datetime.fromisoformat(prompt['last_change_at']) == output.occurred_at
    state = admin_client.post(f'{path}/actions', json=dict(action='dry', trigger_key=prompt['trigger_key'])).json()
    assert state['suggestion'] is None
    assert state['history'][0]['action'] == 'dry'
    assert db_session.query(NutritionOutput).filter_by(patient_id=patient.id).count() == 1
    at[0] += timedelta(minutes=61)
    log_feed(db_session, patient, meal, started=at[0], occurrence=at[0])
    assert datetime.fromisoformat(admin_client.get(path).json()['suggestion']['last_change_at']) == output.occurred_at
    # Manual actions also work when guidance is switched off.
    admin_client.put(path, json={}).raise_for_status()
    assert admin_client.post(f'{path}/actions', json=dict(action='changed')).status_code == 409
    admin_client.put(path, json={'manual_checks_enabled': True}).raise_for_status()
    admin_client.post(f'{path}/actions', json=dict(action='changed')).raise_for_status()
    assert admin_client.put(path, json=draft.model_dump()).json()['suggestion'] is None
    assert db_session.query(NutritionOutput).filter_by(patient_id=patient.id).count() == 1


def test_flush_void_expiry_are_not_qualifying_starts(db_session, patient, meal):
    draft = settings(meal, check_delay_minutes=0, check_window_minutes=60)
    log_feed(db_session, patient, meal, occurrence=None)
    assert manager.current_suggestion(db_session, patient.id, draft, NOW) is None
    intake = log_feed(db_session, patient, meal)
    assert manager.current_suggestion(db_session, patient.id, draft, NOW) is not None
    assert manager.current_suggestion(db_session, patient.id, draft, NOW + timedelta(minutes=60)) is None
    intake.voided_at = NOW
    db_session.commit()
    assert manager.current_suggestion(db_session, patient.id, draft, NOW) is None


def test_patient_archive_remaps_selected_schedules_and_trigger(db_session, account, admin_user, patient, meal, monkeypatch):
    from crud.backup import export_patient_to_targz, restore_patient_from_targz
    monkeypatch.setattr(manager, 'utc_now', lambda: NOW)
    draft = settings(meal, feeds_enabled=True, feed_schedule_ids=[meal.id], min_gap_minutes=75,
                     overnight_schedule_id=meal.id, overnight_target='20:00', check_delay_minutes=0)
    manager.save_settings(db_session, patient.id, draft, admin_user.id)
    log_feed(db_session, patient, meal)
    prompt = manager.current_suggestion(db_session, patient.id, draft, NOW)
    manager.record_action(db_session, patient.id, manager.BathroomAction(action='dismiss', trigger_key=prompt['trigger_key']), admin_user.id)
    data, _ = export_patient_to_targz(db_session, patient.id, account.id)
    restored_id = restore_patient_from_targz(db_session, data, account.id)['new_patient_id']
    restored = manager.read_settings(db_session, restored_id)
    assert restored.overnight_schedule_id != meal.id
    assert restored.feed_schedule_ids == restored.check_feed_ids == [restored.overnight_schedule_id]
    action = db_session.query(ScheduleManagerAction).filter_by(patient_id=restored_id).one()
    assert action.trigger_schedule_id == restored.overnight_schedule_id
    assert manager.current_suggestion(db_session, restored_id, restored, NOW) is None

    # Exporting recipients to another account remaps attribution via its own
    # caregiver directory. An unavailable source recipient never broadens delivery.
    from models.users import Account
    target = Account(name='Destination', slug='dst-manager', password_hash='disabled', timezone='UTC')
    db_session.add(target)
    db_session.commit()
    draft.check_recipient_ids = [admin_user.id]
    manager.save_settings(db_session, patient.id, draft, admin_user.id)
    data, _ = export_patient_to_targz(db_session, patient.id, account.id)
    imported = restore_patient_from_targz(db_session, data, target.id)['new_patient_id']
    state = manager.manager_state(db_session, imported, user_id=admin_user.id)
    assert state['audience_needs_review'] and len(state['settings'].check_recipient_ids) == 1
    assert admin_user.id not in state['settings'].check_recipient_ids and state['suggestion'] is None


def test_fixed_check_and_active_prompt_share_one_outcome(admin_client, db_session, patient, meal, monkeypatch):
    from crud.scheduling import get_scheduled_nutrition
    monkeypatch.setattr(manager, 'utc_now', lambda: NOW)
    fixed = NutritionSchedule(patient_id=patient.id, name='Afternoon diaper check', schedule_type='diaper_check',
                              cron_expression='0 20 * * *')
    db_session.add(fixed)
    db_session.commit()
    log_feed(db_session, patient, meal, started=NOW - timedelta(minutes=30))
    path = f'/api/schedule-manager/{patient.id}'
    prompt = admin_client.put(path, json=settings(meal).model_dump()).json()['suggestion']
    assert prompt['check_schedule_id'] == fixed.id
    assert datetime.fromisoformat(prompt['check_scheduled_time']) == NOW
    check = dict(schedule_id=fixed.id, scheduled_time=NOW.isoformat(), patient_id=patient.id)
    for endpoint, body in [('nutrition', check), ('bulk', {'nutrition': [check]})]:
        resp = admin_client.post(f'/api/schedule/complete/{endpoint}', json=body)
        assert resp.status_code == 422 and resp.json()['error'] == 'check_outcome_required'
    intake = admin_client.post('/api/nutrition/intake/event', json={
        **check, 'items': [dict(item_name='Formula', item_type='tube_feed', amount=1, amount_unit='ml')],
    })
    assert intake.status_code == 400
    action = dict(action='dry', trigger_key=prompt['trigger_key'], request_id=str(uuid4()))
    state = admin_client.post(f'{path}/actions', json=action).json()
    assert state['suggestion'] is None
    assert state['history'][0]['recorded_by_name'] == 'Admin Test'
    assert len(admin_client.post(f'{path}/actions', json=action).json()['history']) == 1
    rows = get_scheduled_nutrition(db_session, NOW.date(), patient.id, strict=True)
    row = next(r for r in rows if r['schedule_id'] == fixed.id)
    assert row['row_kind'] == 'diaper_check' and row['completed'] and row['check_outcome'] == 'dry'
    assert row['log_id'] is None
    fixed_action = dict(action='changed', check_schedule_id=fixed.id, check_scheduled_time=NOW.isoformat())
    assert admin_client.post(f'{path}/actions', json=fixed_action).status_code == 409
    # An explicit scheduled diaper check can be recorded when all guidance is off.
    admin_client.put(path, json={}).raise_for_status()
    fixed_action['check_scheduled_time'] = (NOW - timedelta(days=1)).isoformat()
    assert admin_client.post(f'{path}/actions', json=fixed_action).status_code == 200
    fixed_action['check_scheduled_time'] = (NOW - timedelta(minutes=1)).isoformat()
    assert admin_client.post(f'{path}/actions', json=fixed_action).status_code == 422


def test_manager_requires_active_patient_grant_and_separate_write_permissions(limited_client, limited_user, db_session, patient):
    from crud.users import get_role_by_name
    from schemas.patient import AccessLevel, PatientAccess

    path = f'/api/schedule-manager/{patient.id}'
    assert limited_client.get(path).status_code == 404
    grant = PatientAccess(patient_id=patient.id, user_id=limited_user.id, access_level=AccessLevel.VIEWER,
                          granted_at=NOW.replace(tzinfo=None), is_active=True)
    db_session.add(grant)
    db_session.commit()
    assert limited_client.get(path).status_code == 403
    limited_user.roles.append(get_role_by_name(db_session, 'caregiver'))
    db_session.commit()
    access = limited_client.get(path).json()
    assert not access['can_record'] and not access['can_manage']
    assert limited_client.put(path, json={}).status_code == 403
    assert limited_client.post(path + '/actions', json={'action': 'dry'}).status_code == 403
    grant.access_level = AccessLevel.CAREGIVER
    db_session.commit()
    access = limited_client.get(path).json()
    assert access['can_record'] and not access['can_manage']
    grant.expires_at = datetime(2020, 1, 1)
    db_session.commit()
    assert limited_client.get(path).status_code == 404


def test_guidance_delivery_window_wraps_patient_local_midnight(admin_client, db_session, patient, meal, monkeypatch):
    at = [NOW]
    monkeypatch.setattr(manager, 'utc_now', lambda: at[0])
    path = f'/api/schedule-manager/{patient.id}'
    draft = settings(meal, check_delay_minutes=0, check_window_minutes=1440,
                     check_hours_start='22:00', check_hours_end='06:00')
    log_feed(db_session, patient, meal)
    assert admin_client.put(path, json=draft.model_dump()).json()['suggestion'] is None  # 3 p.m. local
    at[0] = NOW + timedelta(hours=7)  # 10 p.m.
    assert admin_client.get(path).json()['suggestion']
    at[0] += timedelta(hours=7)       # 5 a.m.
    assert admin_client.get(path).json()['suggestion']
    at[0] += timedelta(hours=1)       # 6 a.m.
    assert admin_client.get(path).json()['suggestion'] is None
    for invalid_end in (None, '22:00', '25:00'):
        assert admin_client.put(path, json={**draft.model_dump(), 'check_hours_end': invalid_end}).status_code == 422
    admin_client.post(f'{path}/actions', json={'action': 'dry'}).raise_for_status()


def test_recipient_filter_only_controls_suggestions(client, db_session, account, admin_user, limited_user, patient, meal, monkeypatch):
    from crud.users import get_role_by_name
    from routes.auth import create_access_token
    from schemas.patient import AccessLevel, PatientAccess
    monkeypatch.setattr(manager, 'utc_now', lambda: NOW)
    limited_user.roles.append(get_role_by_name(db_session, 'caregiver'))
    grant = PatientAccess(user_id=limited_user.id, patient_id=patient.id, granted_at=NOW.replace(tzinfo=None),
                          access_level=AccessLevel.CAREGIVER, is_active=True)
    db_session.add(grant)
    db_session.commit()
    path = f'/api/schedule-manager/{patient.id}'
    admin = {'Authorization': f'Bearer {create_access_token(user=admin_user, account=account, auth_level="full")}'}
    caregiver = {'Authorization': f'Bearer {create_access_token(user=limited_user, account=account, auth_level="full")}'}
    draft = settings(meal, check_delay_minutes=0, check_recipient_ids=[limited_user.id])
    log_feed(db_session, patient, meal)
    result = client.put(path, json=draft.model_dump(), headers=admin).json()
    assert {u['id'] for u in result['caregivers']} >= {admin_user.id, limited_user.id}
    assert result['suggestion'] is None
    prompt = client.get(path, headers=caregiver).json()['suggestion']
    assert prompt
    assert client.post(path + '/actions', json=dict(action='dismiss', trigger_key=prompt['trigger_key']), headers=admin).status_code == 409
    grant.is_active = False
    db_session.commit()
    assert client.get(path, headers=caregiver).status_code == 404
    state = client.get(path, headers=admin).json()
    assert state['audience_needs_review'] and state['suggestion'] is None
    assert client.put(path, json=draft.model_dump(), headers=admin).status_code == 422
    state = client.post(path + '/actions', json={'action': 'changed'}, headers=admin).json()
    assert state['history'][0]['action'] == 'changed'
    grant.is_active = True
    db_session.commit()
    assert client.get(path, headers=caregiver).json()['history'][0]['action'] == 'changed'
    assert client.post(path + '/preview', json={**draft.model_dump(), 'check_recipient_ids': []}, headers=caregiver).status_code == 403


def test_unrelated_edits_preserve_audience_after_recipient_is_deleted(admin_client, admin_user, db_session, patient, meal, monkeypatch):
    from schemas.schedule_manager import ScheduleManagerRecipient
    monkeypatch.setattr(manager, 'utc_now', lambda: NOW)
    path = f'/api/schedule-manager/{patient.id}'
    draft = settings(meal, check_delay_minutes=0, check_recipient_ids=[admin_user.id]).model_dump()
    log_feed(db_session, patient, meal)
    admin_client.put(path, json=draft).raise_for_status()
    # ON DELETE SET NULL leaves a restricted audience awaiting review.
    recipient = db_session.query(ScheduleManagerRecipient).filter_by(patient_id=patient.id).one()
    recipient.user_id = None
    db_session.commit()
    live = admin_client.get(path).json()
    assert live['audience_needs_review'] and live['settings']['check_recipient_ids'] == []
    assert live['suggestion'] is None
    draft = {**live['settings'], 'check_cooldown_minutes': 75}
    for query in ('', '?replace_check_recipients=false'):
        preview = admin_client.post(f'{path}/preview{query}', json=draft).json()
        assert preview['suggestion'] is None
        saved = admin_client.put(path + query, json=draft).json()
        assert saved['audience_needs_review'] and saved['suggestion'] is None
        assert saved['settings']['check_cooldown_minutes'] == 75
    # Explicit audience edits may broaden the audience, after preview, without affecting care history.
    query = '?replace_check_recipients=true'
    assert admin_client.post(f'{path}/preview{query}', json=draft).json()['suggestion']
    assert admin_client.get(path).json()['audience_needs_review']
    result = admin_client.put(path + query, json=draft).json()
    assert not result['audience_needs_review'] and result['suggestion']
