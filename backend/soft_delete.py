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
"""
Global soft-delete filter for completion logs.

Completed doses / feeds / care-tasks can be "undone" (see the undo endpoint in
routes/schedule.py). Rather than hard-deleting the row — which would erase any
trace that it ever happened — undo marks it voided (`voided_at` / `voided_by`).

This module installs one SQLAlchemy `do_orm_execute` listener that transparently
appends a `voided_at IS NULL` criteria to every ORM SELECT against the four log
models, so all existing read paths (schedule, history, adherence, monitoring,
reports, dashboard) automatically ignore undone rows without each query having
to opt in.

To deliberately read voided rows (e.g. an audit/undo view), pass
`.execution_options(include_voided=True)` on the query/statement.
"""
import logging

from sqlalchemy import event
from sqlalchemy.orm import with_loader_criteria

from db import SessionLocal
from schemas.medication_log import MedicationLog
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_output import NutritionOutput
from schemas.care_task_log import CareTaskLog

logger = logging.getLogger("app")

_SOFT_DELETE_MODELS = (MedicationLog, NutritionIntake, NutritionOutput, CareTaskLog)

_registered = False


def register_soft_delete_filter():
    """Install the voided-row filter. Idempotent — safe to call once at startup."""
    global _registered
    if _registered:
        return

    @event.listens_for(SessionLocal, "do_orm_execute")
    def _filter_voided(execute_state):
        # Only plain top-level SELECTs. Skip column/relationship loads so we don't
        # interfere with eager/lazy loading internals, and honour an explicit
        # opt-in for views that need to see undone rows.
        if (
            not execute_state.is_select
            or execute_state.is_column_load
            or execute_state.is_relationship_load
            or execute_state.execution_options.get("include_voided", False)
        ):
            return
        for model in _SOFT_DELETE_MODELS:
            execute_state.statement = execute_state.statement.options(
                with_loader_criteria(
                    model,
                    lambda cls: cls.voided_at.is_(None),
                    include_aliases=True,
                )
            )

    _registered = True
    logger.info("Soft-delete filter registered for completion logs")
