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
"""Grace-period doses (crud/dose_grace.py): a missed dose stays on the
schedule, actionable, until it is given or its grace runs out."""
from datetime import datetime, timedelta, timezone

import pytest

from crud.dose_grace import find_grace_period_doses, grace_hours_for, merge_grace_rows
from crud.medications import add_medication, add_medication_schedule
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog

# Friday 2026-09-04 15:00Z. Local (America/New_York, EDT) day started 04:00Z.
NOW = datetime(2026, 9, 4, 15, 0, tzinfo=timezone.utc)
DAY_START = datetime(2026, 9, 4, 4, 0, tzinfo=timezone.utc)
LONG_AGO = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _schedule(db, patient, cron, grace=None, created_at=LONG_AGO, med_kw=None):
    med_id = add_medication(db, "Ojemda", quantity=30, quantity_unit="tablets",
                            patient_id=patient.id, **(med_kw or {}))
    sid = add_medication_schedule(db, med_id, cron, description="weekly", dose_amount=1,
                                  patient_id=patient.id, grace_period_hours=grace)
    sched = db.get(MedicationSchedule, sid)
    sched.created_at = created_at
    db.commit()
    return med_id, sid


def _log(db, med_id, sid, patient, scheduled_time, dose=1, administered_at=None):
    log = MedicationLog(
        medication_id=med_id, patient_id=patient.id, schedule_id=sid,
        administered_at=administered_at or scheduled_time, scheduled_time=scheduled_time,
        dose_amount=dose, is_scheduled=True, created_at=NOW,
    )
    db.add(log)
    db.commit()
    return log


def test_default_grace_is_sixty_percent_of_the_gap():
    a = datetime(2026, 9, 1, 14, tzinfo=timezone.utc)
    assert grace_hours_for(None, a, a + timedelta(days=7)) == pytest.approx(100.8)
    assert grace_hours_for(None, a, a + timedelta(days=1)) == pytest.approx(14.4)
    assert grace_hours_for(48, a, a + timedelta(days=7)) == 48.0


def test_weekly_dose_three_days_late_is_still_in_grace(db_session, patient):
    # Tuesday 14:00Z fired 2026-09-01; three days and an hour before NOW.
    med_id, sid = _schedule(db_session, patient, "0 14 * * 2")
    rows = find_grace_period_doses(db_session, patient.id, before_utc=DAY_START, now_utc=NOW)
    assert [r["schedule_id"] for r in rows] == [sid]
    row = rows[0]
    assert row["in_grace"] is True
    assert row["medication_id"] == med_id
    assert row["scheduled_time"] == datetime(2026, 9, 1, 14, tzinfo=timezone.utc)
    assert row["grace_hours"] == pytest.approx(100.8)
    assert row["grace_expires_at"] == row["scheduled_time"] + timedelta(hours=100.8)
    assert row["overdue_minutes"] == 3 * 1440 + 60
    assert row["completed"] is False


def test_given_dose_is_not_overdue(db_session, patient):
    med_id, sid = _schedule(db_session, patient, "0 14 * * 2")
    _log(db_session, med_id, sid, patient, datetime(2026, 9, 1, 14, tzinfo=timezone.utc))
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []


def test_skipped_dose_is_not_overdue(db_session, patient):
    med_id, sid = _schedule(db_session, patient, "0 14 * * 2")
    _log(db_session, med_id, sid, patient, datetime(2026, 9, 1, 14, tzinfo=timezone.utc), dose=0)
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []


def test_administration_near_the_firing_counts_without_scheduled_time(db_session, patient):
    med_id, sid = _schedule(db_session, patient, "0 14 * * 2")
    log = MedicationLog(
        medication_id=med_id, patient_id=patient.id, schedule_id=sid,
        administered_at=datetime(2026, 9, 1, 16, 30, tzinfo=timezone.utc), scheduled_time=None,
        dose_amount=1, is_scheduled=True, created_at=NOW,
    )
    db_session.add(log)
    db_session.commit()
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []


def test_expired_grace_is_plain_missed(db_session, patient):
    # Sunday 14:00Z fired 2026-08-30: five days ago, past the ~4.2 day grace.
    _schedule(db_session, patient, "0 14 * * 0")
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []


def test_override_shortens_or_extends_the_grace(db_session, patient):
    _schedule(db_session, patient, "0 14 * * 2", grace=48)
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []

    _, sid = _schedule(db_session, patient, "0 14 * * 0", grace=200)
    rows = find_grace_period_doses(db_session, patient.id, DAY_START, NOW)
    assert [r["schedule_id"] for r in rows] == [sid]
    assert rows[0]["grace_hours"] == 200.0


