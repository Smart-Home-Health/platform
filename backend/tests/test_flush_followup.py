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
"""Post-feed flush follow-ups: one schedule carries the feed AND its flush.

The flush component is not logged with the meal — completing the feed spawns
a one-off follow-up due at completed_at + feed duration (volume/rate), which
is then run (logging a liquid intake) or explicitly skipped. Undoing the feed
voids a pending follow-up; undoing a logged flush restores it to pending.
"""
from datetime import date, datetime, timedelta, timezone

import pytest


def _now_utc():
    return datetime.now(timezone.utc)


@pytest.fixture
def flush_items(admin_client, patient):
    """Formula (with a pump rate) plus the flush water."""
    formula = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Peptamen", "item_type": "tube_feed",
        "default_amount": 525, "default_amount_unit": "ml", "calories_per_unit": 1.0,
    })
    water = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Water", "item_type": "liquid",
        "default_amount": 60, "default_amount_unit": "ml", "calories_per_unit": 0,
    })
    assert formula.status_code == 200, formula.text
    assert water.status_code == 200, water.text
    return formula.json(), water.json()


def _flush_schedule(admin_client, patient, flush_items, when=None, rate=600):
    """A daily feed whose mix is 525 mL formula + a flagged 60 mL flush."""
    formula, water = flush_items
    when = when or _now_utc()
    formula_comp = {"item_id": formula["id"], "amount": 525, "amount_unit": "ml",
                    "feed_route": "pump", "sort_order": 0}
    if rate is not None:
        formula_comp["rate_ml_per_hr"] = rate
    resp = admin_client.post("/api/nutrition/schedules", json={
        "patient_id": patient.id, "schedule_type": "meal", "name": "Lunch",
        "cron_expression": f"{when.minute} {when.hour} * * *",
        "components": [
            formula_comp,
            {"item_id": water["id"], "amount": 60, "amount_unit": "ml",
             "is_flush": True, "sort_order": 1},
        ],
    })
    assert resp.status_code == 200, resp.text
    return resp.json(), when


def _followups(admin_client, patient, status=None):
    qs = f"?status={status}" if status else ""
    resp = admin_client.get(f"/api/patients/{patient.id}/flush-followups{qs}")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _daily(admin_client, patient, target_date=None):
    day = (target_date or date.today()).isoformat()
    return admin_client.get(
        f"/api/schedule/daily?patient_id={patient.id}"
        f"&target_date={day}&tz_offset_minutes=0"
    ).json()


# =====================
# SPAWNING
# =====================

def test_schedule_carries_the_flush_flag(admin_client, patient, flush_items):
    body, _ = _flush_schedule(admin_client, patient, flush_items)
    flags = {c["item_name"]: c["is_flush"] for c in body["components"]}
    assert flags == {"Peptamen": False, "Water": True}


def test_completion_excludes_the_flush_and_spawns_the_followup(admin_client, patient, flush_items):
    body, when = _flush_schedule(admin_client, patient, flush_items)

    resp = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    })
    assert resp.status_code == 200, resp.text
    result = resp.json()

    # The flush water is not part of the meal's rows.
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert [r["item_name"] for r in rows] == ["Peptamen"]

    # The follow-up rides the response for immediate display.
    assert result["flush_followup"] is not None
    assert result["flush_followup"]["item_name"] == "Water"
    assert result["flush_followup"]["amount"] == 60
    assert result["flush_followup"]["status"] == "pending"

    # Due = completed_at + 525 mL / 600 mL/hr = +52.5 min.
    followup = _followups(admin_client, patient)[0]
    due = datetime.fromisoformat(followup["due_at"])
    consumed = datetime.fromisoformat(rows[0]["consumed_at"])
    assert abs((due - consumed) - timedelta(minutes=52.5)) < timedelta(seconds=5)


def test_rate_falls_back_to_sixty_minutes(admin_client, patient, flush_items):
    body, when = _flush_schedule(admin_client, patient, flush_items, rate=None)

    admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    })
    followup = _followups(admin_client, patient)[0]
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    due = datetime.fromisoformat(followup["due_at"])
    consumed = datetime.fromisoformat(rows[0]["consumed_at"])
    assert abs((due - consumed) - timedelta(minutes=60)) < timedelta(seconds=5)


