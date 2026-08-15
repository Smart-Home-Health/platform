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
from sqlalchemy import (
    Boolean, Column, Float, ForeignKey, Integer, String, Text, TIMESTAMP,
)
from schemas import Base


class HAEntityMapping(Base):
    """
    One inbound Home Assistant entity -> SHH target mapping.

    ``target_kind`` decides which target columns apply:
    - "vital": patient_id + vital_type (+ optional vital_group) -> vitals table
    - "environment": metric + scope (+ optional location) -> environmental_observations
    """
    __tablename__ = 'ha_entity_mappings'

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'),
                        nullable=True, index=True)
    # One mapping per entity keeps ingestion routing unambiguous.
    entity_id = Column(String(255), nullable=False, unique=True)

    # Picker metadata cached at save time (display only; refreshed on edit).
    friendly_name = Column(String(255), nullable=True)
    device_class = Column(String(50), nullable=True)
    source_unit = Column(String(50), nullable=True)

    target_kind = Column(String(20), nullable=False)  # "vital" | "environment"

    # vital target
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'),
                        nullable=True, index=True)
    vital_type = Column(String(50), nullable=True)
    vital_group = Column(String(50), nullable=True)

    # environment target
    metric = Column(String(50), nullable=True)
    scope = Column(String(20), nullable=True)
    location = Column(String(100), nullable=True, default="")

    enabled = Column(Boolean, nullable=False, default=True)
    # 0 = record every state change; otherwise skip changes arriving sooner
    # than this many seconds after the last recorded one.
    min_interval_seconds = Column(Integer, nullable=False, default=0)

    # Staleness/debug surface for the admin UI.
    last_seen_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_value = Column(Float, nullable=True)
    last_error = Column(Text, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False)
