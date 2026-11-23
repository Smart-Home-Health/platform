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
from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, JSON, String, Text, TIMESTAMP, UniqueConstraint

from schemas import Base


class EventDiary(Base):
    __tablename__ = 'event_diaries'

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    starts_at = Column(TIMESTAMP(timezone=True), nullable=False)
    ends_at = Column(TIMESTAMP(timezone=True))
    buttons = Column(JSON, nullable=False)
    include_medications = Column(Boolean, nullable=False)
    include_nutrition = Column(Boolean, nullable=False)


class DiaryEvent(Base):
    __tablename__ = 'diary_events'
    __table_args__ = (
        UniqueConstraint('diary_id', 'request_id', name='uq_diary_event_request'),
        Index('ix_diary_event_time', 'diary_id', 'observed_at'),
    )

    id = Column(Integer, primary_key=True)
    diary_id = Column(Integer, ForeignKey('event_diaries.id', ondelete='CASCADE'), nullable=False)
    request_id = Column(String(36), nullable=False)
    observed_at = Column(TIMESTAMP(timezone=True), nullable=False)
    label = Column(String(80), nullable=False)
    question = Column(String(160))
    answer = Column(String(8))
    note = Column(Text, nullable=False)
    recorded_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
