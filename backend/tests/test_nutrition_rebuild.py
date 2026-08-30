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
"""Nutrition rebuild: Bristol scale, event grouping, tube feed, item library
and presets, plus the two output-summary bugs the rebuild fixed."""
from datetime import datetime, timezone

import pytest


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# =====================
# BRISTOL <-> CONSISTENCY
# =====================

def test_bristol_and_consistency_stay_in_agreement():
    """The two stool columns must never contradict each other.

    `consistency` still feeds the monitoring timeline while `bristol_scale` is
    what the rebuilt sheet collects, so one is always derived from the other.
    """
    from nutrition_vocab import consistency_for_bristol, bristol_for_consistency

    for bristol in range(1, 8):
        consistency = consistency_for_bristol(bristol)
        assert consistency, f"Bristol {bristol} produced no consistency"
        # Bristol 3 and 4 both describe a formed stool, so the reverse lookup
        # settles on 4 -- the only lossy pair, and deliberately so.
        expected = 4 if bristol == 3 else bristol
        assert bristol_for_consistency(consistency) == expected

    # Every legacy vocabulary value maps onto the scale.
    for legacy in ['solid', 'soft', 'loose', 'watery', 'diarrhea', 'constipated', 'pellets']:
        assert bristol_for_consistency(legacy) is not None, legacy

    assert consistency_for_bristol(None) is None
    assert bristol_for_consistency(None) is None


def test_location_round_trips_with_the_legacy_booleans():
    """`location` and the three booleans describe the same thing."""
    from nutrition_vocab import location_from_flags, flags_for_location

    assert location_from_flags() == 'restroom'
    assert location_from_flags(is_diaper=True) == 'diaper'
    assert location_from_flags(is_catheter=True) == 'catheter'
    assert location_from_flags(is_accident=True) == 'accident'
    # Catheter wins when more than one flag is set, matching the old
    # frontend inferLocation() precedence.
    assert location_from_flags(is_diaper=True, is_catheter=True) == 'catheter'

    assert flags_for_location('diaper')['is_diaper'] is True
    assert flags_for_location('restroom') == {
        'is_diaper': False, 'is_catheter': False, 'is_accident': False,
    }


def test_schedule_types_normalize_onto_intake_types():
    """Care activities must not create intake rows.

    routes/schedule.py used to assign schedule_type straight into item_type,
    which is how 'meal' and 'hydration' ended up in the column.
    """
    from nutrition_vocab import item_type_for_schedule_type

    assert item_type_for_schedule_type('meal') == 'food'
    assert item_type_for_schedule_type('snack') == 'food'
    assert item_type_for_schedule_type('hydration') == 'liquid'
    assert item_type_for_schedule_type('supplement') == 'supplement'
    for care_only in ('diaper_check', 'bathroom_assist', 'catheter_care'):
        assert item_type_for_schedule_type(care_only) is None, care_only


def test_volume_conversion_handles_every_unit_and_refuses_to_guess():
    from nutrition_vocab import to_ml

    assert to_ml(100, 'ml') == 100
    assert round(to_ml(4, 'oz'), 2) == 118.29
    assert round(to_ml(1, 'cups'), 2) == 236.59
    assert to_ml(2, 'liters') == 2000
    # Qualitative sizes are not volumes; returning None keeps "unmeasured"
    # distinguishable from "measured zero".
    for qualitative in ('smear', 'small', 'medium', 'large'):
        assert to_ml(1, qualitative) is None
    assert to_ml(None, 'ml') is None


# =====================
# TUBE FEED
# =====================

def test_tube_feed_intake_is_accepted(admin_client, patient):
    """Regression: the form offered Tube Feed but the API rejected it (422)."""
    resp = admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}", json={
        "item_name": "Peptamen", "item_type": "tube_feed",
        "amount": 250, "amount_unit": "ml",
        "feed_route": "pump", "rate_ml_per_hr": 125,
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["item_type"] == "tube_feed"
    assert body["feed_route"] == "pump"
    assert body["rate_ml_per_hr"] == 125


def test_unknown_intake_type_still_rejected(admin_client, patient):
    resp = admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}", json={
        "item_name": "Nope", "item_type": "poison", "amount": 1, "amount_unit": "ml",
    })
    assert resp.status_code == 422


def test_invalid_feed_route_rejected(admin_client, patient):
    resp = admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}", json={
        "item_name": "Peptamen", "item_type": "tube_feed",
        "amount": 250, "amount_unit": "ml", "feed_route": "straw",
    })
    assert resp.status_code == 422


# =====================
# OUTPUT EVENTS
# =====================

