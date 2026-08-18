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
"""Single owner of the care-task vocabulary.

The "is this a nutrition task" test in particular was written three times with
two different rules: the API matched any of six keywords in the category name
while the schedule form matched the single word "nutrition" exactly. A
"Feeding" category therefore hid the prefill fields in the form but still
opened the nutrition sheet on completion — with nothing to prefill it from.
"""
from typing import Optional

# A completion of a task in one of these categories offers to record what was
# actually taken. Matched as substrings, so "Tube feeding" and "Meal prep"
# both count.
NUTRITION_CATEGORY_KEYWORDS = (
    'nutrition', 'feeding', 'meal', 'food', 'drink', 'supplement',
)

# What a completion can be recorded as.
LOG_STATUSES = ('completed', 'skipped', 'partial')

# Minutes either side of the scheduled time that still count as on time.
ON_TIME_WINDOW_MINUTES = 15


def is_nutrition_category(category_name: Optional[str]) -> bool:
    """Does completing a task in this category warrant recording intake?"""
    if not category_name:
        return False
    lowered = str(category_name).lower()
    return any(keyword in lowered for keyword in NUTRITION_CATEGORY_KEYWORDS)


def completion_timing(scheduled_time, completed_at) -> dict:
    """Whether a completion landed early, late, or on time.

    Returned as the two booleans the log stores. An unscheduled (PRN)
    completion is neither — there was no time to be early or late for.
    """
    if scheduled_time is None or completed_at is None:
        return {'completed_early': False, 'completed_late': False}

    scheduled, completed = scheduled_time, completed_at
    # Compare like with like: a naive scheduled_time is a UTC wall clock.
    if scheduled.tzinfo is None and completed.tzinfo is not None:
        completed = completed.replace(tzinfo=None)
    elif scheduled.tzinfo is not None and completed.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=None)

    delta_minutes = (completed - scheduled).total_seconds() / 60
    return {
        'completed_early': delta_minutes < -ON_TIME_WINDOW_MINUTES,
        'completed_late': delta_minutes > ON_TIME_WINDOW_MINUTES,
    }
