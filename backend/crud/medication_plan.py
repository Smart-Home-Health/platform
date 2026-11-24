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
"""Patient-owned medication plan operations for the agent administration interface."""
import hashlib
import json
from datetime import datetime

from croniter import croniter
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, PositiveInt, field_validator, model_validator
from sqlalchemy import or_

from crud.medications import stage_medication, stage_medication_schedule
from models.medications import MedicationDetails, MedicationScheduleChanges, MedicationScheduleDetails
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.patient import Patient
from utils.datetime_utils import get_account_tz, utc_now


class PlanError(ValueError):
    """An actionable failure that is safe to return to the tool caller."""


INPUT_CONFIG = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)


def validate_cron(value):
    if len(value.split()) != 5 or len(value) > 100 or not croniter.is_valid(value):
        raise ValueError("Expected a five-field UTC cron expression")
    # Some syntactically valid expressions (e.g. February 31) never fire.
    croniter(value, utc_now()).get_next()
    return value


class Schedule(MedicationScheduleDetails):
    model_config = INPUT_CONFIG
    cron_expression: str = Field(max_length=100, description="Five-field cron in UTC.")
    _validate_cron = field_validator("cron_expression")(validate_cron)


class ScheduleChanges(MedicationScheduleChanges):
    model_config = INPUT_CONFIG

    @model_validator(mode="after")
    def validate_changes(self):
        if not self.model_fields_set:
            raise ValueError("Supply at least one schedule field")
        for key in self.model_fields_set - {"notes", "grace_period_hours"}:
            if getattr(self, key) is None:
                raise ValueError(f"{key} cannot be null")
        if self.cron_expression is not None:
            validate_cron(self.cron_expression)
        return self


