# Smart Home Health Hub
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
CRUD + generators for user-facing attention messages.

`sync_low_medication_messages` is the first generator: it is run on-demand by
the GET /api/messages/active endpoint (no scheduler needed — the messages only
matter when someone is looking), upserting one message per low medication via
`dedupe_key` and auto-resolving when stock recovers.
"""
import logging
from datetime import timedelta
from typing import Optional, List

from croniter import croniter
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.user_messages import UserMessage, UserMessageAcknowledgement
from models.users import User
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.patient import Patient
from utils.datetime_utils import utc_now

logger = logging.getLogger("app")


def get_message_by_id(db: Session, message_id: int) -> Optional[UserMessage]:
    return db.query(UserMessage).filter(UserMessage.id == message_id).first()


def get_active_messages(db: Session, user_id: Optional[int] = None,
                        account_id: Optional[int] = None,
                        include_snoozed: bool = False) -> List[UserMessage]:
    """Messages that should be in the given user's face right now.

    A snoozed message is still status='active'; it is just hidden until
    `snoozed_until` passes, after which it re-surfaces automatically.

    For ack_scope='per_user' messages, dismiss/snooze state lives in the
    per-user acknowledgement row instead of on the message, so the same
    message can be cleared for one user and still surface for another.
    """
    query = db.query(UserMessage).filter(UserMessage.status == 'active')
    if account_id is not None:
        query = query.filter(
            (UserMessage.account_id == account_id) | (UserMessage.account_id == None)  # noqa: E711
        )
    messages = query.order_by(UserMessage.created_at.desc()).all()

    ack_map = {}
    if user_id is not None:
        per_user_ids = [m.id for m in messages if m.ack_scope == 'per_user']
        if per_user_ids:
            acks = db.query(UserMessageAcknowledgement).filter(
                UserMessageAcknowledgement.user_id == user_id,
                UserMessageAcknowledgement.message_id.in_(per_user_ids)
            ).all()
            ack_map = {a.message_id: a for a in acks}

    now = utc_now()
    visible = []
    for m in messages:
        if m.ack_scope == 'per_user':
            ack = ack_map.get(m.id)
            if ack:
                if ack.acknowledged_at is not None:
                    continue
                if not include_snoozed and ack.snoozed_until and ack.snoozed_until > now:
                    continue
        elif not include_snoozed and m.snoozed_until and m.snoozed_until > now:
            continue
        visible.append(m)

    # Critical first, then newest first within a severity
    severity_order = {'critical': 0, 'warning': 1, 'info': 2}
    visible.sort(key=lambda m: severity_order.get(m.severity, 3))
    return visible


def get_messages_paginated(db: Session, status: Optional[str] = None,
                           page: int = 1, page_size: int = 20) -> dict:
    query = db.query(UserMessage)
    if status:
        query = query.filter(UserMessage.status == status)
    total = query.count()
    items = (query.order_by(UserMessage.created_at.desc())
             .offset((page - 1) * page_size).limit(page_size).all())
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total else 0,
    }


def create_message(db: Session, title: str, body: Optional[str] = None,
                   type: str = 'general', severity: str = 'info',
                   dismissible: bool = True, snoozable: bool = True,
                   ack_scope: str = 'anyone',
                   dedupe_key: Optional[str] = None, patient_id: Optional[int] = None,
                   account_id: Optional[int] = None, data: Optional[dict] = None) -> UserMessage:
    """Create a message; with a dedupe_key, update the existing active message
    in place instead of stacking a duplicate. A dismissed message with the same
    key stays dismissed (the user already acknowledged this episode).

    Concurrency: a partial unique index (one open message per dedupe_key)
    backs this check; if a concurrent request wins the insert race we fall
    back to updating its row."""
    now = utc_now()

    if dedupe_key:
        existing = db.query(UserMessage).filter(
            UserMessage.dedupe_key == dedupe_key,
            UserMessage.status.in_(['active', 'dismissed'])
        ).first()
        if existing:
            existing.title = title
            existing.body = body
            existing.severity = severity
            existing.dismissible = dismissible
            existing.snoozable = snoozable
            existing.ack_scope = ack_scope
            existing.data = data
            existing.updated_at = now
            db.commit()
            db.refresh(existing)
            return existing

    message = UserMessage(
        account_id=account_id,
        patient_id=patient_id,
        type=type,
        severity=severity,
        title=title,
        body=body,
        dismissible=dismissible,
        snoozable=snoozable,
        ack_scope=ack_scope,
        dedupe_key=dedupe_key,
        status='active',
        data=data,
        created_at=now,
        updated_at=now,
    )
    db.add(message)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request inserted the same dedupe_key first — update
        # that row instead so the caller still gets the one open message.
        db.rollback()
        winner = db.query(UserMessage).filter(
            UserMessage.dedupe_key == dedupe_key,
            UserMessage.status.in_(['active', 'dismissed'])
        ).first()
        if winner is None:
            raise
        winner.title = title
        winner.body = body
        winner.severity = severity
        winner.dismissible = dismissible
        winner.snoozable = snoozable
        winner.ack_scope = ack_scope
        winner.data = data
        winner.updated_at = now
        db.commit()
        db.refresh(winner)
        return winner
    db.refresh(message)
    logger.info(f"User message created: [{severity}] {title}")
    return message


def _get_or_create_ack(db: Session, message_id: int, user_id: int) -> UserMessageAcknowledgement:
    ack = db.query(UserMessageAcknowledgement).filter(
        UserMessageAcknowledgement.message_id == message_id,
        UserMessageAcknowledgement.user_id == user_id
    ).first()
    if not ack:
        now = utc_now()
        ack = UserMessageAcknowledgement(
            message_id=message_id, user_id=user_id,
            created_at=now, updated_at=now,
        )
        db.add(ack)
    return ack


def dismiss_message(db: Session, message_id: int, user_id: Optional[int] = None) -> Optional[UserMessage]:
    message = get_message_by_id(db, message_id)
    if not message:
        return None
    if not message.dismissible:
        return message  # caller checks dismissible and returns 409
    now = utc_now()

    if message.ack_scope == 'per_user' and user_id is not None:
        ack = _get_or_create_ack(db, message_id, user_id)
        ack.acknowledged_at = now
        ack.updated_at = now
        message.updated_at = now
        # Once every active user in scope has acknowledged, close the message
        # out so it stops appearing for users created later.
        users_query = db.query(User.id).filter(User.is_active == True)  # noqa: E712
        if message.account_id is not None:
            users_query = users_query.filter(User.account_id == message.account_id)
        user_ids = {u.id for u in users_query.all()}
        acked_ids = {a.user_id for a in db.query(UserMessageAcknowledgement).filter(
            UserMessageAcknowledgement.message_id == message_id,
            UserMessageAcknowledgement.acknowledged_at != None  # noqa: E711
        ).all()}
        acked_ids.add(user_id)
        if user_ids and user_ids <= acked_ids:
            message.status = 'dismissed'
            message.dismissed_at = now
        db.commit()
        db.refresh(message)
        return message

    message.status = 'dismissed'
    message.dismissed_at = now
    message.dismissed_by_user_id = user_id
    message.updated_at = now
    db.commit()
    db.refresh(message)
    return message


def snooze_message(db: Session, message_id: int, until,
                   user_id: Optional[int] = None) -> Optional[UserMessage]:
    message = get_message_by_id(db, message_id)
    if not message:
        return None
    now = utc_now()
    if message.ack_scope == 'per_user' and user_id is not None:
        ack = _get_or_create_ack(db, message_id, user_id)
        ack.snoozed_until = until
        ack.updated_at = now
    else:
        message.snoozed_until = until
    message.updated_at = now
    db.commit()
    db.refresh(message)
    return message


def resolve_message(db: Session, message: UserMessage) -> UserMessage:
    now = utc_now()
    message.status = 'resolved'
    message.resolved_at = now
    message.updated_at = now
    db.commit()
    return message


def delete_message(db: Session, message_id: int) -> bool:
    message = get_message_by_id(db, message_id)
    if not message:
        return False
    db.delete(message)
    db.commit()
    return True


# --- Generators -------------------------------------------------------------

def estimate_daily_consumption(db: Session, medication_id: int) -> float:
    """Average dose units consumed per day across a med's active schedules,
    projected over the next 7 days via croniter (so weekly patterns like
    Mon/Wed/Fri average out correctly). Returns 0 if nothing is scheduled."""
    schedules = db.query(MedicationSchedule).filter(
        MedicationSchedule.medication_id == medication_id,
        MedicationSchedule.active == True  # noqa: E712
    ).all()

    now = utc_now()
    horizon = now + timedelta(days=7)
    total = 0.0
    for schedule in schedules:
        dose = float(schedule.dose_amount or 0)
        if dose <= 0:
            continue
        try:
            cron = croniter(schedule.cron_expression, now)
            occurrence = cron.get_next(type(now))
            while occurrence < horizon:
                total += dose
                occurrence = cron.get_next(type(now))
        except Exception as e:
            logger.warning(f"Skipping bad cron '{schedule.cron_expression}' on schedule {schedule.id}: {e}")
    return total / 7


def sync_low_medication_messages(db: Session) -> None:
    """Upsert a low-stock message per tracked medication, keyed
    `low_med:{medication_id}`.

    - quantity <= 0      → critical, snooze-only (clears by restocking)
    - below threshold    → warning, dismissible + snoozable
    - above threshold    → resolve any open/dismissed message so a future
                           drop starts a fresh episode

    The threshold is interpreted per `low_stock_threshold_type`: 'quantity'
    compares the raw on-hand amount; 'days' projects days of supply left from
    the med's active schedules and compares against the threshold in days
    (meds with no scheduled consumption can't be projected and are skipped).
    Medications without a `low_stock_threshold` are not monitored (except the
    quantity-0 case, which always alerts for inventory-tracked meds).
    """
    meds = db.query(Medication).outerjoin(
        Patient, Medication.patient_id == Patient.id
    ).filter(
        Medication.active == True,  # noqa: E712
        Medication.quantity != None,  # noqa: E711
        # Meds belonging to an inactive (hidden) patient don't alert;
        # global meds (patient_id NULL) always do
        (Medication.patient_id == None) | (Patient.is_active == True)  # noqa: E711,E712
    ).all()

    for med in meds:
        dedupe_key = f"low_med:{med.id}"
        threshold = med.low_stock_threshold
        threshold_type = med.low_stock_threshold_type or 'quantity'
        quantity = float(med.quantity)
        out_of_stock = quantity <= 0

        low = False
        days_left = None
        if not out_of_stock and threshold is not None:
            if threshold_type == 'days':
                daily_rate = estimate_daily_consumption(db, med.id)
                if daily_rate > 0:
                    days_left = quantity / daily_rate
                    low = days_left <= float(threshold)
            else:
                low = quantity <= float(threshold)

        if out_of_stock or low:
            unit = med.quantity_unit or 'units'
            patient_name = None
            if med.patient_id:
                patient = db.query(Patient).filter(Patient.id == med.patient_id).first()
                if patient:
                    patient_name = f"{patient.first_name or ''} {patient.last_name or ''}".strip() or None
            if out_of_stock:
                title = f"{med.name} is out of stock"
                body = f"There are no {unit} of {med.name} on hand. Restock it to clear this alert."
            elif threshold_type == 'days':
                title = f"{med.name} is running low"
                body = (f"Only {med.quantity:g} {unit} of {med.name} left — about "
                        f"{days_left:.1f} days at the current schedule "
                        f"(alert at {threshold:g} days). Consider requesting a refill.")
            else:
                title = f"{med.name} is running low"
                body = (f"Only {med.quantity:g} {unit} of {med.name} left "
                        f"(low-stock threshold: {threshold:g}). Consider requesting a refill.")
            create_message(
                db,
                title=title,
                body=body,
                type='low_medication',
                severity='critical' if out_of_stock else 'warning',
                # Out-of-stock can't be waved away — it resolves by restocking
                dismissible=not out_of_stock,
                snoozable=True,
                dedupe_key=dedupe_key,
                patient_id=med.patient_id,
                account_id=med.account_id,
                data={
                    "medication_id": med.id,
                    "quantity": med.quantity,
                    "quantity_unit": med.quantity_unit,
                    "low_stock_threshold": threshold,
                    "low_stock_threshold_type": threshold_type,
                    "days_left": round(days_left, 1) if days_left is not None else None,
                    "patient_name": patient_name,
                },
            )
        else:
            # Restocked: close out the episode (active OR dismissed) so the
            # next time stock drops a brand-new message is raised.
            open_msg = db.query(UserMessage).filter(
                UserMessage.dedupe_key == dedupe_key,
                UserMessage.status.in_(['active', 'dismissed'])
            ).first()
            if open_msg:
                resolve_message(db, open_msg)

    # Resolve messages whose med fell out of monitoring entirely (med or its
    # patient deactivated, med deleted) — the loop above never visits those.
    monitored_keys = {f"low_med:{med.id}" for med in meds}
    stale = db.query(UserMessage).filter(
        UserMessage.type == 'low_medication',
        UserMessage.status.in_(['active', 'dismissed']),
        ~UserMessage.dedupe_key.in_(monitored_keys)  # noqa: E712
    ).all()
    for msg in stale:
        resolve_message(db, msg)
