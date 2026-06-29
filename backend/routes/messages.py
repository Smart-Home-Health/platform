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
User attention messages API — the "obnoxious" alert/messaging flow.

GET /active runs the message generators (currently low-medication stock)
before returning, so simply polling it keeps generated messages current
without a background scheduler.
"""
import logging
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db import get_db
from crud.user_messages import (
    create_message,
    delete_message,
    dismiss_message,
    get_active_messages,
    get_message_by_id,
    get_messages_paginated,
    snooze_message,
    sync_low_medication_messages,
)
from utils.datetime_utils import utc_now

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/messages", tags=["messages"])


# --- Pydantic models ---

class MessageCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body: Optional[str] = None
    type: str = Field(default='general', max_length=50)
    severity: str = Field(default='info', pattern='^(info|warning|critical)$')
    dismissible: bool = True
    snoozable: bool = True
    # 'anyone': one user clearing it clears it for all; 'per_user': every
    # user must acknowledge it individually
    ack_scope: str = Field(default='anyone', pattern='^(anyone|per_user)$')
    patient_id: Optional[int] = None
    dedupe_key: Optional[str] = Field(None, max_length=255)


class SnoozeRequest(BaseModel):
    minutes: int = Field(..., ge=1, le=60 * 24 * 7)  # up to a week


def _serialize(message) -> dict:
    return {
        "id": message.id,
        "patient_id": message.patient_id,
        "type": message.type,
        "severity": message.severity,
        "title": message.title,
        "body": message.body,
        "dismissible": message.dismissible,
        "snoozable": message.snoozable,
        "ack_scope": message.ack_scope,
        "status": message.status,
        "snoozed_until": message.snoozed_until.isoformat() if message.snoozed_until else None,
        "dismissed_at": message.dismissed_at.isoformat() if message.dismissed_at else None,
        "resolved_at": message.resolved_at.isoformat() if message.resolved_at else None,
        "data": message.data,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "updated_at": message.updated_at.isoformat() if message.updated_at else None,
    }


# --- Routes ---

@router.get("/active")
def list_active_messages(request: Request, db: Session = Depends(get_db)):
    """Messages the current user must act on right now. Runs generators first
    so the list reflects current conditions (e.g. medication restocked
    elsewhere). Per-user-ack messages already acknowledged or snoozed by this
    user are excluded."""
    try:
        sync_low_medication_messages(db)
    except Exception as e:
        # A generator bug must not block delivery of existing messages
        logger.error(f"Low-medication message sync failed: {e}")
        db.rollback()
    messages = get_active_messages(
        db,
        user_id=getattr(request.state, 'user_id', None),
        account_id=getattr(request.state, 'account_id', None),
    )
    return {"items": [_serialize(m) for m in messages], "count": len(messages)}


@router.get("")
def list_messages(
    status: Optional[str] = Query(None, pattern='^(active|dismissed|resolved)$'),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Paginated message history (admin view)."""
    result = get_messages_paginated(db, status=status, page=page, page_size=page_size)
    return {**result, "items": [_serialize(m) for m in result["items"]]}


@router.post("", status_code=201)
def create_new_message(data: MessageCreate, request: Request, db: Session = Depends(get_db)):
    """Create a message to surface to users (manual broadcast or integration)."""
    message = create_message(
        db,
        title=data.title,
        body=data.body,
        type=data.type,
        severity=data.severity,
        dismissible=data.dismissible,
        snoozable=data.snoozable,
        ack_scope=data.ack_scope,
        dedupe_key=data.dedupe_key,
        patient_id=data.patient_id,
        account_id=getattr(request.state, 'account_id', None),
    )
    return {"status": "success", "message": _serialize(message)}


@router.post("/{message_id}/dismiss")
def dismiss_message_endpoint(message_id: int, request: Request, db: Session = Depends(get_db)):
    message = get_message_by_id(db, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if not message.dismissible:
        raise HTTPException(status_code=409, detail="This message cannot be dismissed — it clears when the underlying condition is resolved")
    dismiss_message(db, message_id, user_id=getattr(request.state, 'user_id', None))
    return {"status": "success", "message": _serialize(message)}


@router.post("/{message_id}/snooze")
def snooze_message_endpoint(message_id: int, data: SnoozeRequest, request: Request, db: Session = Depends(get_db)):
    message = get_message_by_id(db, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if not message.snoozable:
        raise HTTPException(status_code=409, detail="This message cannot be snoozed")
    until = utc_now() + timedelta(minutes=data.minutes)
    snooze_message(db, message_id, until, user_id=getattr(request.state, 'user_id', None))
    return {"status": "success", "snoozed_until": until.isoformat(), "message": _serialize(message)}


@router.delete("/{message_id}")
def delete_message_endpoint(message_id: int, db: Session = Depends(get_db)):
    if not delete_message(db, message_id):
        raise HTTPException(status_code=404, detail="Message not found")
    return {"status": "success"}
