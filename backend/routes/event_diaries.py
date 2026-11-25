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
"""Patient event diaries with linked medication, nutrition, and care history."""
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, Field, StringConstraints, model_validator
from sqlalchemy.orm import Session

from crud.monitoring import patient_pulse_ox_patterns
from crud.patients import get_visible_patient_ids
from crud.monitoring_timeline import care_task_logs, day_streams, quarter_hour_signals, event_quarters
from db import get_db
from dependencies import get_current_user, require_permission, require_read_access
from nutrition_vocab import LOCATION_DIAPER, LOCATION_LABELS, QUALITATIVE_AMOUNT_UNITS, location_from_flags
from schemas.care_task_log import CareTaskLog
from schemas.event_diary import DiaryEvent, EventDiary
from schemas.medication import Medication
from schemas.medication_log import MedicationLog
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_output import NutritionOutput
from schemas.patient import AccessLevel, Patient, PatientAccess
from utils.datetime_utils import local_day_range_utc, resolve_tz_for_patient, utc_now

router = APIRouter(prefix='/api/patients/{patient_id}/diaries', tags=['diaries'],
                   dependencies=[Depends(require_read_access), Depends(require_permission('vitals.read'))])

ButtonLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
PERFORMED_CARE_STATUSES = ('completed', 'partial')


class QuickButton(BaseModel):
    label: ButtonLabel
    question: Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)] | None = None


