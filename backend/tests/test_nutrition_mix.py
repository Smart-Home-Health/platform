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
"""Multi-item feeds: schedule component mixes, multi-row completion under one
event_group_id, hand-logged intakes linked to (and completing) a scheduled
feed, grouped undo, and the barcode lookup chain (library -> OpenFoodFacts ->
none)."""
from datetime import date, datetime, timezone

import pytest


def _now_utc():
    return datetime.now(timezone.utc)


@pytest.fixture
def mix_items(admin_client, patient):
    """A formula plus a juice — the shape of every feed now."""
    formula = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Peptamen", "item_type": "tube_feed",
        "default_amount": 250, "default_amount_unit": "ml",
        "calories_per_unit": 1.5, "protein_per_unit": 0.04,
    })
    juice = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Green juice", "item_type": "liquid",
        "default_amount": 120, "default_amount_unit": "ml",
        "calories_per_unit": 0.7, "carbs_per_unit": 0.15,
    })
    assert formula.status_code == 200, formula.text
    assert juice.status_code == 200, juice.text
    return formula.json(), juice.json()


def _mix_schedule(admin_client, patient, mix_items, when=None):
    """A daily feed schedule whose mix is formula 240 mL + juice 120 mL."""
    formula, juice = mix_items
    when = when or _now_utc()
    resp = admin_client.post("/api/nutrition/schedules", json={
        "patient_id": patient.id, "schedule_type": "meal", "name": "Lunch",
        "cron_expression": f"{when.minute} {when.hour} * * *",
        "components": [
            {"item_id": formula["id"], "amount": 240, "amount_unit": "ml",
             "feed_route": "pump", "rate_ml_per_hr": 120, "sort_order": 0},
            {"item_id": juice["id"], "amount": 120, "amount_unit": "ml", "sort_order": 1},
        ],
    })
    assert resp.status_code == 200, resp.text
    return resp.json(), when


# =====================
# SCHEDULE COMPONENTS CRUD
# =====================

def test_schedule_carries_a_component_mix(admin_client, patient, mix_items):
    body, _ = _mix_schedule(admin_client, patient, mix_items)
    comps = body["components"]
    assert [c["item_name"] for c in comps] == ["Peptamen", "Green juice"]
    assert comps[0]["item_type"] == "tube_feed"
    # Per-unit facts ride along so the completion form can prefill and scale.
    assert comps[0]["calories_per_unit"] == 1.5
    assert comps[1]["amount"] == 120


def test_update_replaces_the_whole_mix_and_empty_clears_it(admin_client, patient, mix_items):
    body, _ = _mix_schedule(admin_client, patient, mix_items)
    formula, _juice = mix_items

    replaced = admin_client.put(f"/api/nutrition/schedules/{body['id']}", json={
        "components": [{"item_id": formula["id"], "amount": 300, "amount_unit": "ml"}],
    })
    assert replaced.status_code == 200, replaced.text
    comps = replaced.json()["components"]
    assert len(comps) == 1 and comps[0]["amount"] == 300

    cleared = admin_client.put(f"/api/nutrition/schedules/{body['id']}", json={
        "components": [],
    })
    assert cleared.status_code == 200
    assert cleared.json()["components"] == []


def test_deleting_the_schedule_cascades_its_components(admin_client, patient, mix_items, db_session):
    from schemas.nutrition_schedule import NutritionScheduleComponent
    body, _ = _mix_schedule(admin_client, patient, mix_items)
    assert admin_client.delete(f"/api/nutrition/schedules/{body['id']}").status_code == 200
    left = db_session.query(NutritionScheduleComponent).filter_by(schedule_id=body["id"]).count()
    assert left == 0


# =====================
# COMPLETION — MULTI-ROW, ONE EVENT
# =====================

