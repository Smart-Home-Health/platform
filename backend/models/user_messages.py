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
User-facing attention messages (the "obnoxious" alert flow).

A UserMessage is anything the system (or an admin) wants to force in front of
the user — low medication stock, a manual broadcast, etc. Active messages are
surfaced in a blocking modal on login and re-surface until each one is
dismissed, snoozed, or auto-resolved by its generator.

Lifecycle (`status`):
  active    — shown to the user (unless `snoozed_until` is in the future)
  dismissed — user acknowledged it; never shown again
  resolved  — the underlying condition cleared (e.g. medication restocked);
              generators resolve rather than delete so a fresh episode of the
              same condition creates a NEW message

`dedupe_key` lets generators upsert: while an unresolved message with the same
key exists, the generator updates it in place instead of stacking duplicates.

Acknowledgement scope (`ack_scope`):
  anyone   — one user dismissing/snoozing clears/hides it for everyone
  per_user — every user must acknowledge individually; dismiss/snooze state is
             tracked per user in UserMessageAcknowledgement and the message
             only stops surfacing for the users who acted on it
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, TIMESTAMP, JSON, UniqueConstraint

from db import Base


class UserMessage(Base):
    __tablename__ = 'user_messages'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=True)
    type = Column(String(50), nullable=False, default='general')  # e.g. 'low_medication', 'general'
    severity = Column(String(20), nullable=False, default='info')  # info | warning | critical
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    # Behavior flags set by the creator/generator; the frontend only offers
    # the actions a message allows (a critical message can be snooze-only).
    dismissible = Column(Boolean, nullable=False, default=True)
    snoozable = Column(Boolean, nullable=False, default=True)
    ack_scope = Column(String(20), nullable=False, default='anyone')  # anyone | per_user
    dedupe_key = Column(String(255), nullable=True, index=True)
    status = Column(String(20), nullable=False, default='active', index=True)  # active | dismissed | resolved
    snoozed_until = Column(TIMESTAMP(timezone=True), nullable=True)
    dismissed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    dismissed_by_user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    resolved_at = Column(TIMESTAMP(timezone=True), nullable=True)
    # Structured payload for the frontend (e.g. {"medication_id": 5, "quantity": 3})
    data = Column(JSON, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)


class UserMessageAcknowledgement(Base):
    """Per-user dismiss/snooze state for ack_scope='per_user' messages.

    A row with `acknowledged_at` set means that user has permanently cleared
    the message for themselves; a row with only `snoozed_until` set means they
    snoozed it and it re-surfaces for them once the snooze expires.
    """
    __tablename__ = 'user_message_acknowledgements'
    __table_args__ = (
        UniqueConstraint('message_id', 'user_id', name='uq_user_message_ack'),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(Integer, ForeignKey('user_messages.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    acknowledged_at = Column(TIMESTAMP(timezone=True), nullable=True)
    snoozed_until = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
