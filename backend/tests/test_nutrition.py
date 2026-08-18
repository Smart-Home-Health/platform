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
"""Wave 2 — nutrition intake: create, validation, listing, and account-timezone
day bucketing for the /daily and /summary endpoints."""
from datetime import date, timedelta


def _intake(amount=120.0, item_type="liquid"):
    return {"item_name": "Water", "item_type": item_type, "amount": amount, "amount_unit": "ml"}


def _iso_utc(d, hour):
    return f"{d.isoformat()}T{hour:02d}:00:00+00:00"


def test_intake_history_filters_by_schedule(admin_client, patient, db_session):
    """`schedule_id` narrows intake history to one nutrition schedule.

    The dose panel shows this as an item's own history, so it must not mix in
    other items — and ad-hoc intakes, which carry no schedule at all, must not
    appear under any of them.
    """
    from schemas.nutrition_intake import NutritionIntake
    from schemas.nutrition_schedule import NutritionSchedule
    from datetime import datetime, timezone

    def _schedule(name):
        row = NutritionSchedule(patient_id=patient.id, schedule_type="liquid",
                                name=name, cron_expression="0 1 * * *")
        db_session.add(row)
        db_session.flush()
        return row.id

    water_id = _schedule("Overnight Water")
    feed_id = _schedule("Morning Feed")

    def _record(schedule_id, name):
        db_session.add(NutritionIntake(
            patient_id=patient.id, schedule_id=schedule_id, item_name=name,
            item_type="liquid", amount=100.0, amount_unit="ml",
            consumed_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ))

    _record(water_id, "Overnight Water")
    _record(water_id, "Overnight Water")
    _record(feed_id, "Morning Feed")
    _record(None, "Ad-hoc sip")
    db_session.commit()

    scoped = admin_client.get(
        f"/api/patients/{patient.id}/nutrition-intake?schedule_id={water_id}")
    assert scoped.status_code == 200, scoped.text
    names = [r["item_name"] for r in scoped.json()]
    assert names == ["Overnight Water", "Overnight Water"]

    # Unfiltered still returns everything, ad-hoc included.
    everything = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake")
    assert {r["item_name"] for r in everything.json()} == {
        "Overnight Water", "Morning Feed", "Ad-hoc sip"}


def test_create_nutrition_intake(admin_client, patient):
    resp = admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}", json=_intake())
    assert resp.status_code == 200
    assert resp.json()["id"] > 0


def test_nutrition_intake_item_type_validation(admin_client, patient):
    resp = admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}",
                             json=_intake(item_type="poison"))
    assert resp.status_code == 422


def test_nutrition_intake_amount_must_be_positive(admin_client, patient):
    resp = admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}", json=_intake(amount=0))
    assert resp.status_code == 422


def test_list_patient_nutrition_intake(admin_client, patient):
    admin_client.post(f"/api/nutrition-intake?patient_id={patient.id}", json=_intake())
    resp = admin_client.get(f"/api/patients/{patient.id}/nutrition-intake")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


# --- Account-timezone day bucketing ------------------------------------------
# The test account's timezone is America/New_York (conftest), so 03:00 UTC is
# 22:00/23:00 the *previous* local day. Records logged there must bucket to
# yesterday, regardless of any tz_offset_minutes the caller sends (account tz
# takes precedence).

def test_daily_intake_uses_account_timezone(admin_client, patient):
    target = date.today()
    resp = admin_client.post(
        f"/api/nutrition-intake?patient_id={patient.id}",
        json={**_intake(), "consumed_at": _iso_utc(target, 3)},
    )
    assert resp.status_code == 200
    intake_id = resp.json()["id"]

    same_day = admin_client.get(
        f"/api/patients/{patient.id}/nutrition-intake/daily?target_date={target.isoformat()}"
    ).json()["intake_records"]
    assert intake_id not in [r["id"] for r in same_day]

    prior = (target - timedelta(days=1)).isoformat()
    prior_day = admin_client.get(
        f"/api/patients/{patient.id}/nutrition-intake/daily?target_date={prior}"
    ).json()["intake_records"]
    assert intake_id in [r["id"] for r in prior_day]


def test_daily_outputs_uses_account_timezone(admin_client, patient):
    target = date.today()
    resp = admin_client.post("/api/nutrition/outputs", json={
        "patient_id": patient.id, "output_type": "urine",
        "occurred_at": _iso_utc(target, 3),
    })
    assert resp.status_code == 200
    output_id = resp.json()["id"]

    same_day = admin_client.get(
        f"/api/nutrition/outputs/patient/{patient.id}/daily?target_date={target.isoformat()}"
    ).json()
    assert output_id not in [r["id"] for r in same_day]

    prior = (target - timedelta(days=1)).isoformat()
    prior_day = admin_client.get(
        f"/api/nutrition/outputs/patient/{patient.id}/daily?target_date={prior}"
    ).json()
    assert output_id in [r["id"] for r in prior_day]


def test_nutrition_summary_uses_account_timezone(admin_client, patient):
    target = date.today()
    resp = admin_client.post(
        f"/api/nutrition-intake?patient_id={patient.id}",
        json={**_intake(), "calories": 100, "consumed_at": _iso_utc(target, 3)},
    )
    assert resp.status_code == 200

    same_day = admin_client.get(
        f"/api/patients/{patient.id}/nutrition-summary?target_date={target.isoformat()}"
    ).json()["summary"]
    assert same_day["total_calories"] == 0

    prior = (target - timedelta(days=1)).isoformat()
    prior_day = admin_client.get(
        f"/api/patients/{patient.id}/nutrition-summary?target_date={prior}"
    ).json()["summary"]
    assert prior_day["total_calories"] == 100
