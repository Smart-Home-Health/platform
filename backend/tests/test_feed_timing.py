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
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from crud import scheduling
from crud.feed_start_overrides import StartOverrideRequest, save_start_override
from crud.nutrition import update_nutrition_intake
from crud.schedule_manager import ManagerSettings, save_settings
from crud.schedule_status import get_schedule_status, schedule_badge_counts
from crud.scheduling import get_scheduled_nutrition
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_flush_followup import NutritionFlushFollowup
from schemas.nutrition_schedule import NutritionSchedule
from utils.datetime_utils import local_day_bounds, make_utc


TZ = ZoneInfo("America/New_York")


def at(day, hour, minute=0):
    return make_utc(datetime(2026, 2, day, hour, minute, tzinfo=TZ))


def schedule(db, patient, name, instant, kind="meal"):
    row = NutritionSchedule(patient_id=patient.id, name=name, schedule_type=kind,
                            cron_expression=f"{instant.minute} {instant.hour} * * {instant.isoweekday()}",
                            default_item_name=name, default_amount=100, default_amount_unit="ml")
    db.add(row)
    db.flush()
    return row


def record(db, patient, feed, original, actual, duration=None):
    row = NutritionIntake(patient_id=patient.id, schedule_id=feed.id, scheduled_time=original,
                          consumed_at=actual, amount=100, amount_unit="ml", item_type="tube_feed",
                          item_name=feed.name, duration_minutes=duration, created_at=actual, updated_at=actual)
    db.add(row)
    db.flush()
    return row


def test_late_start_moves_only_selected_rows_and_keeps_log_identity(db_session, patient, admin_client, monkeypatch):
    db = db_session
    lunch = schedule(db, patient, "Lunch", at(4, 12))
    water = schedule(db, patient, "Water", at(4, 14), "hydration")
    dinner = schedule(db, patient, "Dinner", at(4, 15))
    overnight = schedule(db, patient, "Overnight", at(4, 16))
    settings = ManagerSettings(feeds_enabled=True, min_gap_minutes=120,
                               feed_schedule_ids=[lunch.id, dinner.id, overnight.id],
                               overnight_schedule_id=overnight.id, overnight_target="16:30")
    save_settings(db, patient.id, settings, None)
    actual = at(4, 13, 53)
    lunch_log = record(db, patient, lunch, at(4, 12), actual, duration=150)
    now = at(4, 15, 30)
    day = now.astimezone(TZ).date()
    def board():
        return {r['name']: r for r in get_scheduled_nutrition(db, day, patient.id, tz=TZ, as_of=now, strict=True)}
    rows = board()
    assert rows['Lunch']['effective_time'] == actual
    assert 'managed_feed' not in rows['Water']
    assert rows['Dinner']['scheduled_time'] == at(4, 15)
    assert rows['Dinner']['effective_time'] == at(4, 16, 23)
    assert rows['Overnight']['effective_time'] == at(4, 18, 23)
    assert rows['Overnight']['overnight_delayed']

    snapshot = get_schedule_status(db, patient.id, now, sections=['nutrition_counts'])
    assert [i['name'] for i in snapshot['upcoming']] == ['Dinner']
    assert not snapshot['due_now']
    assert schedule_badge_counts(snapshot, ['nutrition_counts'])['nutrition_due_now'] == 0
    monkeypatch.setattr(scheduling, 'local_day_bounds', lambda tz: local_day_bounds(tz, now))
    assert scheduling.get_nutrition_schedule_counts(db, patient.id, tz=TZ) == {'due': 1, 'overdue': 1}
    assert scheduling.get_nutrition_due_now_late_counts(db, patient.id, tz=TZ) == {'due_now': 0, 'late': 1}

    response = admin_client.post('/api/schedule/complete/nutrition', json={
        'patient_id': patient.id, 'schedule_id': dinner.id, 'scheduled_time': at(4, 15).isoformat(),
        'completed_at': at(4, 16, 23).isoformat()})
    assert response.json()['success']
    logged = db.get(NutritionIntake, response.json()['intake_id'])
    assert logged.scheduled_time == at(4, 15)
    assert logged.consumed_at == at(4, 16, 23)
    assert board()['Dinner']['completed']
    logged.voided_at = lunch_log.voided_at = now
    db.flush()
    undone = board()
    assert not undone['Dinner']['completed']
    assert not undone['Lunch']['completed']
    assert undone['Lunch']['effective_time'] == at(4, 12)
    assert undone['Dinner']['effective_time'] == now + timedelta(minutes=120)


def test_previous_evening_forecast_then_actual_carries_across_midnight(db_session, patient):
    db = db_session
    dinner = schedule(db, patient, "Dinner", at(4, 19))
    overnight = schedule(db, patient, "Overnight", at(4, 22))
    morning = schedule(db, patient, "Early morning", at(5, 1))
    settings = dict(feeds_enabled=True, min_gap_minutes=120, feed_schedule_ids=[dinner.id, overnight.id, morning.id],
                    overnight_schedule_id=overnight.id, overnight_target="23:15")
    record(db, patient, dinner, at(4, 19), at(4, 23))
    now = at(4, 23, 15)
    def row(day, name):
        return next(r for r in get_scheduled_nutrition(db, day.astimezone(TZ).date(), patient.id, tz=TZ,
                    as_of=now, feed_settings=settings, strict=True) if r['name'] == name)
    night = row(now, 'Overnight')
    assert night['effective_time'] == at(5, 1)
    assert night['overnight_target_at'] == at(4, 23, 15)
    assert night['overnight_delayed']
    assert row(at(5, 0), 'Early morning')['effective_time'] == at(5, 3)
    record(db, patient, overnight, at(4, 22), at(5, 1, 30), duration=180)
    now = at(5, 2)
    assert row(now, 'Early morning')['effective_time'] == at(5, 4, 30)