def test_output_event_writes_both_rows_under_one_group(admin_client, patient):
    """A mixed event is two rows -- but one event.

    Splitting keeps urine volumes and BM counts honest; the shared
    event_group_id is what stops four different views from re-guessing the
    association with four different time windows.
    """
    resp = admin_client.post("/api/nutrition/outputs/event", json={
        "patient_id": patient.id,
        "location": "diaper",
        "occurred_at": _now_iso(),
        "straining": True,
        "urine": {"diaper_wetness": "wet", "clarity": "clear"},
        "stool": {"bristol_scale": 4, "color": "brown", "amount_unit": "medium"},
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    rows = body["outputs"]

    assert len(rows) == 2
    assert len({r["event_group_id"] for r in rows}) == 1
    assert body["event_group_id"] == rows[0]["event_group_id"]

    urine = next(r for r in rows if r["output_type"] == "urine")
    stool = next(r for r in rows if r["output_type"] == "bowel")

    # Each row carries only its own descriptors.
    assert urine["diaper_wetness"] == "wet"
    assert urine["clarity"] == "clear"
    assert urine["bristol_scale"] is None
    assert stool["bristol_scale"] == 4
    assert stool["consistency"] == "solid"   # derived, for the timeline
    assert stool["clarity"] is None
    assert stool["diaper_soiled"] is True    # a stool row in a diaper

    # Location is stored explicitly and kept in sync with the old booleans.
    for row in rows:
        assert row["location"] == "diaper"
        assert row["is_diaper"] is True
        assert row["straining"] is True


def test_output_event_requires_urine_or_stool(admin_client, patient):
    """Minimum valid log is time + location + urine/stool."""
    resp = admin_client.post("/api/nutrition/outputs/event", json={
        "patient_id": patient.id, "location": "restroom", "occurred_at": _now_iso(),
    })
    assert resp.status_code == 400


def test_output_event_rejects_unknown_location(admin_client, patient):
    resp = admin_client.post("/api/nutrition/outputs/event", json={
        "patient_id": patient.id, "location": "hallway", "occurred_at": _now_iso(),
        "urine": {"amount": 100, "amount_unit": "ml"},
    })
    assert resp.status_code == 422


def test_restroom_urine_and_stool_group_together(admin_client, patient):
    """Not just diapers. The old merge logic only ever grouped diaper rows, so
    a restroom event that produced both showed up as two separate entries."""
    resp = admin_client.post("/api/nutrition/outputs/event", json={
        "patient_id": patient.id, "location": "restroom", "occurred_at": _now_iso(),
        "urine": {"amount": 200, "amount_unit": "ml"},
        "stool": {"bristol_scale": 6},
    })
    assert resp.status_code == 200, resp.text
    rows = resp.json()["outputs"]
    assert len(rows) == 2
    assert len({r["event_group_id"] for r in rows}) == 1
    assert all(r["location"] == "restroom" for r in rows)
    assert all(r["is_diaper"] is False for r in rows)


# =====================
# OUTPUT SUMMARY BUGS
# =====================

def test_summary_reports_straining_and_converts_units(admin_client, patient, db_session):
    """Two fixed bugs: straining was collected but never surfaced as a concern,
    and the urine total counted only rows whose unit was literally 'ml'."""
    from crud.nutrition import get_output_summary
    from datetime import date

    admin_client.post("/api/nutrition/outputs/event", json={
        "patient_id": patient.id, "location": "restroom", "occurred_at": _now_iso(),
        "straining": True,
        "urine": {"amount": 4, "amount_unit": "oz"},
    })

    summary = get_output_summary(db_session, patient.id, date.today())

    assert summary["has_concerns"] is True
    assert any("Straining" in c for c in summary["concerns"]), summary["concerns"]
    # 4 oz is a real measurement and must not be dropped.
    assert round(summary["urine_total_ml"], 1) == 118.3


def test_mixed_diaper_counts_as_one_change(admin_client, patient, db_session):
    """diaper_changes counted rows, so a mixed diaper counted twice."""
    from crud.nutrition import get_output_summary
    from datetime import date

    admin_client.post("/api/nutrition/outputs/event", json={
        "patient_id": patient.id, "location": "diaper", "occurred_at": _now_iso(),
        "urine": {"diaper_wetness": "wet"},
        "stool": {"bristol_scale": 4},
    })

    summary = get_output_summary(db_session, patient.id, date.today())
    assert summary["diaper_changes"] == 1
    assert summary["urine_count"] == 1
    assert summary["bowel_count"] == 1


# =====================
# ITEM LIBRARY + PRESETS
# =====================

@pytest.fixture
def feed_items(admin_client, patient):
    """A formula and a water flush, the canonical tube-feed pairing."""
    formula = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Peptamen", "item_type": "tube_feed",
        "default_amount": 250, "default_amount_unit": "ml",
        "calories_per_unit": 1.5, "protein_per_unit": 0.04,
    })
    flush = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Water flush", "item_type": "liquid",
        "default_amount": 60, "default_amount_unit": "ml", "calories_per_unit": 0,
    })
    assert formula.status_code == 200, formula.text
    assert flush.status_code == 200, flush.text
    return formula.json(), flush.json()