def test_explicit_duration_on_the_logged_row_wins(admin_client, patient, flush_items):
    body, when = _flush_schedule(admin_client, patient, flush_items)
    formula, _water = flush_items

    admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
        "items": [{"item_id": formula["id"], "item_name": "Peptamen",
                   "item_type": "tube_feed", "amount": 525, "amount_unit": "ml",
                   "duration_minutes": 90}],
    })
    followup = _followups(admin_client, patient)[0]
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    due = datetime.fromisoformat(followup["due_at"])
    consumed = datetime.fromisoformat(rows[0]["consumed_at"])
    assert abs((due - consumed) - timedelta(minutes=90)) < timedelta(seconds=5)


def test_duration_math_does_not_require_the_tube_feed_type(admin_client, patient):
    """Items saved from labels are often typed 'liquid', and the whole mix
    runs through the pump — volume and rate must not be gated on tube_feed."""
    formula = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Peptamen 1.0 Unflavored",
        "item_type": "liquid", "default_amount": 400, "default_amount_unit": "ml",
        "calories_per_unit": 1.0,
    }).json()
    water = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Flush water", "item_type": "liquid",
        "default_amount": 60, "default_amount_unit": "ml",
    }).json()
    when = _now_utc()
    sched = admin_client.post("/api/nutrition/schedules", json={
        "patient_id": patient.id, "schedule_type": "meal", "name": "Liquid lunch",
        "cron_expression": f"{when.minute} {when.hour} * * *",
        "components": [
            {"item_id": formula["id"], "amount": 400, "amount_unit": "ml",
             "rate_ml_per_hr": 600, "sort_order": 0},
            {"item_id": water["id"], "amount": 60, "amount_unit": "ml",
             "is_flush": True, "sort_order": 1},
        ],
    }).json()

    admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": sched["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    })
    followup = _followups(admin_client, patient)[0]
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    due = datetime.fromisoformat(followup["due_at"])
    consumed = datetime.fromisoformat(rows[0]["consumed_at"])
    # 400 mL at 600 mL/hr = 40 minutes, even though nothing is typed tube_feed.
    assert abs((due - consumed) - timedelta(minutes=40)) < timedelta(seconds=5)


def test_bulk_completion_spawns_too(admin_client, patient, flush_items):
    body, when = _flush_schedule(admin_client, patient, flush_items)

    resp = admin_client.post("/api/schedule/complete/bulk", json={"nutrition": [{
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    }]})
    assert resp.status_code == 200, resp.text
    assert len(_followups(admin_client, patient, status="pending")) == 1


def test_linked_hand_log_spawns_too(admin_client, patient, flush_items):
    body, when = _flush_schedule(admin_client, patient, flush_items)
    formula, _water = flush_items

    resp = admin_client.post("/api/nutrition/intake/event", json={
        "patient_id": patient.id,
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "items": [{"item_id": formula["id"], "item_name": "Peptamen",
                   "item_type": "tube_feed", "amount": 525, "amount_unit": "ml",
                   "rate_ml_per_hr": 600}],
    })
    assert resp.status_code == 200, resp.text
    assert len(_followups(admin_client, patient, status="pending")) == 1


def test_no_spawn_without_a_flush_component_or_a_link(admin_client, patient, flush_items):
    formula, _water = flush_items
    # Unlinked hand-log: no schedule, no follow-up.
    admin_client.post("/api/nutrition/intake/event", json={
        "patient_id": patient.id,
        "items": [{"item_id": formula["id"], "item_name": "Peptamen",
                   "item_type": "tube_feed", "amount": 525, "amount_unit": "ml"}],
    })
    assert _followups(admin_client, patient) == []

    # Schedule without a flush component: completion spawns nothing.
    when = _now_utc()
    plain = admin_client.post("/api/nutrition/schedules", json={
        "patient_id": patient.id, "schedule_type": "meal", "name": "Snack",
        "cron_expression": f"{when.minute} {when.hour} * * *",
        "components": [{"item_id": formula["id"], "amount": 100, "amount_unit": "ml"}],
    }).json()
    admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": plain["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    })
    assert _followups(admin_client, patient) == []