def test_move_once_then_correct_actual_siblings_and_pending_flush(db_session, patient):
    db = db_session
    lunch = schedule(db, patient, "Lunch", at(4, 12))
    dinner = schedule(db, patient, "Dinner", at(4, 15))
    settings = ManagerSettings(feeds_enabled=True, min_gap_minutes=90, feed_schedule_ids=[lunch.id, dinner.id])
    save_settings(db, patient.id, settings, None)
    change = StartOverrideRequest(schedule_id=lunch.id, scheduled_time=at(4, 12), earliest_start=at(4, 14))
    save_start_override(db, patient.id, change, None)
    def board():
        return {r['name']: r for r in get_scheduled_nutrition(db, at(4, 12).astimezone(TZ).date(), patient.id,
                                                             tz=TZ, as_of=at(4, 13), strict=True)}
    moved = board()
    assert moved['Lunch']['effective_time'] == moved['Lunch']['start_override_at'] == at(4, 14)
    assert moved['Lunch']['timing_reason'] == 'Moved for this day.'
    assert moved['Dinner']['effective_time'] == at(4, 15, 30)
    change.earliest_start = None
    save_start_override(db, patient.id, change, None)
    assert board()['Lunch']['effective_time'] == at(4, 12)
    first = record(db, patient, lunch, at(4, 12), at(4, 12, 25), duration=95)
    second = record(db, patient, lunch, at(4, 12), at(4, 12, 25))
    first.event_group_id = second.event_group_id = 'example-lunch-group'
    flush = NutritionFlushFollowup(patient_id=patient.id, schedule_id=lunch.id,
                                  feed_scheduled_time=at(4, 12), source_event_group_id=first.event_group_id,
                                  item_name='Water', amount=20, amount_unit='ml', due_at=at(4, 14))
    db.add(flush)
    db.flush()
    update_nutrition_intake(db, first.id, {'consumed_at': at(4, 14, 20)})
    assert second.consumed_at == at(4, 14, 20)
    assert flush.due_at == board()['Dinner']['effective_time'] == at(4, 15, 55)
    flush.status = 'completed'
    db.flush()
    update_nutrition_intake(db, first.id, {'duration_minutes': 110})
    assert flush.due_at == at(4, 15, 55)
    assert board()['Dinner']['effective_time'] == at(4, 16, 10)


def test_prior_overnight_reminder_retires_after_next_care_day_actually_starts(db_session, patient, monkeypatch):
    db = db_session
    dinner = schedule(db, patient, 'Dinner', at(4, 20))
    overnight = schedule(db, patient, 'Overnight', at(4, 23))
    morning = schedule(db, patient, 'Morning', at(5, 2))
    settings = ManagerSettings(feeds_enabled=True, min_gap_minutes=120,
                               feed_schedule_ids=[dinner.id, overnight.id, morning.id])
    save_settings(db, patient.id, settings, None)
    record(db, patient, dinner, at(4, 20), at(4, 23))
    now = at(5, 1, 10)
    monkeypatch.setattr(scheduling, 'local_day_bounds', lambda tz: local_day_bounds(tz, now))
    def alerts():
        return get_schedule_status(db, patient.id, now=now, sections=['nutrition_counts'])
    assert [item['name'] for item in alerts()['due_now']] == ['Overnight']
    assert scheduling.get_nutrition_schedule_counts(db, patient.id, TZ)['due'] == 1
    now = at(5, 3, 30)
    record(db, patient, morning, at(5, 2), now)
    assert not alerts()['late']
    assert scheduling.get_nutrition_schedule_counts(db, patient.id, TZ)['due'] == 0
    history = get_scheduled_nutrition(db, at(4, 12).astimezone(TZ).date(), patient.id, tz=TZ, as_of=now)
    old = next(row for row in history if row['name'] == 'Overnight')
    assert not old['completed'] and old['reminder_superseded']


def test_invalid_legacy_recurrences_keep_other_nutrition_reminders(db_session, patient, monkeypatch):
    now = at(4, 12)
    meal = schedule(db_session, patient, 'Lunch', now)
    bad_rules = [
        NutritionSchedule(patient_id=patient.id, name=name, schedule_type='meal', cron_expression=expression)
        for name, expression in [('Obsolete syntax', 'broken'), ('Impossible day', '0 0 31 2 *')]
    ]
    db_session.add_all(bad_rules)
    db_session.flush()
    monkeypatch.setattr(scheduling, 'local_day_bounds', lambda tz: local_day_bounds(tz, now))

    def assert_lunch_due():
        snapshot = get_schedule_status(db_session, patient.id, now, sections=['nutrition_counts'])
        assert [item['name'] for item in snapshot['due_now']] == ['Lunch']
        assert scheduling.get_nutrition_schedule_counts(db_session, patient.id, TZ) == {'due': 1, 'overdue': 0}

    assert_lunch_due()
    save_settings(db_session, patient.id, ManagerSettings(
        feeds_enabled=True, min_gap_minutes=60, feed_schedule_ids=[meal.id, *(row.id for row in bad_rules)]), None)
    assert_lunch_due()