def test_item_search_and_duplicate_name(admin_client, patient, feed_items):
    resp = admin_client.get(f"/api/nutrition/items?patient_id={patient.id}&search=pept")
    assert resp.status_code == 200
    names = [i["name"] for i in resp.json()]
    assert "Peptamen" in names and "Water flush" not in names

    dup = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Peptamen", "item_type": "tube_feed",
    })
    assert dup.status_code == 409


def test_preset_expands_into_separate_records(admin_client, patient, feed_items):
    """The whole point of presets: one tap, still correctly separated records.

    A combined "feed + flush" row would make fluid totals meaningless, so the
    preset must produce one intake per component -- grouped, not merged.
    """
    formula, flush = feed_items

    created = admin_client.post("/api/nutrition/presets", json={
        "patient_id": patient.id, "name": "Peptamen 250 + flush",
        "components": [
            {"item_id": formula["id"], "amount": 250, "amount_unit": "ml",
             "feed_route": "pump", "rate_ml_per_hr": 125, "sort_order": 0},
            {"item_id": flush["id"], "amount": 60, "amount_unit": "ml", "sort_order": 1},
        ],
    })
    assert created.status_code == 200, created.text
    preset_id = created.json()["id"]
    assert len(created.json()["components"]) == 2

    applied = admin_client.post(f"/api/nutrition/presets/{preset_id}/apply", json={
        "patient_id": patient.id, "meal_type": "lunch",
    })
    assert applied.status_code == 200, applied.text
    rows = applied.json()

    assert len(rows) == 2, "feed and flush must stay separate records"
    assert len({r["event_group_id"] for r in rows}) == 1, "but belong to one action"

    feed_row = next(r for r in rows if r["item_type"] == "tube_feed")
    flush_row = next(r for r in rows if r["item_type"] == "liquid")

    # Nutrition scales from the per-unit profile: 250 * 1.5.
    assert feed_row["calories"] == 375
    assert feed_row["feed_route"] == "pump"
    assert feed_row["rate_ml_per_hr"] == 125
    assert flush_row["amount"] == 60
    assert flush_row["feed_route"] is None
    assert all(r["meal_type"] == "lunch" for r in rows)


def test_applying_missing_preset_404s(admin_client, patient):
    resp = admin_client.post("/api/nutrition/presets/999999/apply",
                             json={"patient_id": patient.id})
    assert resp.status_code == 404


def test_recent_returns_logged_combinations(admin_client, patient):
    admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}", json={
        "item_name": "Water", "item_type": "liquid", "amount": 120, "amount_unit": "ml",
    })
    resp = admin_client.get(f"/api/nutrition/recent?patient_id={patient.id}")
    assert resp.status_code == 200
    recent = resp.json()["recent"]
    assert any(r["item_name"] == "Water" and r["amount"] == 120 for r in recent)


# =====================
# AUTHORIZATION
# =====================

@pytest.mark.parametrize("method,path,payload", [
    ("post", "/api/nutrition/outputs/event", {"patient_id": 1, "location": "restroom",
                                              "occurred_at": "2026-01-01T00:00:00+00:00",
                                              "urine": {"amount": 1, "amount_unit": "ml"}}),
    ("post", "/api/nutrition/items", {"name": "X", "item_type": "food"}),
    ("post", "/api/nutrition/presets", {"name": "X", "components": [
        {"item_id": 1, "amount": 1, "amount_unit": "ml"}]}),
])
def test_write_endpoints_require_permission(limited_client, method, path, payload):
    """These were reachable by any authenticated user; the GETs were gated but
    the writes were not."""
    resp = getattr(limited_client, method)(path, json=payload)
    assert resp.status_code == 403, f"{path} -> {resp.status_code}"


# =====================
# PLAN + COVERAGE
# =====================

def test_cron_daily_occurrences():
    """Coverage sums a mixed set of schedules into one day, so a schedule that
    does not fire daily has to contribute a fraction of one."""
    from crud.nutrition_plan import daily_occurrences

    assert daily_occurrences('0 7 * * *') == 1
    # Three firing times is three events — the previous frontend maths ignored
    # the hour field entirely and counted this once.
    assert daily_occurrences('0 7,12,19 * * *') == 3
    assert round(daily_occurrences('0 7 * * 1,3,5'), 3) == 0.429
    assert round(daily_occurrences('30 8 1 * *'), 3) == 0.033
    assert daily_occurrences('*/30 * * * *') == 48
    assert daily_occurrences(None) == 0
    assert daily_occurrences('nonsense') == 0