class NewMedication(MedicationDetails):
    model_config = INPUT_CONFIG
    schedules: list[Schedule] = Field(max_length=32, description="Explicit new schedules, or [] for none.")

    @model_validator(mode="after")
    def valid_dates(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("End date must be on or after start date")
        return self


class ReadPlan(BaseModel):
    """Read the configured patient's medication records and schedules, including archived records."""
    model_config = INPUT_CONFIG


class PlanWrite(BaseModel):
    model_config = INPUT_CONFIG
    patient_id: PositiveInt
    revision: str = Field(pattern=r"^[0-9a-f]{64}$", description="Revision returned by get_medication_plan.")


class AddMedication(PlanWrite):
    """Add a patient-owned medication with the supplied stock, instructions and schedules."""
    medication: NewMedication


class RetireMedication(PlanWrite):
    """Retire a medication and disable its schedules. Historical records retain their IDs."""
    medication_id: PositiveInt


class Replacement(BaseModel):
    model_config = INPUT_CONFIG
    old_medication_id: PositiveInt
    new_medication: NewMedication


class ReplaceMedications(PlanWrite):
    """Retire and replace one or more medications together. Supply every replacement schedule explicitly."""
    replacements: list[Replacement] = Field(min_length=1, max_length=32)


class SetMedicationSchedule(PlanWrite):
    """Add a medication schedule, or edit an existing schedule by ID. Set active=false to disable it."""
    medication_id: PositiveInt
    schedule_id: PositiveInt | None = None
    schedule: ScheduleChanges = Field(description=(
        "For a new schedule supply cron_expression (UTC), description and dose_amount. "
        "With a schedule_id, supply only the fields to change."
    ))


class MedicationPlan:
    def __init__(self, db, patient_id, *, lock):
        self.db = db
        # Serialize plan writers before reading the revision, including the first
        # insert for a patient whose plan has no medication rows to lock yet.
        patients = db.query(Patient).filter_by(id=patient_id, is_active=True)
        self.patient = (patients.with_for_update() if lock else patients).one_or_none()
        if self.patient is None:
            raise PlanError("Configured patient is unavailable")

        medications = db.query(Medication).filter_by(patient_id=patient_id).order_by(Medication.id)
        schedules = db.query(MedicationSchedule).join(Medication).filter(
            Medication.patient_id == patient_id,
            or_(MedicationSchedule.patient_id == patient_id, MedicationSchedule.patient_id.is_(None)),
        ).order_by(MedicationSchedule.id)
        if lock:
            medications = medications.with_for_update()
            schedules = schedules.with_for_update(of=MedicationSchedule)
        self.medications = {med.id: med for med in medications}
        self.schedules = {schedule.id: schedule for schedule in schedules}

    def snapshot(self):
        schedules_by_med = {}
        for schedule in self.schedules.values():
            fields = {key: getattr(schedule, key) for key in Schedule.model_fields}
            schedules_by_med.setdefault(schedule.medication_id, []).append({"id": schedule.id, **fields})
        medications = []
        for med in self.medications.values():
            fields = {key: getattr(med, key) for key in MedicationDetails.model_fields}
            for key in ("start_date", "end_date"):
                if isinstance(fields[key], datetime):
                    fields[key] = fields[key].date()
            medications.append({
                "id": med.id, "active": med.active, **fields,
                "schedules": schedules_by_med.get(med.id, []),
            })
        data = jsonable_encoder({
            "patient_id": self.patient.id,
            "patient_name": f"{self.patient.first_name} {self.patient.last_name}".strip(),
            "timezone": str(get_account_tz(self.db, self.patient.account_id)),
            "medications": medications,
        })
        data["revision"] = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        return data

    def active_medication(self, medication_id):
        med = self.medications.get(medication_id)
        if med is None or not med.active:
            raise PlanError("Active patient-owned medication not found")
        return med

    def add(self, data):
        med = stage_medication(
            self.db, patient_id=self.patient.id, account_id=self.patient.account_id,
            **data.model_dump(exclude={"schedules"}),
        )
        for schedule in data.schedules:
            stage_medication_schedule(self.db, medication_id=med.id, patient_id=self.patient.id,
                                      **schedule.model_dump())
        return med.id

    def retire(self, medication_id):
        med = self.active_medication(medication_id)
        now = utc_now()
        med.active = False
        med.updated_at = now
        for schedule in self.schedules.values():
            if schedule.medication_id == med.id and schedule.active:
                schedule.active = False
                schedule.updated_at = now
        return med.id

    def set_schedule(self, data):
        med = self.active_medication(data.medication_id)
        if data.schedule_id is None:
            new_schedule = Schedule.model_validate(data.schedule.model_dump(exclude_unset=True))
            schedule = stage_medication_schedule(
                self.db, medication_id=med.id, patient_id=self.patient.id, **new_schedule.model_dump(),
            )
        else:
            schedule = self.schedules.get(data.schedule_id)
            if schedule is None or schedule.medication_id != med.id:
                raise PlanError("Schedule not found on this medication")
            for field, value in data.schedule.model_dump(exclude_unset=True).items():
                setattr(schedule, field, value)
            schedule.updated_at = utc_now()
        return schedule.id


# The same allowlist drives discovery, validation and execution.
TOOLS = {
    "get_medication_plan": ReadPlan,
    "add_medication": AddMedication,
    "retire_medication": RetireMedication,
    "replace_medications": ReplaceMedications,
    "set_medication_schedule": SetMedicationSchedule,
}


def execute(db, patient_id, data):
    write = isinstance(data, PlanWrite)
    if write and data.patient_id != patient_id:
        raise PlanError("Patient ID does not match the configured patient")
    plan = MedicationPlan(db, patient_id, lock=write)
    snapshot = plan.snapshot()
    if isinstance(data, ReadPlan):
        return snapshot
    if data.revision != snapshot["revision"]:
        raise PlanError("Medication plan changed. Read the current plan before submitting edits.")
    if isinstance(data, AddMedication):
        return {"medication_id": plan.add(data.medication)}
    if isinstance(data, RetireMedication):
        return {"retired_medication_id": plan.retire(data.medication_id)}
    if isinstance(data, SetMedicationSchedule):
        return {"schedule_id": plan.set_schedule(data)}
    if isinstance(data, ReplaceMedications):
        replacements = []
        for item in data.replacements:
            replacements.append({
                "retired_medication_id": plan.retire(item.old_medication_id),
                "new_medication_id": plan.add(item.new_medication),
            })
        return {"replacements": replacements}
    raise PlanError("Unknown medication plan operation")
