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
    Column, Integer, String, Float, ForeignKey, TIMESTAMP, BigInteger, Index,
    UniqueConstraint,
)
from schemas import Base


class EnvironmentalObservation(Base):
    """
    One normalized environmental reading (weather, indoor air quality, …).

    Home-level, not patient-level: environment is shared, so rows carry no
    patient_id — patient association happens at analysis/overlay time.
    Vocabulary fields (metric/unit/scope/quality) are validated against
    ``environment.metrics`` on ingest; `unit` is always the metric's canonical
    unit, denormalized so rows are self-describing.

    TimescaleDB hypertable (migration 036), partitioned on `timestamp`.
    """
    __tablename__ = 'environmental_observations'

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    # Part of the composite PK: TimescaleDB requires the hypertable partition
    # column in every PK/UNIQUE constraint. `id` keeps its own sequence.
    timestamp = Column(TIMESTAMP(timezone=True), primary_key=True, nullable=False)

    # Written NULL in v1 (single-home installs); present for forward-compat
    # with multi-account, matching Vital.account_id.
    account_id = Column(
        Integer, ForeignKey('accounts.id', ondelete='CASCADE'),
        nullable=True, index=True,
    )

    metric = Column(String(50), nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String(20), nullable=False)

    scope = Column(String(10), nullable=False)  # outdoor / indoor / room
    # Empty string = whole-scope reading. NOT NULL so it can participate in
    # the dedup unique constraint (NULLs are distinct in PG unique indexes).
    location = Column(String(100), nullable=False, server_default='')

    source_type = Column(String(50), nullable=False)  # connector slug
    source_id = Column(String(100), nullable=True)    # station/device id
    quality = Column(String(10), nullable=False, server_default='measured')

    __table_args__ = (
        # Dedup backbone: one reading per source per metric per place per
        # instant. Ingest uses INSERT .. ON CONFLICT DO NOTHING against this,
        # which is what makes re-polls and backfill idempotent.
        UniqueConstraint(
            'source_type', 'metric', 'scope', 'location', 'timestamp',
            name='uq_env_obs_source_metric_place_ts',
        ),
        Index('ix_env_obs_metric_time', 'metric', 'timestamp'),
        Index('ix_env_obs_scope_loc_time', 'scope', 'location', 'timestamp'),
    )
