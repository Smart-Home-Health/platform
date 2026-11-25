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

from crud.schedule_manager import ManagerSettings, save_settings
from schemas.feed_start_override import FeedStartOverride
from schemas.nutrition_schedule import NutritionSchedule


def test_move_is_scoped_to_one_original_slot_then_can_be_cleared(db_session, admin_client, patient):
    db = db_session
    water = NutritionSchedule(patient_id=patient.id, name='Water', schedule_type='hydration',
                              cron_expression='0 20 * * *')
    db.add(water)
    db.commit()
    settings = ManagerSettings(feeds_enabled=True, feed_schedule_ids=[water.id], min_gap_minutes=90)
    save_settings(db, patient.id, settings, None)
    slot = datetime(2026, 11, 25, 20, tzinfo=timezone.utc)
    path = f'/api/schedule-manager/{patient.id}/feed-start'
    body = dict(schedule_id=water.id, scheduled_time=slot.isoformat(),
                earliest_start=(slot + timedelta(hours=2)).isoformat())
    assert admin_client.put(path, json=body).status_code == 200
    assert admin_client.put(path, json=body).status_code == 200
    row = db.query(FeedStartOverride).one()
    assert row.scheduled_at == slot and row.earliest_start == slot + timedelta(hours=2)
    assert water.cron_expression == '0 20 * * *'
    assert admin_client.put(path, json={**body, 'scheduled_time': (slot + timedelta(minutes=1)).isoformat()}).status_code == 422
    assert admin_client.put(path, json={**body, 'scheduled_time': slot.replace(tzinfo=None).isoformat()}).status_code == 422
    assert admin_client.put(path, json={**body, 'earliest_start': None}).status_code == 200
    assert db.query(FeedStartOverride).count() == 0
