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
"""Dynamic water budget: flagged spots fill what's left of the fluid goal.

A hydration schedule flagged fills_fluid_goal (and every pending flush
follow-up) has no fixed amount. Its suggestion is computed on read:
target − logged − expected-from-uncompleted-feeds, split across the
remaining spots proportionally to their nominal sizes, clamped to
[fluid_min_ml, fluid_max_ml] (max defaults to the nominal). Completion
without an explicit amount pours the suggestion.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest


def _now_utc():
    return datetime.now(timezone.utc)


def _local_today():
    # The seeded test account runs America/New_York and the /daily window is
    # account-local, so "today" must be the account's date, not UTC's.
    return datetime.now(ZoneInfo("America/New_York")).date()


def _feed_time():
    # A feed time whose ~52-min flush still lands on today's board: in the
    # last hour of the account-local day the follow-up would cross midnight,
    # so back the feed up two hours (still today, still in the past).
    now = _now_utc()
    tz = ZoneInfo("America/New_York")
    if (now + timedelta(hours=1)).astimezone(tz).date() != now.astimezone(tz).date():
        now -= timedelta(hours=2)
    return now


def _daily(admin_client, patient):
    resp = admin_client.get(
        f"/api/schedule/daily?patient_id={patient.id}"
        f"&target_date={_local_today().isoformat()}&tz_offset_minutes=0"
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _spot(admin_client, patient, name="Water run", amount=660, when=None,
          fills=True, fluid_min=None, fluid_max=None):
    when = when or _now_utc()
    payload = {
        "patient_id": patient.id, "schedule_type": "hydration", "name": name,
        "cron_expression": f"{when.minute} {when.hour} * * *",
        "default_item_name": "Water", "default_amount": amount,
        "default_amount_unit": "ml",
        "fills_fluid_goal": fills,
    }
    if fluid_min is not None:
        payload["fluid_min_ml"] = fluid_min
    if fluid_max is not None:
        payload["fluid_max_ml"] = fluid_max
    resp = admin_client.post("/api/nutrition/schedules", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json(), when


def _goal(admin_client, patient, fluid_ml):
    resp = admin_client.post("/api/nutrition/goals", json={
        "patient_id": patient.id,
        "total_fluid_ml_target": fluid_ml,
        "effective_date": _now_utc().isoformat(),
    })
    assert resp.status_code == 200, resp.text
    return resp.json()


def _log_prn(admin_client, patient, ml, name="Juice"):
    resp = admin_client.post("/api/nutrition/intake/event", json={
        "patient_id": patient.id,
        "items": [{"item_name": name, "item_type": "liquid",
                   "amount": ml, "amount_unit": "ml"}],
    })
    assert resp.status_code == 200, resp.text


def _row(day, schedule_id):
    rows = [n for n in day["nutrition"]
            if n["schedule_id"] == schedule_id and n["row_kind"] == "schedule"]
    assert len(rows) == 1
    return rows[0]


# =====================
# SCHEDULE API ROUNDTRIP
# =====================

def test_schedule_carries_the_budget_fields(admin_client, patient):
    body, _ = _spot(admin_client, patient, fluid_min=100, fluid_max=700)
    assert body["fills_fluid_goal"] is True
    assert body["fluid_min_ml"] == 100
    assert body["fluid_max_ml"] == 700

    # Explicit null clears a clamp; False un-flags the spot.
    resp = admin_client.put(f"/api/nutrition/schedules/{body['id']}", json={
        "fills_fluid_goal": False, "fluid_min_ml": None,
    })
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["fills_fluid_goal"] is False
    assert updated["fluid_min_ml"] is None
    assert updated["fluid_max_ml"] == 700


# =====================
# SUGGESTION MATH
# =====================

def test_single_spot_fills_the_remaining_need(admin_client, patient):
    _goal(admin_client, patient, 1000)
    body, _ = _spot(admin_client, patient)

    row = _row(_daily(admin_client, patient), body["id"])
    assert row["fluid_dynamic"] is True
    # Need 1000, capped by the 660 nominal.
    assert row["suggested_amount"] == 660
    assert row["water_plan"]["target_ml"] == 1000
    assert row["water_plan"]["logged_ml"] == 0
    assert row["water_plan"]["spots_remaining"] == 1

    _log_prn(admin_client, patient, 500)
    row = _row(_daily(admin_client, patient), body["id"])
    assert row["suggested_amount"] == 500
    assert row["water_plan"]["logged_ml"] == 500


def test_split_is_proportional_to_nominal_sizes(admin_client, patient):
    _goal(admin_client, patient, 1000)
    big, _ = _spot(admin_client, patient, name="Big run", amount=660)
    small, _ = _spot(admin_client, patient, name="Small run", amount=340)
    _log_prn(admin_client, patient, 500)

    day = _daily(admin_client, patient)
    # Remaining 500 splits 660:340 → 330 / 170 (both under their caps).
    assert _row(day, big["id"])["suggested_amount"] == 330
    assert _row(day, small["id"])["suggested_amount"] == 170
    assert _row(day, big["id"])["water_plan"]["spots_remaining"] == 2


def test_capped_spot_overflows_to_the_others(admin_client, patient):
    _goal(admin_client, patient, 900)
    capped, _ = _spot(admin_client, patient, name="Capped", amount=600, fluid_max=300)
    open_spot, _ = _spot(admin_client, patient, name="Open", amount=600)

    day = _daily(admin_client, patient)
    # Even shares would be 450 each; the cap holds one at 300 and the
    # leftover flows to the other.
    assert _row(day, capped["id"])["suggested_amount"] == 300
    assert _row(day, open_spot["id"])["suggested_amount"] == 600


def test_uncompleted_feeds_hold_back_their_fluid(admin_client, patient):
    _goal(admin_client, patient, 1000)
    spot, _ = _spot(admin_client, patient)
    when = _now_utc()
    feed = admin_client.post("/api/nutrition/schedules", json={
        "patient_id": patient.id, "schedule_type": "meal", "name": "Dinner",
        "cron_expression": f"{when.minute} {when.hour} * * *",
        "default_item_name": "Smoothie", "default_amount": 400,
        "default_amount_unit": "ml",
    })
    assert feed.status_code == 200, feed.text

    row = _row(_daily(admin_client, patient), spot["id"])
    # 1000 − 400 still expected from Dinner.
    assert row["suggested_amount"] == 600
    assert row["water_plan"]["expected_food_ml"] == 400

    # Completing the feed moves its fluid from expected to logged; the
    # suggestion holds steady.
    resp = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": feed.json()["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    })
    assert resp.status_code == 200, resp.text
    row = _row(_daily(admin_client, patient), spot["id"])
    assert row["suggested_amount"] == 600
    assert row["water_plan"]["expected_food_ml"] == 0
    assert row["water_plan"]["logged_ml"] == 400


def test_goal_met_suggests_zero(admin_client, patient):
    _goal(admin_client, patient, 300)
    body, _ = _spot(admin_client, patient)
    _log_prn(admin_client, patient, 400)

    row = _row(_daily(admin_client, patient), body["id"])
    assert row["fluid_dynamic"] is True
    assert row["suggested_amount"] == 0


def test_min_clamp_floors_the_suggestion(admin_client, patient):
    _goal(admin_client, patient, 300)
    body, _ = _spot(admin_client, patient, fluid_min=100)
    _log_prn(admin_client, patient, 400)

    row = _row(_daily(admin_client, patient), body["id"])
    assert row["suggested_amount"] == 100


def test_water_only_goal_is_lifted_by_expected_food_fluid(admin_client, patient):
    """A goal carrying only water_ml_target predates combined accounting:
    it counts just the water plan, while the budget counts ALL fluid. The
    target is lifted by the food schedules' expected fluid so a full water
    goal survives the feeds being counted against it."""
    resp = admin_client.post("/api/nutrition/goals", json={
        "patient_id": patient.id,
        "water_ml_target": 500,
        "effective_date": _now_utc().isoformat(),
    })
    assert resp.status_code == 200, resp.text

    spot, _ = _spot(admin_client, patient)
    when = _now_utc()
    feed = admin_client.post("/api/nutrition/schedules", json={
        "patient_id": patient.id, "schedule_type": "meal", "name": "Dinner",
        "cron_expression": f"{when.minute} {when.hour} * * *",
        "default_item_name": "Formula", "default_amount": 400,
        "default_amount_unit": "ml",
    })
    assert feed.status_code == 200, feed.text

    row = _row(_daily(admin_client, patient), spot["id"])
    # Target 500 + 400 from Dinner; 400 still expected → the water spot
    # keeps its full 500.
    assert row["water_plan"]["target_ml"] == 900
    assert row["water_plan"]["target_parts"] == {"water_ml": 500, "food_ml": 400}
    assert row["suggested_amount"] == 500

    # Completing the feed moves its 400 from expected to logged; the water
    # suggestion holds steady instead of being eaten by the meal.
    resp = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": feed.json()["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    })
    assert resp.status_code == 200, resp.text
    row = _row(_daily(admin_client, patient), spot["id"])
    assert row["suggested_amount"] == 500


def test_current_goal_endpoint_reports_the_combined_target(admin_client, patient):
    _goal(admin_client, patient, 1000)
    body = admin_client.get(
        f"/api/nutrition/goals/patient/{patient.id}/current").json()
    # A stated total is used as-is, with no lift arithmetic to explain.
    assert body["effective_fluid_target_ml"] == 1000
    assert body["fluid_target_parts"] is None


def test_without_a_goal_the_spot_stays_fixed(admin_client, patient):
    body, _ = _spot(admin_client, patient)
    row = _row(_daily(admin_client, patient), body["id"])
    assert row["fluid_dynamic"] is False
    assert row["suggested_amount"] is None
    assert row["water_plan"] is None


def test_unflagged_rows_carry_no_suggestion(admin_client, patient):
    _goal(admin_client, patient, 1000)
    flagged, _ = _spot(admin_client, patient, name="Flex")
    fixed, _ = _spot(admin_client, patient, name="Fixed", amount=200, fills=False)

    day = _daily(admin_client, patient)
    assert _row(day, flagged["id"])["fluid_dynamic"] is True
    fixed_row = _row(day, fixed["id"])
    assert fixed_row["fluid_dynamic"] is False
    assert fixed_row["suggested_amount"] is None
    # The fixed spot's water is still expected, so it is held back from
    # the flagged one: 1000 − 200 → 660 cap still wins here…
    assert _row(day, flagged["id"])["water_plan"]["expected_food_ml"] == 200


# =====================
# COMPLETION POURS THE SUGGESTION
# =====================

def test_quick_complete_logs_the_suggested_amount(admin_client, patient):
    _goal(admin_client, patient, 500)
    body, when = _spot(admin_client, patient)

    resp = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    })
    assert resp.status_code == 200, resp.text

    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert len(rows) == 1
    assert rows[0]["amount"] == 500


def test_explicit_amount_beats_the_suggestion(admin_client, patient):
    _goal(admin_client, patient, 500)
    body, when = _spot(admin_client, patient)

    resp = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id, "amount": 123,
    })
    assert resp.status_code == 200, resp.text
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert rows[0]["amount"] == 123


# =====================
# FLUSH FOLLOW-UPS ARE SPOTS TOO
# =====================

@pytest.fixture
def flush_setup(admin_client, patient):
    """A feed with a flagged 60 mL flush, completed so the flush is pending."""
    formula = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Peptamen", "item_type": "tube_feed",
        "default_amount": 525, "default_amount_unit": "ml", "calories_per_unit": 1.0,
    }).json()
    water = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Water", "item_type": "liquid",
        "default_amount": 60, "default_amount_unit": "ml", "calories_per_unit": 0,
    }).json()
    when = _feed_time()
    schedule = admin_client.post("/api/nutrition/schedules", json={
        "patient_id": patient.id, "schedule_type": "meal", "name": "Lunch",
        "cron_expression": f"{when.minute} {when.hour} * * *",
        "components": [
            {"item_id": formula["id"], "amount": 525, "amount_unit": "ml",
             "feed_route": "pump", "rate_ml_per_hr": 600, "sort_order": 0},
            {"item_id": water["id"], "amount": 60, "amount_unit": "ml",
             "is_flush": True, "sort_order": 1},
        ],
    }).json()
    resp = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": schedule["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id, "completed_at": when.isoformat(),
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["flush_followup"]


def test_pending_flush_gets_a_suggestion(admin_client, patient, flush_setup):
    # 550 target − 525 logged by the feed → 25 left of the queued 60.
    _goal(admin_client, patient, 550)
    day = _daily(admin_client, patient)
    flush_rows = [n for n in day["nutrition"] if n["row_kind"] == "flush"]
    assert len(flush_rows) == 1
    assert flush_rows[0]["fluid_dynamic"] is True
    assert flush_rows[0]["suggested_amount"] == 25

    # Running it without an amount pours the suggestion.
    resp = admin_client.post(
        f"/api/nutrition/flush/{flush_setup['id']}/complete", json={})
    assert resp.status_code == 200, resp.text
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    flush_intakes = [r for r in rows if r["item_name"] == "Water"]
    assert len(flush_intakes) == 1
    assert flush_intakes[0]["amount"] == 25


def test_flush_suggests_zero_but_run_pours_the_nominal(admin_client, patient, flush_setup):
    # Goal already met: the board nudges Skip, but a plain Run still pours
    # the queued nominal so nothing silently logs a zero.
    _goal(admin_client, patient, 500)
    day = _daily(admin_client, patient)
    flush_rows = [n for n in day["nutrition"] if n["row_kind"] == "flush"]
    assert flush_rows[0]["suggested_amount"] == 0

    resp = admin_client.post(
        f"/api/nutrition/flush/{flush_setup['id']}/complete", json={})
    assert resp.status_code == 200, resp.text
    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    flush_intakes = [r for r in rows if r["item_name"] == "Water"]
    assert flush_intakes[0]["amount"] == 60
