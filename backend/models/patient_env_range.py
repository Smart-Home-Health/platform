#
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
#
from sqlalchemy import (
    Column, Integer, String, Float, Text, ForeignKey, TIMESTAMP,
    UniqueConstraint,
)

from db import Base


class PatientEnvRange(Base):
    """What counts as an acceptable room for one patient.

    Deliberately a separate table from patient_vital_ranges rather than more
    rows in it. That table feeds vital_validation, which drives the capture
    flow's out-of-range warning and the 422/409 gate on saving a reading —
    room CO2 is not a vital, and putting it there would make the capture
    screen start arguing about the air.

    Two bands per metric, the same shape for every one of them:
      caution_*  — worth noticing
      critical_* — worth acting on
    A metric only needs the sides that mean something. CO2 and PM2.5 have no
    floor, so their *_min columns stay NULL and nothing reads them; room
    temperature is bounded both ways. PM2.5's two ceilings are what give the
    timeline its green / amber / red bar without a third concept.

    NULL on a side means "no bound" — never zero. Absent rows mean the patient
    has not been configured and the caller falls back to DEFAULT_ENV_RANGES.
    """

    __tablename__ = 'patient_env_ranges'
    __table_args__ = (
        UniqueConstraint('patient_id', 'metric', name='uq_patient_env_range'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    # Key from environment.metrics.METRICS, e.g. 'temperature', 'co2'.
    metric = Column(String(50), nullable=False)
    caution_min = Column(Float, nullable=True)
    caution_max = Column(Float, nullable=True)
    critical_min = Column(Float, nullable=True)
    critical_max = Column(Float, nullable=True)
    note = Column(Text, nullable=True)
    set_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    set_at = Column(TIMESTAMP(timezone=True), nullable=False)
