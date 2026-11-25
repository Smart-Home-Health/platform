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
"""Per-profile settings, feed previews, and post-feed check suggestions."""
from datetime import datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from croniter import CroniterBadDateError, croniter
from fastapi import HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, PositiveInt, PrivateAttr, model_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload

from models.users import Role, User
from nutrition_vocab import SCHEDULE_TYPE_TO_ITEM_TYPE
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_output import NutritionOutput
from schemas.nutrition_schedule import NutritionSchedule
from schemas.patient import AccessLevel, Patient, PatientAccess
from schemas.schedule_manager import ScheduleManagerAction, ScheduleManagerFeed, ScheduleManagerProfile, ScheduleManagerRecipient
from utils.datetime_utils import make_utc, resolve_tz_for_patient, utc_now


PositiveMinutes = Annotated[int, Field(ge=1, le=1440)]
ClockTime = Annotated[str, Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')]


class ManagerSettings(BaseModel):
    model_config = ConfigDict(extra='forbid')
    feeds_enabled: bool = False
    feed_schedule_ids: list[PositiveInt] = Field(default_factory=list)
    min_gap_minutes: PositiveMinutes | None = None
    overnight_schedule_id: PositiveInt | None = None
    overnight_target: ClockTime | None = None
    manual_checks_enabled: bool = False
    checks_enabled: bool = False
    check_hours_start: ClockTime | None = None
    check_hours_end: ClockTime | None = None
    check_recipient_ids: list[PositiveInt] = Field(default_factory=list)
    _missing_recipient: bool = PrivateAttr(False)
    check_feed_ids: list[PositiveInt] = Field(default_factory=list)
    check_delay_minutes: int = Field(30, ge=0, le=1440)
    check_window_minutes: PositiveMinutes = 120
    change_lookback_minutes: PositiveMinutes = 120
    check_cooldown_minutes: PositiveMinutes = 60

    @model_validator(mode='after')
    def validate_rules(self):
        if self.feeds_enabled and (not self.feed_schedule_ids or self.min_gap_minutes is None):
            raise ValueError('Choose managed feeds and a minimum start-to-start gap.')
        if self.overnight_schedule_id is not None and self.overnight_schedule_id not in self.feed_schedule_ids:
            raise ValueError('The overnight run must be one of the selected managed feeds.')
        if self.overnight_target and self.overnight_schedule_id is None:
            raise ValueError('Choose the overnight run before setting its preferred start.')
        if (self.check_hours_start is None) != (self.check_hours_end is None):
            raise ValueError('Enter both times for a guidance window, or clear both for all day.')
        if self.check_hours_start and self.check_hours_start == self.check_hours_end:
            raise ValueError('Choose different start and end times, or clear both for all day.')
        if self.checks_enabled and not self.check_feed_ids:
            raise ValueError('Choose at least one feed to trigger check suggestions.')
        return self


class BathroomAction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['dry', 'changed', 'snooze', 'dismiss']
    trigger_key: str | None = Field(None, min_length=1, max_length=100)
    check_schedule_id: PositiveInt | None = None
    check_scheduled_time: AwareDatetime | None = None
    request_id: UUID | None = None
    snooze_minutes: PositiveMinutes = 30

    @model_validator(mode='after')
    def require_trigger(self):
        if (self.check_schedule_id is None) != (self.check_scheduled_time is None):
            raise ValueError('A scheduled check needs both its schedule and its original time.')
        if self.check_schedule_id is not None and self.action not in ('dry', 'changed'):
            raise ValueError('Choose a check outcome for the scheduled check.')
        if self.action in ('snooze', 'dismiss') and not self.trigger_key:
            raise ValueError('Choose an active suggestion to snooze or dismiss.')
        return self


def eligible_schedules(db, patient_id):
    return db.query(NutritionSchedule).filter(
        NutritionSchedule.patient_id == patient_id,
        NutritionSchedule.is_active.is_(True),
        NutritionSchedule.schedule_type.in_(SCHEDULE_TYPE_TO_ITEM_TYPE),
    )


def _saved_recipients(db, patient_id):
    rows = db.query(ScheduleManagerRecipient.user_id).filter_by(patient_id=patient_id).all()
    return sorted({row.user_id for row in rows if row.user_id is not None}), any(row.user_id is None for row in rows)


def read_settings(db, patient_id):
    profile = db.query(ScheduleManagerProfile).filter_by(patient_id=patient_id).first()
    if profile is None:
        return ManagerSettings()
    selections = db.query(ScheduleManagerFeed).filter(
        ScheduleManagerFeed.patient_id == patient_id,
        ScheduleManagerFeed.schedule_id.in_(eligible_schedules(db, patient_id).with_entities(NutritionSchedule.id)),
    ).order_by(ScheduleManagerFeed.schedule_id).all()
    managed = [row.schedule_id for row in selections if row.manage_spacing]
    checks = [row.schedule_id for row in selections if row.prompt_check]
    values = dict(profile.preferences)
    # A selected schedule may have been deleted, paused, or changed to a care activity.
    if not managed:
        values['feeds_enabled'] = False
    if not checks:
        values['checks_enabled'] = False
    overnight = profile.overnight_schedule_id if profile.overnight_schedule_id in managed else None
    if overnight is None:
        values['overnight_target'] = None
    recipient_ids, missing = _saved_recipients(db, patient_id)
    settings = ManagerSettings(**values, feed_schedule_ids=managed, check_feed_ids=checks,
                               overnight_schedule_id=overnight, check_recipient_ids=recipient_ids)
    settings._missing_recipient = missing
    return settings


def authorized_caregivers(db, patient_id):
    account_id = db.query(Patient.account_id).filter_by(id=patient_id).scalar()
    allowed = {row.user_id for row in db.query(PatientAccess.user_id).filter(
        PatientAccess.patient_id == patient_id, PatientAccess.is_active.is_(True),
        PatientAccess.access_level != AccessLevel.VIEWER,
        or_(PatientAccess.expires_at.is_(None), PatientAccess.expires_at > utc_now().replace(tzinfo=None)))}
    users = db.query(User).options(selectinload(User.roles).selectinload(Role.permissions)).filter_by(
        account_id=account_id, is_active=True).order_by(User.full_name, User.username)
    return [dict(id=user.id, name=user.full_name or user.username) for user in users
            if user.is_superuser or (user.id in allowed and user.has_permission('nutrition.read') and
                                     user.has_permission('nutrition.create'))]


def _recipient_edit(db, patient_id, draft, replace):
    """Preserve unresolved audience links until the caregiver explicitly replaces them."""
    if replace is True:
        return draft, True
    saved, missing = _saved_recipients(db, patient_id)
    preserve = replace is False
    if replace is None and not draft.check_recipient_ids:
        # Older clients have no way to represent deleted users. Their empty
        # list must not turn a restricted audience into the entire care team.
        preserve = missing or bool(saved and set(saved) - {u['id'] for u in authorized_caregivers(db, patient_id)})
    if preserve:
        copy = draft.model_copy(update={'check_recipient_ids': saved})
        copy._missing_recipient = missing
        return copy, False
    return draft, True


def validate_selections(db, patient_id, settings, *, check_recipients=True, preview=False):
    if check_recipients and settings.check_recipient_ids:
        allowed = {u['id'] for u in authorized_caregivers(db, patient_id)}
        if preview:
            # A previously selected caregiver can lose access. The saved configuration
            # remains previewable and keeps its restricted audience until someone edits it.
            allowed.update(row.user_id for row in db.query(ScheduleManagerRecipient.user_id).filter_by(patient_id=patient_id))
        if set(settings.check_recipient_ids) - allowed:
            raise HTTPException(422, 'Choose caregivers authorized to record for this care profile.')

    selected = set(settings.feed_schedule_ids) | set(settings.check_feed_ids)
    if selected:
        valid = eligible_schedules(db, patient_id).with_entities(NutritionSchedule.id).filter(
            NutritionSchedule.id.in_(selected)).all()
        if selected != {row.id for row in valid}:
            raise HTTPException(422, 'Choose active nutrition schedules on this care profile.')


def lock_patient(db, patient_id):
    # A patient row always exists; even the first settings save or manual check
    # can serialize with another caregiver's write before a profile row exists.
    db.query(Patient.id).filter_by(id=patient_id).with_for_update().one()


def save_settings(db, patient_id, settings, user_id, *, replace_check_recipients=None):
    lock_patient(db, patient_id)
    settings, replace = _recipient_edit(db, patient_id, settings, replace_check_recipients)
    validate_selections(db, patient_id, settings, check_recipients=replace)
    profile = db.query(ScheduleManagerProfile).filter_by(patient_id=patient_id).first()
    if profile is None:
        profile = ScheduleManagerProfile(patient_id=patient_id)
        db.add(profile)
    profile.preferences = settings.model_dump(exclude={'feed_schedule_ids', 'check_feed_ids', 'overnight_schedule_id', 'check_recipient_ids'})
    profile.overnight_schedule_id = settings.overnight_schedule_id
    profile.updated_by = user_id
    profile.updated_at = utc_now()
    managed, checks = set(settings.feed_schedule_ids), set(settings.check_feed_ids)
    existing = {row.schedule_id: row for row in db.query(ScheduleManagerFeed).filter_by(patient_id=patient_id)}
    for schedule_id in managed | checks:
        row = existing.pop(schedule_id, None)
        if row is None:
            row = ScheduleManagerFeed(patient_id=patient_id, schedule_id=schedule_id)
            db.add(row)
        row.manage_spacing = schedule_id in managed
        row.prompt_check = schedule_id in checks
    for removed in existing.values():
        db.delete(removed)
    # Replacing selections under the patient lock also clears orphaned links and
    # import-user duplicates if the caregiver chooses a new destination audience.
    if replace:
        db.query(ScheduleManagerRecipient).filter_by(patient_id=patient_id).delete(synchronize_session=False)
        db.add_all([ScheduleManagerRecipient(patient_id=patient_id, user_id=user_id)
                    for user_id in set(settings.check_recipient_ids)])
    db.commit()


def trigger_key(schedule_id, scheduled_time):
    if schedule_id is None or scheduled_time is None:
        return None
    return f'{schedule_id}/{make_utc(scheduled_time).isoformat()}'


def attach_check_outcomes(db, patient_id, rows, start, end):
    """Fill each scheduled check from its recorded outcome, with its original slot as identity."""
    checks = [row for row in rows if row.get('schedule_type') == 'diaper_check' and row.get('row_kind') == 'schedule']
    if not checks:
        return
    outcomes = db.query(ScheduleManagerAction).filter(
        ScheduleManagerAction.patient_id == patient_id, ScheduleManagerAction.check_schedule_id.isnot(None),
        ScheduleManagerAction.check_scheduled_time >= start, ScheduleManagerAction.check_scheduled_time < end)
    by_slot = {(row.check_schedule_id, make_utc(row.check_scheduled_time)): row for row in outcomes}
    for row in checks:
        row['row_kind'] = 'diaper_check'
        outcome = by_slot.get((row['schedule_id'], row['scheduled_time']))
        if outcome:
            row.update(completed=True, completed_at=make_utc(outcome.occurred_at).isoformat(),
                       completed_by=outcome.recorded_by, check_outcome=outcome.action, log_id=None)


def nearest_scheduled_check(db, patient_id, now, start, end):
    """An open fixed check in the current suggestion window can fulfil both reminders."""
    fixed = db.query(NutritionSchedule).filter_by(patient_id=patient_id, is_active=True, schedule_type='diaper_check').all()
    if not fixed:
        return None, None
    done = db.query(ScheduleManagerAction.check_schedule_id, ScheduleManagerAction.check_scheduled_time).filter(
        ScheduleManagerAction.patient_id == patient_id, ScheduleManagerAction.check_schedule_id.isnot(None),
        ScheduleManagerAction.check_scheduled_time >= start, ScheduleManagerAction.check_scheduled_time < end)
    completed = {(row.check_schedule_id, make_utc(row.check_scheduled_time)) for row in done}
    candidates = []
    for schedule in fixed:
        if not croniter.is_valid(schedule.cron_expression):
            continue
        try:
            for slot in croniter(schedule.cron_expression, start - timedelta(minutes=1)).all_next(datetime):
                if slot >= end:
                    break
                if slot >= start and (schedule.id, slot) not in completed:
                    candidates.append((abs(slot - now), slot, schedule.id))
        except CroniterBadDateError:
            # A syntactically valid recurring rule can specify an impossible date.
            continue
    if not candidates:
        return None, None
    _, slot, schedule_id = min(candidates)
    return schedule_id, slot


def current_suggestion(db, patient_id, settings, now, *, user_id=None):
    if not settings.checks_enabled:
        return None
    if (settings.check_recipient_ids or settings._missing_recipient) and user_id not in settings.check_recipient_ids:
        return None
    if settings.check_hours_start:
        clock = now.astimezone(resolve_tz_for_patient(db, patient_id)).strftime('%H:%M')
        start, end = settings.check_hours_start, settings.check_hours_end
        inside_window = start <= clock < end if start < end else clock >= start or clock < end
        if not inside_window:
            return None
    if not settings.check_feed_ids:
        return None
    ready_before = now - timedelta(minutes=settings.check_delay_minutes)
    expires_after = ready_before - timedelta(minutes=settings.check_window_minutes)
    # Scheduled_time identifies the actual feed occurrence: a flush can have
    # its parent's schedule_id too, but does not have its scheduled_time.
    feed = db.query(NutritionSchedule.name, NutritionIntake.schedule_id, NutritionIntake.scheduled_time,
                    NutritionIntake.consumed_at).join(
        NutritionSchedule, NutritionIntake.schedule_id == NutritionSchedule.id,
    ).filter(
        NutritionIntake.patient_id == patient_id, NutritionSchedule.patient_id == patient_id,
        NutritionSchedule.is_active.is_(True), NutritionIntake.voided_at.is_(None),
        NutritionIntake.schedule_id.in_(settings.check_feed_ids), NutritionIntake.scheduled_time.isnot(None),
        NutritionIntake.consumed_at > expires_after, NutritionIntake.consumed_at <= ready_before,
    ).order_by(NutritionIntake.consumed_at.desc(), NutritionIntake.id.desc()).first()
    if feed is None:
        return None

    actions = db.query(ScheduleManagerAction).filter(
        ScheduleManagerAction.patient_id == patient_id, ScheduleManagerAction.occurred_at <= now)
    latest_output = db.query(func.max(NutritionOutput.occurred_at)).filter(
        NutritionOutput.patient_id == patient_id, NutritionOutput.voided_at.is_(None),
        NutritionOutput.occurred_at <= now,
        or_(NutritionOutput.is_diaper.is_(True), NutritionOutput.location == 'diaper'),
    ).scalar()
    last_changed = actions.filter_by(action='changed').with_entities(func.max(ScheduleManagerAction.occurred_at)).scalar()
    last_change = max((make_utc(t) for t in (latest_output, last_changed) if t), default=None)
    start = make_utc(feed.consumed_at)
    if last_change and (last_change >= start or last_change > now - timedelta(minutes=settings.change_lookback_minutes)):
        return None

    last_observation = actions.filter_by(action='dry').with_entities(func.max(ScheduleManagerAction.occurred_at)).scalar()
    # Any documented change, including an ordinary bathroom entry, also counts as a check.
    last_check = max((make_utc(t) for t in (last_change, last_observation) if t), default=None)
    if last_check and (last_check >= start or last_check > now - timedelta(minutes=settings.check_cooldown_minutes)):
        return None
    if actions.filter(ScheduleManagerAction.action == 'snooze', ScheduleManagerAction.snooze_until > now).first():
        return None
    if actions.filter_by(trigger_schedule_id=feed.schedule_id, trigger_scheduled_at=feed.scheduled_time,
                         action='dismiss').first():
        return None
    ready = start + timedelta(minutes=settings.check_delay_minutes)
    radius = timedelta(minutes=settings.check_cooldown_minutes)
    fixed_id, fixed_at = nearest_scheduled_check(db, patient_id, now, max(ready, now - radius),
                                                 min(ready + timedelta(minutes=settings.check_window_minutes), now + radius))
    return dict(check_schedule_id=fixed_id, check_scheduled_time=fixed_at,
                trigger_key=trigger_key(feed.schedule_id, feed.scheduled_time), feed_name=feed.name,
                feed_started_at=start, last_change_at=last_change, schedule_id=feed.schedule_id,
                scheduled_at=make_utc(feed.scheduled_time))


def public_suggestion(suggestion):
    if suggestion is not None:
        return {key: suggestion[key] for key in ('trigger_key', 'feed_name', 'feed_started_at', 'last_change_at',
                                                 'check_schedule_id', 'check_scheduled_time')}
    return None


def manager_state(db, patient_id, *, user_id=None, can_record=True):
    settings = read_settings(db, patient_id)
    schedules = eligible_schedules(db, patient_id).order_by(NutritionSchedule.name, NutritionSchedule.id).all()
    history = db.query(ScheduleManagerAction, User.full_name).outerjoin(
        User, User.id == ScheduleManagerAction.recorded_by,
    ).filter(ScheduleManagerAction.patient_id == patient_id).order_by(
        ScheduleManagerAction.occurred_at.desc(), ScheduleManagerAction.id.desc(),
    ).limit(50).all()
    caregivers = authorized_caregivers(db, patient_id)
    available_ids = {row['id'] for row in caregivers}
    return {
        'caregivers': caregivers,
        'audience_needs_review': bool(settings._missing_recipient or set(settings.check_recipient_ids) - available_ids),
        'settings': settings,
        'schedules': [dict(id=s.id, name=s.name, schedule_type=s.schedule_type) for s in schedules],
        'suggestion': public_suggestion(current_suggestion(db, patient_id, settings, utc_now(), user_id=user_id)) if can_record else None,
        'history': [
            dict(id=a.id, action=a.action, occurred_at=make_utc(a.occurred_at),
                 recorded_by=a.recorded_by, recorded_by_name=name,
                 trigger_key=trigger_key(a.trigger_schedule_id, a.trigger_scheduled_at),
                 check_schedule_id=a.check_schedule_id, check_scheduled_time=a.check_scheduled_time)
            for a, name in history
        ],
    }


def preview(db, patient_id, settings, *, user_id=None, can_record=True, replace_check_recipients=None):
    from crud.scheduling import get_scheduled_nutrition

    settings, replace = _recipient_edit(db, patient_id, settings, replace_check_recipients)
    validate_selections(db, patient_id, settings, check_recipients=replace, preview=replace_check_recipients is None)
    now = utc_now()
    tz = resolve_tz_for_patient(db, patient_id)
    feeds = []
    if settings.feeds_enabled:
        rows = get_scheduled_nutrition(db, now.astimezone(tz).date(), patient_id, tz=tz, strict=True,
                                       feed_settings=settings, as_of=now)
        feeds = [dict(name=r['name'], schedule_id=r['schedule_id'], scheduled_time=r['scheduled_time'],
                      effective_time=r['effective_time'], completed=r['completed'], completed_at=r.get('completed_at'),
                      timing_reason=r.get('timing_reason'), overnight_target_at=r.get('overnight_target_at'),
                      start_override_at=r.get('start_override_at'),
                      overnight_delayed=bool(r.get('overnight_delayed'))) for r in rows if r.get('managed_feed')]
    suggestion = current_suggestion(db, patient_id, settings, now, user_id=user_id) if can_record else None
    return dict(feeds=feeds, suggestion=public_suggestion(suggestion))


def record_action(db, patient_id, action, user_id):
    lock_patient(db, patient_id)
    request_id = str(action.request_id) if action.request_id else None
    if request_id:
        previous = db.query(ScheduleManagerAction).filter_by(patient_id=patient_id, request_id=request_id).first()
        if previous:
            same_trigger = action.trigger_key == trigger_key(previous.trigger_schedule_id, previous.trigger_scheduled_at)
            requested_slot = (action.check_schedule_id, action.check_scheduled_time)
            saved_slot = (previous.check_schedule_id, previous.check_scheduled_time)
            same_check = action.check_schedule_id is None or requested_slot == saved_slot
            same_snooze = action.action != 'snooze' or (
                previous.snooze_until == previous.occurred_at + timedelta(minutes=action.snooze_minutes))
            if previous.action != action.action or not (same_trigger and same_check and same_snooze):
                raise HTTPException(409, 'This request already recorded a different action.')
            return
    now = utc_now()
    settings = read_settings(db, patient_id)
    if not (settings.checks_enabled or settings.manual_checks_enabled or action.check_schedule_id is not None):
        raise HTTPException(409, 'Bathroom checks are turned off for this care profile.')
    trigger = None
    if action.trigger_key:
        trigger = current_suggestion(db, patient_id, settings, now, user_id=user_id)
        if trigger is None or trigger['trigger_key'] != action.trigger_key:
            raise HTTPException(409, 'This suggestion has already been handled or expired. Refresh the schedule.')
    fixed_id = action.check_schedule_id
    fixed_at = make_utc(action.check_scheduled_time) if action.check_scheduled_time else None
    if fixed_id is not None:
        if trigger and (fixed_id, fixed_at) != (trigger['check_schedule_id'], trigger['check_scheduled_time']):
            raise HTTPException(409, 'The scheduled check linked to this suggestion has changed.')
        schedule = db.query(NutritionSchedule).filter_by(
            id=fixed_id, patient_id=patient_id, is_active=True, schedule_type='diaper_check').first()
        if (not schedule or not croniter.is_valid(schedule.cron_expression)
                or fixed_at.second or fixed_at.microsecond or not croniter.match(schedule.cron_expression, fixed_at)):
            raise HTTPException(422, 'Choose an existing scheduled diaper check on this care profile.')
    elif trigger and action.action in ('dry', 'changed'):
        fixed_id, fixed_at = trigger['check_schedule_id'], trigger['check_scheduled_time']
    if fixed_id is not None and db.query(ScheduleManagerAction.id).filter_by(
            patient_id=patient_id, check_schedule_id=fixed_id, check_scheduled_time=fixed_at).first():
        raise HTTPException(409, 'Another caregiver already recorded this scheduled check. Refresh the schedule.')
    entry = ScheduleManagerAction(
        check_schedule_id=fixed_id, check_scheduled_time=fixed_at,
        patient_id=patient_id, action=action.action, occurred_at=now, recorded_by=user_id, request_id=request_id,
        trigger_schedule_id=trigger['schedule_id'] if trigger else None,
        trigger_scheduled_at=trigger['scheduled_at'] if trigger else None,
        snooze_until=now + timedelta(minutes=action.snooze_minutes) if action.action == 'snooze' else None)
    db.add(entry)
    db.commit()
