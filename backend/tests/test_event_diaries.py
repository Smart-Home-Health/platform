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
from uuid import uuid4

from crud.backup import export_patient_to_targz, restore_patient_from_targz
from schemas.event_diary import DiaryEvent, EventDiary
from schemas.medication_log import MedicationLog
from schemas.nutrition_intake import NutritionIntake
from test_medications import _make_med

AT = datetime(2026, 1, 17, 4, 10, tzinfo=timezone.utc)
FORM = {'name': 'Home EEG', 'starts_at': (AT - timedelta(days=1)).isoformat(),
        'ends_at': (AT + timedelta(days=1)).isoformat(),
        'buttons': [{'label': 'Questionable event', 'question': 'Recorder button pressed?'}],
        'include_medications': True, 'include_nutrition': True}


def start(client, patient):
    base = f'/api/patients/{patient.id}/diaries'
    res = client.post(base, json=FORM)
    assert res.status_code == 201, res.text
    return base, base + '/' + str(res.json()['id'])


def observe(client, path):
    payload = dict(request_id=str(uuid4()), label='Questionable event', observed_at=AT.isoformat())
    res = client.post(path + '/events', json=payload)
    assert res.status_code == 200, res.text
    assert res.json() == client.post(path + '/events', json=payload).json()
    return res.json()


def test_freeform_observation_uses_existing_diary_and_retry_key(admin_client, patient, db_session, account):
    _, path = start(admin_client, patient)
    events = path + '/events'
    draft = dict(observed_at=AT.isoformat(), request_id=str(uuid4()), note='Turned toward the window.\nResponded when called.')
    for invalid in ({'note': '  '}, {'answer': 'Yes'}, {'label': 'Removed preset'},
                    {'observed_at': (AT - timedelta(days=2)).isoformat()}):
        assert admin_client.post(events, json={**draft, **invalid}).status_code == 422
    assert admin_client.get(path + '/timeline').json() == []
    saved = admin_client.post(events, json=draft)
    assert saved.status_code == 200
    row = saved.json()
    assert row['is_custom'] is True
    assert row['label'] == 'Custom observation' and row['question'] is None and row['note'] == draft['note']
    assert admin_client.post(events, json=draft).json() == row
    assert admin_client.get(path + '/timeline').json() == [row]
    url = events + '/' + str(row['id'])
    assert admin_client.put(url, json={**draft, 'note': '  ', 'is_custom': False}).status_code == 422
    assert admin_client.get(path + '/timeline').json() == [row]
    assert admin_client.put(url, json={**draft, 'note': 'Corrected.'}).json()['note'] == 'Corrected.'
    assert admin_client.put(path, json={**FORM, 'buttons': [{'label': 'Custom observation'}]}).status_code == 200
    preset = admin_client.post(events, json={**draft, 'request_id': str(uuid4()), 'label': 'Custom observation'}).json()
    assert preset['is_custom'] is False and preset['label'] == row['label']
    assert admin_client.put(events + '/' + str(preset['id']), json={**draft, 'note': ''}).status_code == 200
    archive, _ = export_patient_to_targz(db_session, patient.id, account.id)
    restored = restore_patient_from_targz(db_session, archive, account.id)['new_patient_id']
    diary = db_session.query(EventDiary).filter_by(patient_id=restored).one()
    rows = admin_client.get(f'/api/patients/{restored}/diaries/{diary.id}/timeline').json()
    assert sorted((r['is_custom'], r['label'], r['note']) for r in rows) == [
        (False, 'Custom observation', ''), (True, 'Custom observation', 'Corrected.')]


def test_capture_edit_window_and_archive(admin_client, db_session, patient, account):
    base, path = start(admin_client, patient)
    assert admin_client.get(base).json()['can_write']
    event = observe(admin_client, path)
    assert event['answer'] is None
    edit = {'observed_at': (AT + timedelta(seconds=13)).isoformat(), 'note': 'Looked to the left.', 'answer': 'No'}
    url = path + '/events/' + str(event['id'])
    assert admin_client.put(url, json=edit).status_code == 200
    assert admin_client.put(path, json={**FORM, 'starts_at': (AT + timedelta(hours=1)).isoformat()}).status_code == 422
    assert admin_client.put(path, json={**FORM, 'buttons': [{'label': 'Other'}]}).status_code == 200
    [row] = admin_client.get(path + '/timeline').json()
    assert row['note'] == edit['note'] and row['answer'] == 'No' and row['question'] == FORM['buttons'][0]['question']
    archive, _ = export_patient_to_targz(db_session, patient.id, account.id)
    restored = restore_patient_from_targz(db_session, archive, account.id)['new_patient_id']
    diary = db_session.query(EventDiary).filter_by(patient_id=restored).one()
    copy = db_session.query(DiaryEvent).filter_by(diary_id=diary.id).one()
    assert copy.label == event['label'] and copy.answer == 'No' and copy.id != event['id']
    assert admin_client.delete(url).status_code == 204
    assert admin_client.get(path + '/timeline').json() == []


def test_timeline_uses_actual_nonvoided_records_and_groups_intake(admin_client, db_session, patient):
    _, path = start(admin_client, patient)
    observe(admin_client, path)
    med = _make_med(admin_client, patient).json()['id']
    for dose, when, voided in [(1, AT - timedelta(minutes=1), None), (0, AT, None), (1, AT, AT),
                              (1, AT + timedelta(days=2), None)]:
        db_session.add(MedicationLog(medication_id=med, patient_id=patient.id, dose_amount=dose,
            administered_at=when, created_at=when, voided_at=voided))
    group = str(uuid4())
    for name in ['Feed', 'Water']:
        db_session.add(NutritionIntake(patient_id=patient.id, item_name=name, item_type='liquid',
            event_group_id=group, amount=20, amount_unit='ml', consumed_at=AT + timedelta(hours=2),
            created_at=AT, updated_at=AT))
    db_session.commit()
    rows = admin_client.get(path + '/timeline').json()
    assert [r['source'] for r in rows] == ['medication', 'observation', 'nutrition']
    assert 'Water' in rows[-1]['note'] and 'Feed' in rows[-1]['note']
    admin_client.put(path, json={**FORM, 'include_medications': False, 'include_nutrition': False})
    assert [r['source'] for r in admin_client.get(path + '/timeline').json()] == ['observation']