def test_next_firing_due_supersedes_the_older_one(db_session, patient):
    # Daily 08:00Z with a 30h override: yesterday's firing would run until
    # 14:00Z today, but today's 08:00Z firing has already come due and takes
    # precedence. Today's own firing is not this function's job (it is on the
    # day the caller shows), so nothing comes back.
    _schedule(db_session, patient, "0 8 * * *", grace=30)
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []


def test_daily_default_grace_expires_before_the_next_day(db_session, patient):
    # 60% of 24h is 14.4h: yesterday 08:00Z lapsed at 22:24Z yesterday.
    _schedule(db_session, patient, "0 8 * * *")
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []


def test_no_history_before_the_schedule_existed(db_session, patient):
    _schedule(db_session, patient, "0 14 * * 2", created_at=datetime(2026, 9, 2, tzinfo=timezone.utc))
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []


def test_no_history_before_the_medication_started(db_session, patient):
    _schedule(db_session, patient, "0 14 * * 2",
              med_kw={"start_date": datetime(2026, 9, 3, tzinfo=timezone.utc)})
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []


def test_irregular_cadence_uses_the_gap_to_the_next_firing(db_session, patient):
    # Mon/Wed/Fri 14:00Z. Wednesday 2026-09-02 fired 49h before NOW; its gap
    # to Friday is 48h, so the grace is 28.8h and it has lapsed. Monday's gap
    # to Wednesday is also 48h, lapsed long ago. Nothing is in grace.
    _schedule(db_session, patient, "0 14 * * 1,3,5")
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []

    # Move "now" to Thursday 02:00Z: Wednesday's dose is 12h late, inside 28.8h.
    thursday = datetime(2026, 9, 3, 2, 0, tzinfo=timezone.utc)
    rows = find_grace_period_doses(db_session, patient.id,
                                   before_utc=datetime(2026, 9, 3, 4, 0, tzinfo=timezone.utc),
                                   now_utc=thursday)
    assert [r["scheduled_time"] for r in rows] == [datetime(2026, 9, 2, 14, tzinfo=timezone.utc)]
    assert rows[0]["grace_hours"] == pytest.approx(28.8)


def test_inactive_schedule_and_other_patient_are_ignored(db_session, patient, account):
    from crud.patients import create_patient
    other = create_patient(db_session, {"first_name": "Other", "last_name": "One",
                                        "account_id": account.id, "is_active": True})
    db_session.commit()
    _schedule(db_session, other, "0 14 * * 2")
    _, sid = _schedule(db_session, patient, "0 14 * * 2")
    db_session.get(MedicationSchedule, sid).active = False
    db_session.commit()
    assert find_grace_period_doses(db_session, patient.id, DAY_START, NOW) == []
    assert find_grace_period_doses(db_session, None, DAY_START, NOW) == []


def test_merge_annotates_a_row_the_caller_already_shows():
    t = datetime(2026, 9, 3, 14, tzinfo=timezone.utc)
    rows = [
        {"schedule_id": 1, "scheduled_time": t.isoformat(), "completed": False},
        {"schedule_id": 2, "scheduled_time": t, "completed": True},
    ]
    grace = [
        {"schedule_id": 1, "scheduled_time": t, "grace_hours": 100.8, "grace_expires_at": t, "overdue_minutes": 60},
        {"schedule_id": 2, "scheduled_time": t, "grace_hours": 100.8, "grace_expires_at": t, "overdue_minutes": 60},
        {"schedule_id": 3, "scheduled_time": t - timedelta(days=2), "grace_hours": 1, "grace_expires_at": t, "overdue_minutes": 1},
    ]
    merge_grace_rows(rows, grace)
    assert rows[0]["in_grace"] is True and rows[0]["overdue_minutes"] == 60
    assert "in_grace" not in rows[1]          # completed rows are never overdue
    assert [r["schedule_id"] for r in rows] == [1, 2, 3]


# --- API surface -------------------------------------------------------------

def _make_med(admin_client, patient):
    return admin_client.post("/api/add/medication", json={
        "name": "Ojemda", "concentration": "100mg", "quantity": 30,
        "quantity_unit": "tablets", "instructions": "weekly",
        "start_date": "2026-01-01", "is_patient_specific": True,
        "admin_patient_id": patient.id,
    }).json()["id"]


def _cron_at(dt_utc):
    """A weekly cron firing at this UTC instant's weekday and wall-clock."""
    dow = (dt_utc.weekday() + 1) % 7  # cron: 0 = Sunday
    return f"{dt_utc.minute} {dt_utc.hour} * * {dow}"


def _backdate(db_session, sid):
    db_session.get(MedicationSchedule, sid).created_at = LONG_AGO
    db_session.commit()


