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
    Column, Integer, String, Boolean, ForeignKey, TIMESTAMP, UniqueConstraint,
)

from db import Base


class PatientVentPin(Base):
    """Which ventilator parameters lead the page for one patient.

    A vent day carries ~44 parameters and the device offers no opinion about
    which matter, so this is the care team's. Keyed by vendor as well as
    parameter because the key space is the vendor's: VOCSN's 9408 is breath
    rate, another vendor's 9408 is whatever they decided.

    `position` is the display order, not a rank — the page renders pins in it
    so a reordering does not have to touch every row's meaning.
    """

    __tablename__ = 'patient_vent_pins'
    __table_args__ = (
        UniqueConstraint('patient_id', 'vendor', 'parameter_key',
                         name='uq_patient_vent_pin'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    vendor = Column(String(50), nullable=False)
    parameter_key = Column(String(100), nullable=False)
    position = Column(Integer, nullable=False, default=0, server_default='0')
    set_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    set_at = Column(TIMESTAMP(timezone=True), nullable=False)


class PatientVentPinState(Base):
    """Whether a patient's pins have been chosen at all.

    Without this, "no rows" is ambiguous: it means both "nobody has been here
    yet, show the defaults" and "somebody deliberately unpinned everything".
    Collapsing the two makes clearing the last pin silently restore six
    defaults, which reads as the app overruling the person who just cleared
    them. One row per patient/vendor, written the first time pins are saved.
    """

    __tablename__ = 'patient_vent_pin_state'
    __table_args__ = (
        UniqueConstraint('patient_id', 'vendor', name='uq_patient_vent_pin_state'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(Integer, ForeignKey('patients.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    vendor = Column(String(50), nullable=False)
    configured = Column(Boolean, nullable=False, default=True, server_default='true')
    set_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    set_at = Column(TIMESTAMP(timezone=True), nullable=False)