class DiaryForm(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    starts_at: AwareDatetime
    ends_at: AwareDatetime | None = None
    include_medications: bool = False
    include_nutrition: bool = False
    buttons: list[QuickButton] = Field(min_length=1, max_length=32)

    @model_validator(mode='after')
    def validate_diary(self):
        if self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError('The end must be after the start.')
        if len({b.label.casefold() for b in self.buttons}) != len(self.buttons):
            raise ValueError('Give each quick button a different label.')
        return self


class Observation(BaseModel):
    observed_at: AwareDatetime
    note: str = Field('', max_length=8000)
    answer: Literal['Yes', 'No', 'Unsure'] | None = None


class Capture(Observation):
    request_id: UUID
    # A preset sends its label. A free-form observation sends its description alone.
    label: ButtonLabel | None = None


def patient_access(patient_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    visible = get_visible_patient_ids(db, user)
    patient = db.get(Patient, patient_id)
    if (not patient or patient.account_id != user.account_id
            or (visible is not None and patient_id not in visible)):
        raise HTTPException(404, 'Patient not found')
    if user.is_superuser:
        return True
    grant = db.query(PatientAccess).filter_by(patient_id=patient_id, user_id=user.id, is_active=True).first()
    if not grant or (grant.expires_at and grant.expires_at <= datetime.utcnow()):
        raise HTTPException(404, 'Patient not found')
    return (grant.access_level != AccessLevel.VIEWER and
            (user.has_permission('vitals.record') or user.has_permission('vitals.create')))


def require_write(can_write=Depends(patient_access)):
    if not can_write:
        raise HTTPException(403, 'Recording permission required')


def diary_record(diary):
    return {field: getattr(diary, field) for field in ('id', 'name', 'starts_at', 'ends_at', 'buttons',
                                                       'include_medications', 'include_nutrition')}


def manual_record(event):
    return dict(source='observation', id=event.id, at=event.observed_at,
                label=event.label or 'Custom observation', is_custom=not event.label,
                note=event.note, question=event.question, answer=event.answer)


def diary_output_entries(db, patient_id, start, end):
    outputs = db.query(NutritionOutput).filter(
        NutritionOutput.patient_id == patient_id, NutritionOutput.voided_at.is_(None),
        NutritionOutput.occurred_at.between(start, end),
    ).order_by(NutritionOutput.occurred_at, NutritionOutput.id)
    groups = {}
    for output in outputs:
        # Mixed diapers have one row per output type. Ungrouped legacy rows stand alone.
        groups.setdefault(output.event_group_id or output.id, []).append(output)

    for members in groups.values():
        first = members[0]
        location = first.location or location_from_flags(first.is_diaper, first.is_catheter, first.is_accident)
        label = 'Diaper change' if location == LOCATION_DIAPER else 'Nutrition output'
        details = []
        if location != LOCATION_DIAPER and (first.location or first.is_catheter or first.is_accident):
            details.append(LOCATION_LABELS.get(location, location))
        for output in members:
            kind = 'Stool' if output.output_type == 'bowel' else output.output_type.capitalize()
            parts = [kind, output.diaper_wetness, 'soiled' if output.diaper_soiled else None, output.consistency]
            if output.amount is not None:
                parts.append(f'{output.amount:g} {output.amount_unit or ""}'.strip())
            elif output.amount_unit in QUALITATIVE_AMOUNT_UNITS:
                parts.append(output.amount_unit)
            details.append(' · '.join(filter(None, parts)))
        details.extend(dict.fromkeys(output.notes for output in members if output.notes))
        yield dict(source='nutrition_output', id=first.id, at=first.occurred_at, label=label, note=' · '.join(details))


def lookup(db, patient_id, diary_id, *, lock=False):
    query = db.query(EventDiary).filter_by(id=diary_id, patient_id=patient_id)
    diary = (query.with_for_update() if lock else query).first()
    if not diary:
        raise HTTPException(404, 'Diary not found')
    return diary


@router.get('')
def list_diaries(patient_id: int, db: Session = Depends(get_db), can_write=Depends(patient_access)):
    diaries = db.query(EventDiary).filter_by(patient_id=patient_id).order_by(EventDiary.starts_at.desc(), EventDiary.id.desc())
    return dict(diaries=[diary_record(d) for d in diaries], can_write=can_write,
                timezone=str(resolve_tz_for_patient(db, patient_id)))


@router.post('', dependencies=[Depends(require_write)], status_code=201)
def create_diary(patient_id: int, data: DiaryForm, db: Session = Depends(get_db)):
    diary = EventDiary(patient_id=patient_id, **data.model_dump())
    db.add(diary)
    db.commit()
    return diary_record(diary)


@router.put('/{diary_id}', dependencies=[Depends(require_write)])
def change_diary(patient_id: int, diary_id: int, data: DiaryForm, db: Session = Depends(get_db)):
    diary = lookup(db, patient_id, diary_id, lock=True)
    outside = DiaryEvent.observed_at < data.starts_at
    if data.ends_at:
        outside |= DiaryEvent.observed_at > data.ends_at
    if db.query(DiaryEvent.id).filter(DiaryEvent.diary_id == diary_id, outside).first():
        raise HTTPException(422, 'Choose dates that include the recorded observations.')
    for key, value in data.model_dump().items():
        setattr(diary, key, value)
    db.commit()
    return diary_record(diary)


def check_observation(diary, data, question, *, is_custom):
    if is_custom and not data.note.strip():
        raise HTTPException(422, 'Enter a description for the custom observation.')
    if data.observed_at < diary.starts_at or (diary.ends_at and data.observed_at > diary.ends_at):
        raise HTTPException(422, 'The observation time must fall within the diary dates.')
    if data.answer and not question:
        raise HTTPException(422, 'This event has no follow-up question.')


@router.post('/{diary_id}/events', dependencies=[Depends(require_write)])
def capture_event(patient_id: int, diary_id: int, data: Capture, db: Session = Depends(get_db),
                  user=Depends(get_current_user)):
    # Serialize captures with settings edits. A retry after a lost response
    # returns the original observation, including any later corrections.
    diary = lookup(db, patient_id, diary_id, lock=True)
    existing = db.query(DiaryEvent).filter_by(diary_id=diary_id, request_id=str(data.request_id)).first()
    if existing:
        return manual_record(existing)
    question = None
    if data.label is not None:
        button = next((b for b in diary.buttons if b['label'] == data.label), None)
        if not button:
            raise HTTPException(422, 'This button has changed. Reopen the diary to see current buttons.')
        question = button.get('question') or None
    check_observation(diary, data, question, is_custom=data.label is None)
    # Preset labels are nonempty. An empty stored label means no preset was used.
    event = DiaryEvent(diary_id=diary_id, recorded_by=user.id, question=question, label=data.label or '',
                       **data.model_dump(exclude={'request_id', 'label'}), request_id=str(data.request_id))
    db.add(event)
    db.commit()
    return manual_record(event)


@router.put('/{diary_id}/events/{event_id}', dependencies=[Depends(require_write)])
def correct_event(patient_id: int, diary_id: int, event_id: int, data: Observation, db: Session = Depends(get_db)):
    diary = lookup(db, patient_id, diary_id, lock=True)
    event = db.query(DiaryEvent).filter_by(diary_id=diary_id, id=event_id).first()
    if not event:
        raise HTTPException(404, 'Observation not found')
    check_observation(diary, data, event.question, is_custom=not event.label)
    event.observed_at, event.note, event.answer = data.observed_at, data.note, data.answer
    db.commit()
    return manual_record(event)


@router.delete('/{diary_id}/events/{event_id}', dependencies=[Depends(require_write)], status_code=204)
def remove_event(patient_id: int, diary_id: int, event_id: int, db: Session = Depends(get_db)):
    lookup(db, patient_id, diary_id, lock=True)
    if not db.query(DiaryEvent).filter_by(diary_id=diary_id, id=event_id).delete():
        raise HTTPException(404, 'Observation not found')
    db.commit()


@router.get('/{diary_id}/day', dependencies=[Depends(patient_access)])
def diary_day(patient_id: int, diary_id: int, target_date: date | None = None,
              db: Session = Depends(get_db), user=Depends(get_current_user)):
    diary = lookup(db, patient_id, diary_id)
    tz = resolve_tz_for_patient(db, patient_id)
    now = utc_now()
    today = now.astimezone(tz).date()
    first = diary.starts_at.astimezone(tz).date()
    last = min(today, diary.ends_at.astimezone(tz).date()) if diary.ends_at else today
    last = max(first, last)  # A diary can be scheduled to start in the future.
    day = max(first, min(target_date or today, last))
    start, end = local_day_range_utc(day, tz=tz)
    window_start = max(diary.starts_at, start)
    # Diary bounds include an event at its exact end. Calendar days exclude next midnight.
    window_end = diary.ends_at + timedelta(microseconds=1) if diary.ends_at and diary.ends_at < end else end
    # Doses and feeds come from the diary's own permission-filtered log, including
    # its grouped intakes. Fetch only the additional clinical context here.
    sources = {'vitals'}
    if user.has_permission('monitoring.read'):
        sources.update(('pulse_ox', 'alerts'))
    if user.has_permission('care_tasks.read'):
        sources.add('care_tasks')
    if diary.include_nutrition and user.has_permission('nutrition.read'):
        sources.add('nutrition_output')
    streams = day_streams(db, patient_id, window_start, window_end, sources)
    streams['care_tasks'] = [task for task in streams['care_tasks'] if task['status'] in PERFORMED_CARE_STATUSES]
    if 'pulse_ox' in sources:
        patterns = patient_pulse_ox_patterns(db, patient_id, window_start, window_end, now)
        suggestions = {p.id: asdict(p) for p in patterns}
        if suggestions:
            saved = db.query(DiaryEvent.request_id).filter(
                DiaryEvent.diary_id == diary_id, DiaryEvent.request_id.in_(suggestions.keys()))
            for (request_id,) in saved:
                suggestions.pop(request_id)
        streams['suggested_events'] = [dict(id=key, **values) for key, values in suggestions.items()]
    return {
        'date': day, 'today': today, 'first_day': first, 'last_day': last, 'timezone': str(tz),
        'day_start': start, 'day_end': end, 'window_start': window_start, 'window_end': window_end,
        **streams,
    }


@router.get('/{diary_id}/timeline', dependencies=[Depends(patient_access)])
def timeline(patient_id: int, diary_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    diary = lookup(db, patient_id, diary_id)
    now = utc_now()
    return diary_entries(db, diary, min(diary.ends_at or now, now), user)


def diary_entries(db, diary, end, user):
    patient_id = diary.patient_id
    entries = [manual_record(e) for e in db.query(DiaryEvent).filter_by(diary_id=diary.id)]
    if user.has_permission('care_tasks.read'):
        # The diary includes a completion at its exact end. The shared query takes an exclusive end.
        logs = care_task_logs(db, patient_id, diary.starts_at, end + timedelta(microseconds=1)).filter(
            CareTaskLog.status.in_(PERFORMED_CARE_STATUSES))
        for log in logs:
            label = 'Care task partially completed' if log.status == 'partial' else 'Care task completed'
            entries.append(dict(source='care_task', id=log.id, at=log.completed_at, label=label,
                                note=log.care_task.name + (f' · {log.notes}' if log.notes else '')))
    if diary.include_medications and user.has_permission('medications.read'):
        doses = db.query(MedicationLog, Medication).join(Medication, Medication.id == MedicationLog.medication_id).filter(
            MedicationLog.patient_id == patient_id, MedicationLog.dose_amount > 0,
            MedicationLog.administered_at.between(diary.starts_at, end), MedicationLog.voided_at.is_(None))
        for dose, med in doses:
            concentration = (med.concentration or '').strip()
            name = f'{med.name} ({concentration})' if concentration else med.name
            unit = med.quantity_unit
            dose_unit = unit if unit.lower() in {'ml', 'mg'} else f' {unit}'
            entries.append(dict(source='medication', id=dose.id, at=dose.administered_at, label='Took medicine',
                                note=f'{name} - {dose.dose_amount:g}{dose_unit}' +
                                     (f' · {dose.notes}' if dose.notes else '')))
    if diary.include_nutrition and user.has_permission('nutrition.read'):
        entries.extend(diary_output_entries(db, patient_id, diary.starts_at, end))
        intakes = db.query(NutritionIntake).filter(NutritionIntake.patient_id == patient_id,
            NutritionIntake.consumed_at.between(diary.starts_at, end), NutritionIntake.voided_at.is_(None)
        ).order_by(NutritionIntake.consumed_at, NutritionIntake.id)
        meals = {}
        for item in intakes:
            key = item.event_group_id or item.id
            if key not in meals:
                meals[key] = dict(source='nutrition', id=item.id, at=item.consumed_at, label='Nutrition intake', parts=[])
            meals[key]['parts'].append(f'{item.item_name} · {item.amount:g} {item.amount_unit}' +
                                        (f' · {item.notes}' if item.notes else ''))
        for meal in meals.values():
            meal['note'] = '; '.join(meal.pop('parts'))
            entries.append(meal)
    return sorted(entries, key=lambda e: (e['at'], e['source'], e['id']))


def quarter_start(at):
    at = at.astimezone(timezone.utc)
    return at.replace(minute=at.minute // 15 * 15, second=0, microsecond=0)


@router.get('/{diary_id}/report', dependencies=[Depends(patient_access)])
def print_report(patient_id: int, diary_id: int, signals_since: AwareDatetime | None = None,
                 db: Session = Depends(get_db), user=Depends(get_current_user)):
    diary = lookup(db, patient_id, diary_id)
    now = utc_now()
    end = min(diary.ends_at or now, now)
    start = diary.starts_at
    entries = diary_entries(db, diary, end, user)
    # A polling client can retain earlier signal bins. A fresh print request
    # omits signals_since, including any readings imported after initial load.
    signal_start = start
    if signals_since:
        signal_start = max(start, quarter_start(min(signals_since, end)))
    monitoring = user.has_permission('monitoring.read')
    categories = {'observation': set()}
    if user.has_permission('care_tasks.read'):
        categories['care_task'] = set()
    if diary.include_medications and user.has_permission('medications.read'):
        categories['medication'] = set()
    if diary.include_nutrition and user.has_permission('nutrition.read'):
        categories.update(nutrition=set(), nutrition_output=set())
    for entry in entries:
        if start <= entry['at'] <= end:
            categories[entry['source']].add(quarter_start(entry['at']))
    categories = {key: sorted(bins) for key, bins in categories.items()}
    categories['vitals'] = event_quarters(db, patient_id, start, end, 'vitals')
    if monitoring:
        categories['alerts'] = event_quarters(db, patient_id, start, end, 'alerts')
    return dict(entries=entries, start=start, through=end, signals_from=signal_start,
                signals=quarter_hour_signals(db, patient_id, signal_start, end) if monitoring else [],
                categories=categories)
