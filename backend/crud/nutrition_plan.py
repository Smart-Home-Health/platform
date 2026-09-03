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
"""The nutrition plan: what the patient is meant to get, and what is scheduled
to deliver it.

Targets (nutrition_goals) and delivery (nutrition_schedules) used to be read
separately by the UI, which then did the reconciliation itself. Doing it here
means the cron arithmetic lives next to the scheduling code that owns it, and
the plan view is a single request.

Note the asymmetry between the two halves: goals are effective-dated and keep
their history, schedules are not versioned at all. Coverage can therefore only
ever describe the plan *as it stands now* — there is no way to reconstruct what
was scheduled on a past date, and nothing here pretends otherwise.
"""
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from schemas.nutrition_schedule import NutritionSchedule
from crud.nutrition import get_current_nutrition_goal
from nutrition_vocab import item_type_for_schedule_type, to_ml

logger = logging.getLogger(__name__)


def _field_count(field: str, span: int) -> int:
    """How many values a single cron field selects.

    Only the forms this app's schedule builder can produce are handled:
    `*`, a comma list, and `*/n`. Anything else counts as one.
    """
    field = (field or '*').strip()
    if field == '*':
        return span
    if field.startswith('*/'):
        try:
            step = int(field[2:])
            return max(1, span // step) if step > 0 else 1
        except ValueError:
            return 1
    return len([p for p in field.split(',') if p != '']) or 1


def daily_occurrences(cron_expression: Optional[str]) -> float:
    """Average times per day a cron fires.

    Returns a fraction for schedules that do not fire daily — a Mon/Wed/Fri
    schedule is 3/7 of a day's worth, which is what makes summing a mixed set
    of schedules into a daily total meaningful.
    """
    if not cron_expression:
        return 0.0
    parts = cron_expression.split()
    if len(parts) < 5:
        return 0.0

    minute, hour, day_of_month, _month, day_of_week = parts[:5]

    # Times per firing day. A schedule at 07:00, 12:00 and 19:00 fires three
    # times, not once — the previous frontend maths ignored these two fields.
    per_day = _field_count(minute, 60) * _field_count(hour, 24)

    # How often a day qualifies.
    if day_of_week != '*':
        day_factor = len([d for d in day_of_week.split(',') if d != '']) / 7
    elif day_of_month != '*':
        day_factor = len([d for d in day_of_month.split(',') if d != '']) / 30
    else:
        day_factor = 1.0

    return per_day * day_factor


def schedule_daily_contribution(schedule: NutritionSchedule) -> dict:
    """What one schedule contributes to a day, in mL and kcal."""
    occurrences = daily_occurrences(schedule.cron_expression)
    item_type = item_type_for_schedule_type(schedule.schedule_type)

    # Fluid is decided by the unit, not by what the schedule is called: a meal
    # of 525 mL is 525 mL of fluid, and a meal measured in grams is none. The
    # previous maths gated this on schedule_type == 'hydration', so tube feeds
    # and liquid meals counted toward neither total.
    if schedule.components:
        # Multi-item mix: sum the components, calories from each component's
        # saved item facts.
        fluid_per_firing = 0.0
        calories_per_firing = 0.0
        for comp in schedule.components:
            measured = to_ml(comp.amount, comp.amount_unit)
            if measured:
                fluid_per_firing += measured
            if comp.item is not None and comp.item.calories_per_unit is not None:
                calories_per_firing += float(comp.item.calories_per_unit) * comp.amount
        fluid_ml = fluid_per_firing * occurrences
        calories = calories_per_firing * occurrences
    else:
        measured = to_ml(schedule.default_amount, schedule.default_amount_unit)
        fluid_ml = measured * occurrences if measured else 0.0

        # Calories are calories, whatever the schedule is called.
        calories = (schedule.default_calories or 0) * occurrences

    return {
        'occurrences': occurrences,
        'fluid_ml': fluid_ml,
        'calories': calories,
        'item_type': item_type,
    }


# Schedule types whose fluid is "food-side" fluid: it arrives with the meal
# whatever the water plan says. Hydration schedules ARE the water plan.
FOOD_SCHEDULE_TYPES = {'meal', 'snack', 'supplement'}


def _food_fluid_per_firing(schedule: NutritionSchedule) -> float:
    """One firing's food-side fluid, excluding flush components (those are
    water — part of the water plan, not the meal)."""
    if schedule.components:
        return sum(
            to_ml(comp.amount, comp.amount_unit) or 0
            for comp in schedule.components
            if not comp.is_flush
        )
    return to_ml(schedule.default_amount, schedule.default_amount_unit) or 0


def expected_food_fluid_ml(db: Session, patient_id: int) -> float:
    """Fluid a day's food schedules (meals, snacks, supplements) deliver."""
    schedules = (
        db.query(NutritionSchedule)
        .filter(
            NutritionSchedule.patient_id == patient_id,
            NutritionSchedule.is_active.is_(True),
            NutritionSchedule.schedule_type.in_(FOOD_SCHEDULE_TYPES),
        )
        .all()
    )
    return sum(
        _food_fluid_per_firing(s) * daily_occurrences(s.cron_expression)
        for s in schedules
    )


def effective_fluid_target(db: Session, patient_id: int, goal) -> tuple:
    """The day's combined fluid target, as (target_ml, parts).

    Every consumer measures ALL fluid — feed mixes included — so the target
    must be a combined number too. total_fluid_ml_target is that number and
    wins when set (parts is None). A goal carrying only water_ml_target
    counts just the water plan; comparing it against combined intake is
    apples-to-oranges, so it is lifted by the fluid the food schedules are
    expected to deliver, and parts carries the arithmetic for display:
    {'water_ml': ..., 'food_ml': ...}.
    """
    if goal is None:
        return None, None
    if goal.total_fluid_ml_target:
        return float(goal.total_fluid_ml_target), None
    if goal.water_ml_target:
        water = float(goal.water_ml_target)
        food = expected_food_fluid_ml(db, patient_id)
        return water + food, {'water_ml': round(water), 'food_ml': round(food)}
    return None, None


def _metric(label: str, scheduled: float, goal: Optional[float], events: float, unit: str) -> dict:
    """One coverage line: what is scheduled against what was asked for."""
    target = float(goal) if goal else 0.0
    scheduled = round(scheduled)
    percent = round(min(100.0, (scheduled / target) * 100), 1) if target > 0 else None
    return {
        'key': label,
        'unit': unit,
        'scheduled': scheduled,
        'goal': round(target) if target > 0 else None,
        'percent': percent,
        # Only meaningful with a goal to fall short of.
        'shortfall': max(0, round(target - scheduled)) if target > 0 else None,
        'covered': target > 0 and scheduled >= target,
        'daily_events': round(events, 1),
    }


def get_nutrition_plan(db: Session, patient_id: int) -> dict:
    """Targets, the schedules meant to meet them, and the gap between."""
    goal = get_current_nutrition_goal(db, patient_id)

    # All of them — the schedule sheet lists paused ones on their own tab.
    # Coverage still counts only what actually fires.
    schedules: List[NutritionSchedule] = (
        db.query(NutritionSchedule)
        .filter(NutritionSchedule.patient_id == patient_id)
        .order_by(NutritionSchedule.is_active.desc(), NutritionSchedule.name.asc())
        .all()
    )

    fluid_ml = calories = 0.0
    fluid_events = calorie_events = 0.0
    per_schedule = {}

    for schedule in schedules:
        contribution = schedule_daily_contribution(schedule)
        per_schedule[schedule.id] = contribution
        if not schedule.is_active:
            continue
        if contribution['fluid_ml'] > 0:
            fluid_ml += contribution['fluid_ml']
            fluid_events += contribution['occurrences']
        if contribution['calories'] > 0:
            calories += contribution['calories']
            calorie_events += contribution['occurrences']

    fluid_goal, fluid_parts = effective_fluid_target(db, patient_id, goal)

    return {
        'goal': goal,
        'schedules': schedules,
        'schedule_contributions': per_schedule,
        # Non-None when the fluid target was lifted from a water-only goal —
        # the UI shows the arithmetic instead of an unexplained number.
        'fluid_target_parts': fluid_parts,
        'coverage': [
            _metric('fluids', fluid_ml, fluid_goal, fluid_events, 'mL'),
            _metric('calories', calories, goal.calories_target if goal else None,
                    calorie_events, 'kcal'),
        ],
        # Said plainly because it is the difference between a plan and a record:
        # this describes what is scheduled, not what anyone actually consumed.
        'basis': 'scheduled',
    }