def test_schedule_api_round_trips_the_override(admin_client, patient):
    med_id = _make_med(admin_client, patient)
    r = admin_client.post(f"/api/add/schedule/{med_id}", json={
        "cron_expression": "0 14 * * 2", "description": "Tue 10:00",
        "dose_amount": 1, "patient_id": patient.id, "grace_period_hours": 72,
    })
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    got = admin_client.get(f"/api/medications/{med_id}/schedules").json()["schedules"]
    assert got[0]["grace_period_hours"] == 72

    assert admin_client.put(f"/api/schedules/{sid}", json={"grace_period_hours": None}).status_code == 200
    got = admin_client.get(f"/api/medications/{med_id}/schedules").json()["schedules"]
    assert got[0]["grace_period_hours"] is None

    bad = admin_client.post(f"/api/add/schedule/{med_id}", json={
        "cron_expression": "0 14 * * 2", "description": "x", "dose_amount": 1,
        "patient_id": patient.id, "grace_period_hours": 0,
    })
    assert bad.status_code == 422


def test_daily_schedule_carries_an_in_grace_dose_from_days_ago(admin_client, patient, db_session):
    from utils.datetime_utils import utc_now
    med_id = _make_med(admin_client, patient)
    firing = (utc_now() - timedelta(days=3)).replace(second=0, microsecond=0)
    sid = admin_client.post(f"/api/add/schedule/{med_id}", json={
        "cron_expression": _cron_at(firing), "description": "weekly",
        "dose_amount": 1, "patient_id": patient.id,
    }).json()["id"]
    _backdate(db_session, sid)

    data = admin_client.get(f"/api/schedule/daily?patient_id={patient.id}").json()
    grace = [m for m in data["medications"] if m["in_grace"]]
    assert len(grace) == 1
    row = grace[0]
    assert row["schedule_id"] == sid
    assert row["scheduled_time"].startswith(firing.strftime("%Y-%m-%dT%H:%M"))
    assert row["completed"] is False and row["is_yesterday"] is False
    assert row["overdue_minutes"] >= 3 * 1440
    assert datetime.fromisoformat(row["grace_expires_at"]) > utc_now()
    # The plain rows do not grow the new fields' truthy values.
    assert all(m["grace_expires_at"] is None for m in data["medications"] if not m["in_grace"])

    # Giving it takes it off the schedule.
    ok = admin_client.post("/api/schedule/complete/medication", json={
        "schedule_id": sid, "scheduled_time": row["scheduled_time"],
        "patient_id": patient.id, "dose_amount": 1, "early_override": True,
    })
    assert ok.status_code == 200, ok.text
    data = admin_client.get(f"/api/schedule/daily?patient_id={patient.id}").json()
    assert [m for m in data["medications"] if m["in_grace"]] == []

    # A past day is history: no grace rows there.
    past = (utc_now() - timedelta(days=1)).date().isoformat()
    data = admin_client.get(f"/api/schedule/daily?patient_id={patient.id}&target_date={past}").json()
    assert all(not m["in_grace"] for m in data["medications"])


def test_daily_schedule_annotates_yesterdays_row_when_prior_day_is_shown(admin_client, patient, db_session):
    from utils.datetime_utils import resolve_tz_for_patient, local_day_bounds
    med_id = _make_med(admin_client, patient)
    bounds = local_day_bounds(resolve_tz_for_patient(db_session, patient.id))
    firing = bounds["yesterday_start_utc"] + timedelta(hours=12)
    sid = admin_client.post(f"/api/add/schedule/{med_id}", json={
        "cron_expression": _cron_at(firing), "description": "weekly",
        "dose_amount": 1, "patient_id": patient.id,
    }).json()["id"]
    _backdate(db_session, sid)

    data = admin_client.get(
        f"/api/schedule/daily?patient_id={patient.id}&include_prior_day=true"
    ).json()
    rows = [m for m in data["medications"] if m["schedule_id"] == sid]
    assert len(rows) == 1, rows          # annotated, not duplicated
    assert rows[0]["is_yesterday"] is True
    assert rows[0]["in_grace"] is True


def test_medication_schedules_daily_counts_grace_dose_as_overdue(admin_client, patient, db_session):
    from utils.datetime_utils import utc_now
    from crud.medications import get_medication_schedule_counts
    med_id = _make_med(admin_client, patient)
    firing = (utc_now() - timedelta(days=3)).replace(second=0, microsecond=0)
    sid = admin_client.post(f"/api/add/schedule/{med_id}", json={
        "cron_expression": _cron_at(firing), "description": "weekly",
        "dose_amount": 1, "patient_id": patient.id,
    }).json()["id"]
    _backdate(db_session, sid)

    data = admin_client.get(f"/api/schedules/daily?patient_id={patient.id}").json()
    rows = [m for m in data["scheduled_medications"] if m["schedule_id"] == sid]
    assert len(rows) == 1
    assert rows[0]["status"] == "missed" and rows[0]["is_completed"] is False
    assert rows[0]["in_grace"] is True

    counts = get_medication_schedule_counts(db_session, patient_id=patient.id)
    assert counts["overdue"] == 1