def test_routes_scope_diaries_and_events_to_patient(admin_client, patient, db_session, account):
    from crud.patients import create_patient
    other = create_patient(db_session, {'first_name': 'Second', 'last_name': 'Patient', 'account_id': account.id})
    _, path = start(admin_client, patient)
    _, other_path = start(admin_client, other)
    event = observe(admin_client, path)
    assert admin_client.get(path.replace(f'/patients/{patient.id}/', f'/patients/{other.id}/') + '/timeline').status_code == 404
    assert admin_client.get(path.replace(f'/patients/{patient.id}/', f'/patients/{other.id}/') + '/day').status_code == 404
    assert admin_client.delete(other_path + '/events/' + str(event['id'])).status_code == 404
    invalid = {'request_id': str(uuid4()), 'label': 'Questionable event', 'observed_at': '2020-01-01T00:00:00Z'}
    assert admin_client.post(path + '/events', json=invalid).status_code == 422
    assert admin_client.post(path + '/events', json={**invalid, 'observed_at': '2026-01-17T04:10:00'}).status_code == 422


def test_diary_requires_clinical_read_access(limited_client, patient):
    assert limited_client.get(f'/api/patients/{patient.id}/diaries').status_code == 403


def test_patient_grant_controls_recording_and_requires_unlocked_session(
        limited_client, limited_user, db_session, patient, account):
    from crud.users import get_role_by_name
    from routes.auth import create_access_token
    from schemas.patient import AccessLevel, PatientAccess

    base = f'/api/patients/{patient.id}/diaries'
    limited_user.roles.append(get_role_by_name(db_session, 'caregiver'))
    db_session.commit()
    assert limited_client.get(base).status_code == 404
    grant = PatientAccess(patient_id=patient.id, user_id=limited_user.id,
                          granted_at=datetime.utcnow(), access_level=AccessLevel.VIEWER)
    db_session.add(grant)
    db_session.commit()
    assert limited_client.get(base).json()['can_write'] is False
    assert limited_client.post(base, json=FORM).status_code == 403
    grant.access_level = AccessLevel.CAREGIVER
    db_session.commit()
    _, path = start(limited_client, patient)
    observe(limited_client, path)
    token = create_access_token(user=limited_user, account=account, auth_level='full', read_restricted=True)
    limited_client.headers.update({'Authorization': f'Bearer {token}'})
    assert limited_client.get(path + '/timeline').status_code == 403
    assert limited_client.get(path + '/day').status_code == 403


def test_diary_day_uses_study_bounds_on_the_repeated_hour(admin_client, db_session, patient):
    from schemas.pulse_ox_data import PulseOxData

    start_at = datetime(2026, 11, 1, 5, 45, tzinfo=timezone.utc)
    end_at = start_at + timedelta(minutes=30)
    base = f'/api/patients/{patient.id}/diaries'
    response = admin_client.post(base, json={**FORM, 'starts_at': start_at.isoformat(), 'ends_at': end_at.isoformat()})
    diary_id = response.json()['id']
    for ts in [start_at - timedelta(seconds=1), start_at, end_at, end_at + timedelta(seconds=1)]:
        db_session.add(PulseOxData(patient_id=patient.id, timestamp=ts, spo2=98, created_at=ts))
    db_session.flush()
    day = admin_client.get(f'{base}/{diary_id}/day?target_date=2026-11-23').json()
    assert day['first_day'] == day['last_day'] == day['date'] == '2026-11-01'
    assert datetime.fromisoformat(day['day_end']) - datetime.fromisoformat(day['day_start']) == timedelta(hours=25)
    assert [datetime.fromisoformat(p['ts']) for p in day['pulse_ox']] == [start_at, end_at]
    assert all(p['sample_offsets_ms']['spo2'] == [0, 0] for p in day['pulse_ox'])


def test_diary_day_honors_clinical_permissions(admin_client, limited_user, account, db_session, patient):
    from crud.users import get_role_by_name
    from routes.auth import create_access_token
    from schemas.nutrition_output import NutritionOutput
    from schemas.patient import AccessLevel, PatientAccess
    from schemas.pulse_ox_data import PulseOxData

    _, path = start(admin_client, patient)
    limited_user.roles.append(get_role_by_name(db_session, 'monitor'))
    db_session.add(PatientAccess(patient_id=patient.id, user_id=limited_user.id,
                                 granted_at=datetime.utcnow(), access_level=AccessLevel.VIEWER))
    db_session.add(NutritionOutput(patient_id=patient.id, output_type='urine', occurred_at=AT))
    db_session.add(PulseOxData(patient_id=patient.id, timestamp=AT, spo2=97, created_at=AT))
    db_session.commit()
    url = path + '/day?target_date=2026-01-16'  # AT is 11:10 PM in New York.
    assert len(admin_client.get(url).json()['nutrition_output']) == 1
    token = create_access_token(user=limited_user, account=account, auth_level='full')
    day = admin_client.get(url, headers={'Authorization': f'Bearer {token}'}).json()
    assert len(day['pulse_ox']) == 1
    assert day['nutrition_output'] == []