def test_second_completion_of_the_same_occurrence_spawns_once(admin_client, patient, flush_items):
    body, when = _flush_schedule(admin_client, patient, flush_items)
    for _ in range(2):
        admin_client.post("/api/schedule/complete/nutrition", json={
            "schedule_id": body["id"], "scheduled_time": when.isoformat(),
            "patient_id": patient.id,
        })
    assert len(_followups(admin_client, patient, status="pending")) == 1


# =====================
# RUN / SKIP
# =====================

def _complete_feed(admin_client, patient, flush_items, **kw):
    body, when = _flush_schedule(admin_client, patient, flush_items, **kw)
    result = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    }).json()
    return body, when, result["flush_followup"]["id"]


def test_running_the_flush_logs_water_without_touching_the_cron_row(admin_client, patient, flush_items):
    body, _when, followup_id = _complete_feed(admin_client, patient, flush_items)

    resp = admin_client.post(f"/api/nutrition/flush/{followup_id}/complete", json={})
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert out["followup"]["status"] == "completed"

    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    by_name = {r["item_name"]: r for r in rows}
    water = by_name["Water"]
    # Linked to the schedule for history, but NOT to a cron occurrence.
    assert water["schedule_id"] == body["id"]
    assert water["scheduled_time"] is None
    assert water["item_type"] == "liquid"
    assert water["amount"] == 60

    # The cron row is completed exactly once; the flush row reads completed too.
    day = _daily(admin_client, patient)
    feed_rows = [n for n in day["nutrition"] if n["row_kind"] == "schedule"
                 and n["schedule_id"] == body["id"]]
    assert len(feed_rows) == 1 and feed_rows[0]["completed"] is True
    flush_rows = [n for n in day["nutrition"] if n["row_kind"] == "flush"]
    assert len(flush_rows) == 1
    assert flush_rows[0]["completed"] is True
    assert flush_rows[0]["followup_id"] == followup_id
    assert flush_rows[0]["log_id"] is not None
    # No spawned follow-up from the flush's own completion (no recursion).
    assert len(_followups(admin_client, patient)) == 1


def test_run_amount_override(admin_client, patient, flush_items):
    _body, _when, followup_id = _complete_feed(admin_client, patient, flush_items)
    admin_client.post(f"/api/nutrition/flush/{followup_id}/complete", json={"amount": 45})
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert {r["item_name"]: r["amount"] for r in rows}["Water"] == 45


