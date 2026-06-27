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
    Column, Integer, String, Float, Text, ForeignKey, TIMESTAMP, BigInteger, Index
)
from sqlalchemy.orm import relationship
from schemas import Base


class VentSample(Base):
    """
    Long-format fact table: one row per (timestamp, parameter_key, value) sample
    parsed from a ventilator log export.

    `recorded_at_raw` is the vent's reported clock time (immutable, audit).
    `recorded_at` is `_raw` plus the per-integration clock offset; mutated by
    calibration without re-parsing via UPDATE statements.
    """
    __tablename__ = 'vent_samples'

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    import_id = Column(
        String(36), ForeignKey('vent_imports.id', ondelete='CASCADE'),
        nullable=False,
    )
    patient_id = Column(
        Integer, ForeignKey('patients.id', ondelete='CASCADE'),
        nullable=False,
    )

    recorded_at_raw = Column(TIMESTAMP(timezone=True), nullable=False)
    # Part of the composite PK: TimescaleDB requires the hypertable partition
    # column in every PK/UNIQUE constraint. `id` keeps its own sequence.
    recorded_at = Column(TIMESTAMP(timezone=True), primary_key=True, nullable=False)

    parameter_key = Column(String(100), nullable=False)
    # _N (single sample) / _5 / _50 / _95 (percentile aggregates). NULL if none.
    parameter_suffix = Column(String(8), nullable=True)

    value_numeric = Column(Float, nullable=True)
    value_text = Column(Text, nullable=True)

    source_message_type = Column(String(4), nullable=True)   # H/M/E
    source_message_id = Column(Integer, nullable=True)

    import_ = relationship('VentImport', back_populates='samples')

    __table_args__ = (
        Index('ix_vent_samples_import_id', 'import_id'),
        Index('ix_vent_samples_patient_at', 'patient_id', 'recorded_at'),
        Index('ix_vent_samples_param_key', 'parameter_key'),
    )
