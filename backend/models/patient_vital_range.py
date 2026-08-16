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
    Column, Integer, String, Float, Boolean, Text, ForeignKey, TIMESTAMP,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from db import Base


class PatientVitalRange(Base):
    """Per-patient expected/implausible bounds and required flag for one vital.

    ``field_key`` distinguishes blood-pressure components ('systolic'/
    'diastolic'); scalar vitals use '' (NOT NULL so the unique constraint
    dedupes — Postgres treats NULLs as distinct). ``required`` is only
    meaningful on the ``field_key=''`` row; BP components inherit it.
    Expected bounds are user-configured, not clinical guidance; implausible
    bounds fall back to global physics-limit defaults when NULL
    (see vital_validation.DEFAULT_IMPLAUSIBLE).
    """
    __tablename__ = 'patient_vital_ranges'
    __table_args__ = (
        UniqueConstraint('patient_id', 'vital_key', 'field_key',
                         name='uq_patient_vital_ranges_key'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    vital_key = Column(String(50), nullable=False)  # 'blood_pressure', 'spo2', or a custom-definition name
    field_key = Column(String(20), nullable=False, default='', server_default='')
    expected_min = Column(Float, nullable=True)
    expected_max = Column(Float, nullable=True)
    implausible_min = Column(Float, nullable=True)
    implausible_max = Column(Float, nullable=True)
    required = Column(Boolean, nullable=False, default=False, server_default='false')
    note = Column(Text, nullable=True)
    set_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    set_at = Column(TIMESTAMP(timezone=True), nullable=False)

    patient = relationship('Patient', backref='vital_ranges')

    def to_dict(self):
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'vital_key': self.vital_key,
            'field_key': self.field_key,
            'expected_min': self.expected_min,
            'expected_max': self.expected_max,
            'implausible_min': self.implausible_min,
            'implausible_max': self.implausible_max,
            'required': self.required,
            'note': self.note,
            'set_by': self.set_by,
            'set_at': self.set_at.isoformat() if self.set_at else None,
        }