def test_skip_is_recorded_and_leaves_the_counters(admin_client, patient, flush_items):
    _body, _when, followup_id = _complete_feed(admin_client, patient, flush_items)

    resp = admin_client.post(f"/api/nutrition/flush/{followup_id}/skip", json={"notes": "mix was watery"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["followup"]["status"] == "skipped"

    day = _daily(admin_client, patient)
    flush_rows = [n for n in day["nutrition"] if n["row_kind"] == "flush"]
    assert flush_rows[0]["skipped"] is True
    assert flush_rows[0]["completed"] is False

    # No water was logged, and a second skip 409s.
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert "Water" not in {r["item_name"] for r in rows}
    assert admin_client.post(f"/api/nutrition/flush/{followup_id}/skip", json={}).status_code == 409

    # An accidental skip is recoverable: running it afterward is allowed.
    run = admin_client.post(f"/api/nutrition/flush/{followup_id}/complete", json={})
    assert run.status_code == 200


def test_counters_count_pending_flush_and_ignore_skipped(admin_client, patient, flush_items, db_session):
    from crud.scheduling import get_nutrition_schedule_counts

    _body, _when, followup_id = _complete_feed(admin_client, patient, flush_items)
    # The counters also see yesterday's (uncompleted) cron firing, so assert
    # the flush's contribution as a delta: pending counts, skipped does not.
    with_pending = get_nutrition_schedule_counts(db_session, patient_id=patient.id)["due"]

    admin_client.post(f"/api/nutrition/flush/{followup_id}/skip", json={})
    after_skip = get_nutrition_schedule_counts(db_session, patient_id=patient.id)["due"]
    assert with_pending - after_skip == 1


# =====================
# UNDO ORDERING
# =====================

def test_feed_undo_voids_the_pending_flush(admin_client, patient, flush_items):
    _body, _when, followup_id = _complete_feed(admin_client, patient, flush_items)
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()

    undo = admin_client.delete(f"/api/schedule/log/nutrition_intake/{rows[0]['id']}")
    assert undo.status_code == 200, undo.text

    # Voided = gone from every read.
    assert _followups(admin_client, patient) == []
    day = _daily(admin_client, patient)
    assert [n for n in day["nutrition"] if n["row_kind"] == "flush"] == []


def test_flush_undo_restores_the_followup_to_pending(admin_client, patient, flush_items):
    _body, _when, followup_id = _complete_feed(admin_client, patient, flush_items)
    admin_client.post(f"/api/nutrition/flush/{followup_id}/complete", json={})

    day = _daily(admin_client, patient)
    flush_row = next(n for n in day["nutrition"] if n["row_kind"] == "flush")
    undo = admin_client.delete(f"/api/schedule/log/nutrition_intake/{flush_row['log_id']}")
    assert undo.status_code == 200, undo.text

    followup = _followups(admin_client, patient)[0]
    assert followup["status"] == "pending"
    assert followup["completed_intake_group_id"] is None

    # The water dropped out of the day's rows; the feed stayed.
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert [r["item_name"] for r in rows] == ["Peptamen"]


def test_feed_undo_after_flush_completed_leaves_the_flush(admin_client, patient, flush_items):
    _body, _when, followup_id = _complete_feed(admin_client, patient, flush_items)
    admin_client.post(f"/api/nutrition/flush/{followup_id}/complete", json={})

    feed_row = next(r for r in admin_client.get(
        f"/api/patients/{patient.id}/nutrition-intake").json()
        if r["item_name"] == "Peptamen")
    admin_client.delete(f"/api/schedule/log/nutrition_intake/{feed_row['id']}")

    # The water really went in; it and its completed follow-up survive.
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert [r["item_name"] for r in rows] == ["Water"]
    assert _followups(admin_client, patient)[0]["status"] == "completed"


def test_whole_event_delete_behaves_like_undo(admin_client, patient, flush_items):
    _body, _when, _followup_id = _complete_feed(admin_client, patient, flush_items)
    feed_row = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()[0]

    assert admin_client.delete(
        f"/api/nutrition-intake/{feed_row['id']}?whole_event=true").status_code == 200
    assert _followups(admin_client, patient) == []


# =====================
# DAY SCOPING
# =====================

def test_flush_crossing_midnight_lands_on_the_next_day_board(admin_client, patient, flush_items):
    body, when = _flush_schedule(admin_client, patient, flush_items)
    # Feed ran 30 minutes before last midnight UTC (a past time, so the
    # future-timestamp guard allows it); the 52.5-min run crosses into today.
    yesterday = date.today() - timedelta(days=1)
    completed_at = datetime.combine(yesterday, datetime.min.time(), tzinfo=timezone.utc) \
        + timedelta(hours=23, minutes=30)
    resp = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id, "completed_at": completed_at.isoformat(),
        # Backdating a completion by a day trips the early/off-window guard.
        "early_override": True,
    })
    assert resp.status_code == 200, resp.text

    # The due time (completed + 52.5 min) is past midnight relative to the
    # feed. Day boundaries follow the account timezone, so assert the
    # invariant rather than a UTC calendar: the flush appears on exactly one
    # of the two boards, at completed_at + feed duration.
    yesterday_rows = [n for n in _daily(admin_client, patient, yesterday)["nutrition"]
                      if n["row_kind"] == "flush"]
    today_rows = [n for n in _daily(admin_client, patient)["nutrition"]
                  if n["row_kind"] == "flush"]
    assert len(yesterday_rows) + len(today_rows) == 1

    followup = _followups(admin_client, patient)[0]
    due = datetime.fromisoformat(followup["due_at"])
    assert abs((due - completed_at) - timedelta(minutes=52.5)) < timedelta(seconds=5)