def test_completion_with_no_items_expands_the_schedule_mix(admin_client, patient, mix_items):
    """The fire-and-forget surfaces send no item fields; the backend must log
    the whole mix with server-scaled facts, not one blob row."""
    body, when = _mix_schedule(admin_client, patient, mix_items)

    resp = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    })
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result["success"] is True
    assert len(result["intake_ids"]) == 2
    assert result["intake_id"] == result["intake_ids"][0]  # back-compat shape

    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert len(rows) == 2, "formula and juice must stay separate records"
    assert len({r["event_group_id"] for r in rows}) == 1, "but belong to one action"
    feed = next(r for r in rows if r["item_type"] == "tube_feed")
    juice = next(r for r in rows if r["item_type"] == "liquid")
    assert feed["calories"] == 240 * 1.5
    assert feed["feed_route"] == "pump"
    assert juice["calories"] == 120 * 0.7
    assert all(r["schedule_id"] == body["id"] for r in rows)


def test_completion_accepts_the_adjusted_mix_from_the_client(admin_client, patient, mix_items):
    """He drank less juice today: explicit items win over the schedule mix."""
    body, when = _mix_schedule(admin_client, patient, mix_items)
    formula, juice = mix_items

    resp = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
        "items": [
            {"item_id": formula["id"], "item_name": "Peptamen", "item_type": "tube_feed",
             "amount": 240, "amount_unit": "ml", "calories": 360},
            {"item_id": juice["id"], "item_name": "Green juice", "item_type": "liquid",
             "amount": 60, "amount_unit": "ml", "calories": 42},
            {"item_name": "Mango smoothie", "item_type": "liquid",
             "amount": 90, "amount_unit": "ml", "calories": 80},
        ],
    })
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["intake_ids"]) == 3

    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    by_name = {r["item_name"]: r for r in rows}
    assert by_name["Green juice"]["amount"] == 60
    assert by_name["Mango smoothie"]["calories"] == 80
    assert len({r["event_group_id"] for r in rows}) == 1

    # The daily board shows the feed completed exactly once, not thrice.
    day = admin_client.get(
        f"/api/schedule/daily?patient_id={patient.id}"
        f"&target_date={date.today().isoformat()}&tz_offset_minutes=0"
    ).json()
    feed_rows = [n for n in day["nutrition"] if n["schedule_id"] == body["id"]]
    assert len(feed_rows) == 1 and feed_rows[0]["completed"] is True
    # And the board hands the mix to the completion form for prefilling.
    assert [c["item_name"] for c in feed_rows[0]["components"]] == ["Peptamen", "Green juice"]


def test_completion_without_components_keeps_the_legacy_single_row(admin_client, patient):
    when = _now_utc()
    sched = admin_client.post("/api/nutrition/schedules", json={
        "patient_id": patient.id, "schedule_type": "hydration", "name": "Afternoon water",
        "cron_expression": f"{when.minute} {when.hour} * * *",
        "default_item_name": "Water", "default_amount": 200,
        "default_amount_unit": "ml",
    }).json()

    resp = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": sched["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    })
    assert resp.status_code == 200, resp.text

    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert len(rows) == 1
    assert rows[0]["item_name"] == "Water" and rows[0]["item_type"] == "liquid"


def test_bulk_completion_expands_the_mix_too(admin_client, patient, mix_items):
    body, when = _mix_schedule(admin_client, patient, mix_items)

    resp = admin_client.post("/api/schedule/complete/bulk", json={"nutrition": [{
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    }]})
    assert resp.status_code == 200, resp.text

    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert len(rows) == 2
    assert len({r["event_group_id"] for r in rows}) == 1


# =====================
# HAND-LOGGED EVENT, LINKED OR NOT
# =====================

def test_intake_event_linked_to_a_feed_marks_it_complete(admin_client, patient, mix_items):
    body, when = _mix_schedule(admin_client, patient, mix_items)
    formula, juice = mix_items

    resp = admin_client.post("/api/nutrition/intake/event", json={
        "patient_id": patient.id,
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "meal_type": "lunch",
        "items": [
            {"item_id": formula["id"], "item_name": "Peptamen", "item_type": "tube_feed",
             "amount": 240, "amount_unit": "ml"},
            {"item_id": juice["id"], "item_name": "Green juice", "item_type": "liquid",
             "amount": 120, "amount_unit": "ml"},
        ],
    })
    assert resp.status_code == 200, resp.text
    event = resp.json()
    assert len(event["intakes"]) == 2
    assert all(i["event_group_id"] == event["event_group_id"] for i in event["intakes"])
    # Facts were scaled server-side from the saved items (nothing was sent).
    feed = next(i for i in event["intakes"] if i["item_type"] == "tube_feed")
    assert feed["calories"] == 240 * 1.5

    day = admin_client.get(
        f"/api/schedule/daily?patient_id={patient.id}"
        f"&target_date={date.today().isoformat()}&tz_offset_minutes=0"
    ).json()
    feed_rows = [n for n in day["nutrition"] if n["schedule_id"] == body["id"]]
    assert len(feed_rows) == 1 and feed_rows[0]["completed"] is True
    # A linked hand-log is a completion, not a PRN extra.
    assert not any(n["is_prn"] for n in day["nutrition"])