def _schedule(db_session, patient, **kw):
    from schemas.nutrition_schedule import NutritionSchedule
    row = NutritionSchedule(
        patient_id=patient.id,
        schedule_type=kw.pop('schedule_type', 'meal'),
        name=kw.pop('name', 'Feed'),
        cron_expression=kw.pop('cron_expression', '0 7 * * *'),
        **kw,
    )
    db_session.add(row)
    db_session.commit()
    return row


def _goal(db_session, patient, **kw):
    from schemas.nutrition_goal import NutritionGoal
    from datetime import datetime, timezone
    row = NutritionGoal(
        patient_id=patient.id, is_active=True,
        effective_date=datetime(2026, 1, 1, tzinfo=timezone.utc), **kw,
    )
    db_session.add(row)
    db_session.commit()
    return row


def test_plan_returns_targets_schedules_and_coverage(admin_client, patient, db_session):
    """One request for the whole plan. The goal used to be fetched separately
    from the view that needed it, which is how it could come back missing."""
    _goal(db_session, patient, water_ml_target=1710, calories_target=1575)
    _schedule(db_session, patient, name='Morning Feed', default_amount=525,
              default_amount_unit='ml', default_calories=525)

    resp = admin_client.get(f"/api/nutrition/plan?patient_id={patient.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body['goal']['water_ml_target'] == 1710
    assert len(body['schedules']) == 1
    # Coverage is about the plan, not the record — said explicitly.
    assert body['basis'] == 'scheduled'

    fluids = next(c for c in body['coverage'] if c['key'] == 'fluids')
    assert fluids['scheduled'] == 525
    assert fluids['goal'] == 1710
    assert fluids['shortfall'] == 1185
    assert fluids['covered'] is False


def test_fluid_coverage_follows_the_unit_not_the_label(admin_client, patient, db_session):
    """A meal of 525 mL is 525 mL of fluid. Gating on schedule_type meant tube
    feeds and liquid meals counted toward neither total."""
    _goal(db_session, patient, water_ml_target=1000, calories_target=1000)
    _schedule(db_session, patient, schedule_type='meal', name='Liquid meal',
              default_amount=525, default_amount_unit='ml', default_calories=525)
    _schedule(db_session, patient, schedule_type='meal', name='Solid meal',
              default_amount=200, default_amount_unit='grams', default_calories=300)

    body = admin_client.get(f"/api/nutrition/plan?patient_id={patient.id}").json()
    fluids = next(c for c in body['coverage'] if c['key'] == 'fluids')
    calories = next(c for c in body['coverage'] if c['key'] == 'calories')

    # Only the millilitre one is fluid...
    assert fluids['scheduled'] == 525
    # ...but calories are calories, whatever the schedule is called.
    assert calories['scheduled'] == 825


def test_coverage_reports_covered_once_the_goal_is_met(admin_client, patient, db_session):
    _goal(db_session, patient, water_ml_target=500, calories_target=500)
    _schedule(db_session, patient, default_amount=500, default_amount_unit='ml',
              default_calories=500)

    body = admin_client.get(f"/api/nutrition/plan?patient_id={patient.id}").json()
    for metric in body['coverage']:
        assert metric['covered'] is True, metric
        assert metric['shortfall'] == 0
        assert metric['percent'] == 100


def test_plan_without_a_goal_reports_no_target(admin_client, patient, db_session):
    """Scheduling something without a target set is legitimate — coverage just
    has nothing to measure against."""
    _schedule(db_session, patient, default_amount=300, default_amount_unit='ml')

    body = admin_client.get(f"/api/nutrition/plan?patient_id={patient.id}").json()
    assert body['goal'] is None
    fluids = next(c for c in body['coverage'] if c['key'] == 'fluids')
    assert fluids['scheduled'] == 300
    assert fluids['goal'] is None
    assert fluids['percent'] is None
    assert fluids['covered'] is False


def test_inactive_schedules_are_left_out_of_coverage(admin_client, patient, db_session):
    _goal(db_session, patient, water_ml_target=1000)
    _schedule(db_session, patient, name='On', default_amount=400, default_amount_unit='ml')
    _schedule(db_session, patient, name='Off', default_amount=400,
              default_amount_unit='ml', is_active=False)

    body = admin_client.get(f"/api/nutrition/plan?patient_id={patient.id}").json()
    fluids = next(c for c in body['coverage'] if c['key'] == 'fluids')
    assert fluids['scheduled'] == 400
    # Paused schedules stay in the payload (the schedule sheet lists them on
    # their own tab) — they just don't count toward coverage.
    assert {s['name']: s['is_active'] for s in body['schedules']} == {
        'On': True, 'Off': False,
    }