def test_unlinked_intake_event_surfaces_as_prn(admin_client, patient):
    resp = admin_client.post("/api/nutrition/intake/event", json={
        "patient_id": patient.id,
        "items": [{"item_name": "Water", "item_type": "liquid",
                   "amount": 120, "amount_unit": "ml"}],
    })
    assert resp.status_code == 200, resp.text

    day = admin_client.get(
        f"/api/schedule/daily?patient_id={patient.id}"
        f"&target_date={date.today().isoformat()}&tz_offset_minutes=0"
    ).json()
    prn = [n for n in day["nutrition"] if n["is_prn"]]
    assert len(prn) == 1 and prn[0]["name"] == "Water"


def test_intake_event_requires_items(admin_client, patient):
    empty = admin_client.post("/api/nutrition/intake/event", json={
        "patient_id": patient.id, "items": [],
    })
    assert empty.status_code == 422


def test_intake_event_requires_permission(limited_client, patient):
    forbidden = limited_client.post("/api/nutrition/intake/event", json={
        "patient_id": patient.id,
        "items": [{"item_name": "Water", "item_type": "liquid",
                   "amount": 1, "amount_unit": "ml"}],
    })
    assert forbidden.status_code == 403


# =====================
# UNDO / DELETE — THE WHOLE FEED
# =====================

def test_schedule_undo_voids_every_row_of_the_feed(admin_client, patient, mix_items):
    """Un-completing a feed means the whole feed: totals must drop by all of
    it and the board row must read due again — not leave orphan juice rows."""
    body, when = _mix_schedule(admin_client, patient, mix_items)
    result = admin_client.post("/api/schedule/complete/nutrition", json={
        "schedule_id": body["id"], "scheduled_time": when.isoformat(),
        "patient_id": patient.id,
    }).json()

    undo = admin_client.delete(f"/api/schedule/log/nutrition_intake/{result['intake_id']}")
    assert undo.status_code == 200, undo.text

    rows = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert rows == []

    day = admin_client.get(
        f"/api/schedule/daily?patient_id={patient.id}"
        f"&target_date={date.today().isoformat()}&tz_offset_minutes=0"
    ).json()
    feed_rows = [n for n in day["nutrition"] if n["schedule_id"] == body["id"]]
    assert feed_rows[0]["completed"] is False


def test_intake_delete_is_single_row_unless_whole_event(admin_client, patient):
    def make_event():
        return admin_client.post("/api/nutrition/intake/event", json={
            "patient_id": patient.id,
            "items": [
                {"item_name": "Peptamen", "item_type": "tube_feed",
                 "amount": 240, "amount_unit": "ml"},
                {"item_name": "Juice", "item_type": "liquid",
                 "amount": 120, "amount_unit": "ml"},
            ],
        }).json()["intakes"]

    first = make_event()
    # Default: correcting one line of a mix leaves the rest alone.
    assert admin_client.delete(f"/api/nutrition-intake/{first[0]['id']}").status_code == 200
    left = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    assert len(left) == 1

    second = make_event()
    assert admin_client.delete(
        f"/api/nutrition-intake/{second[0]['id']}?whole_event=true"
    ).status_code == 200
    left = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake").json()
    # Only the leftover single row from the first event remains.
    assert [r["item_name"] for r in left] == ["Juice"]


# =====================
# BARCODE LOOKUP
# =====================

def test_barcode_prefers_the_saved_library(admin_client, patient):
    created = admin_client.post("/api/nutrition/items", json={
        "patient_id": patient.id, "name": "Naked Green Machine", "item_type": "liquid",
        "default_amount": 450, "default_amount_unit": "ml",
        "calories_per_unit": 0.53, "barcode": "082592720153",
    })
    assert created.status_code == 200, created.text

    resp = admin_client.get(
        f"/api/nutrition/items/barcode/082592720153?patient_id={patient.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "library"
    assert body["item"]["name"] == "Naked Green Machine"


def test_barcode_falls_through_to_openfoodfacts(admin_client, patient, monkeypatch):
    # The route imported the symbol, so patch it where it is used.
    monkeypatch.setattr(
        "routes.nutrition.lookup_openfoodfacts",
        lambda code: {"name": "Green Machine", "brand": "Naked", "item_type": "liquid",
                      "default_amount": 240, "default_amount_unit": "ml",
                      "calories_per_unit": 0.53, "barcode": code},
    )
    resp = admin_client.get(
        f"/api/nutrition/items/barcode/082592720153?patient_id={patient.id}")
    body = resp.json()
    assert body["source"] == "openfoodfacts"
    assert body["suggestion"]["name"] == "Green Machine"
    assert body["suggestion"]["barcode"] == "082592720153"


def test_barcode_miss_is_a_200_none_not_an_error(admin_client, patient, monkeypatch):
    monkeypatch.setattr("routes.nutrition.lookup_openfoodfacts", lambda code: None)
    resp = admin_client.get(
        f"/api/nutrition/items/barcode/000000000000?patient_id={patient.id}")
    assert resp.status_code == 200
    assert resp.json()["source"] == "none"


def test_openfoodfacts_mapping_scales_per_100_to_per_unit(monkeypatch):
    """OFF reports nutriments per 100 g/ml and sodium in grams; the item
    library stores per ONE unit with sodium in mg."""
    from crud import nutrition_library

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"status": 1, "product": {
                "product_name": "Green Machine",
                "brands": "Naked, PepsiCo",
                "quantity": "450 ml",
                "serving_quantity": 240,
                "serving_quantity_unit": "ml",
                "nutriments": {
                    "energy-kcal_100g": 53, "proteins_100g": 1.2,
                    "carbohydrates_100g": 12.6, "fat_100g": 0.2,
                    "fiber_100g": 0.4, "sodium_100g": 0.02,
                },
            }}

    monkeypatch.setattr("httpx.get", lambda *a, **kw: FakeResponse())
    suggestion = nutrition_library.lookup_openfoodfacts("082592720153")

    assert suggestion["name"] == "Green Machine"
    assert suggestion["brand"] == "Naked"
    assert suggestion["item_type"] == "liquid"
    assert suggestion["default_amount"] == 240
    assert suggestion["default_amount_unit"] == "ml"
    assert suggestion["calories_per_unit"] == pytest.approx(0.53)
    assert suggestion["protein_per_unit"] == pytest.approx(0.012)
    # 0.02 g/100g -> 0.0002 g/unit -> 0.2 mg/unit.
    assert suggestion["sodium_per_unit"] == pytest.approx(0.2)
    assert suggestion["barcode"] == "082592720153"


def test_openfoodfacts_timeout_reads_as_none(monkeypatch):
    from crud import nutrition_library

    def boom(*a, **kw):
        raise TimeoutError("no internet on the hub")

    monkeypatch.setattr("httpx.get", boom)
    assert nutrition_library.lookup_openfoodfacts("082592720153") is None


# =====================
# PLAN COVERAGE
# =====================

def test_plan_coverage_sums_the_component_mix(admin_client, patient, mix_items):
    _mix_schedule(admin_client, patient, mix_items)

    plan = admin_client.get(f"/api/nutrition/plan?patient_id={patient.id}").json()
    daily = plan["schedules"][0]["daily"]
    # 240 + 120 mL of fluid, 240*1.5 + 120*0.7 kcal, once a day.
    assert daily["fluid_ml"] == pytest.approx(360)
    assert daily["calories"] == pytest.approx(240 * 1.5 + 120 * 0.7)
