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
"""Per-patient ventilator parameter pins: resolve (defaults or chosen) and save."""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from models.patient_vent_pin import PatientVentPin, PatientVentPinState

# Where a new patient starts, until somebody says otherwise. These are the
# respiratory parameters a carer looks at first, and every one of them is
# present in the shipped VOCSN dictionary with a label, units and a scale
# factor — an invented key would render as a blank row.
#
# Vendor-scoped because the key space is: 9408 is VOCSN's breath rate and
# means nothing to another manufacturer. A vendor with no entry here simply
# starts unpinned, which is honest — we have no idea what matters on a device
# we have never seen.
DEFAULT_VENT_PINS = {
    'vocsn': ['9408', '9406', '9407', '9423', '9409', '16003'],
}


def default_pins_for(vendor: str) -> List[str]:
    return list(DEFAULT_VENT_PINS.get((vendor or '').lower(), []))


def resolve_vent_pins(db: Session, patient_id: int, vendor: str) -> dict:
    """The pinned parameter keys for a patient, in display order.

    ``source`` distinguishes the two states that "no rows" would otherwise
    collapse: a patient nobody has configured gets the defaults, a patient who
    deliberately unpinned everything gets an empty list and keeps it.
    """
    vendor = (vendor or '').lower()
    state = db.query(PatientVentPinState).filter(
        PatientVentPinState.patient_id == patient_id,
        PatientVentPinState.vendor == vendor,
    ).first()

    if state is None:
        return {'vendor': vendor, 'source': 'default',
                'parameter_keys': default_pins_for(vendor)}

    rows = db.query(PatientVentPin).filter(
        PatientVentPin.patient_id == patient_id,
        PatientVentPin.vendor == vendor,
    ).order_by(PatientVentPin.position.asc(), PatientVentPin.id.asc()).all()
    return {'vendor': vendor, 'source': 'patient',
            'parameter_keys': [r.parameter_key for r in rows]}


def set_vent_pins(db: Session, patient_id: int, vendor: str,
                  parameter_keys: List[str], set_by: Optional[int] = None) -> None:
    """Replace a patient's pins with exactly this list, in this order.

    Writing the state row is what makes an empty list stick. Duplicates are
    dropped rather than rejected — the same key twice is a client slip, not a
    reason to fail the save, and the unique constraint would refuse it anyway.
    """
    vendor = (vendor or '').lower()
    now = datetime.now(timezone.utc)

    seen = set()
    ordered = []
    for key in parameter_keys:
        key = str(key)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(key)

    db.query(PatientVentPin).filter(
        PatientVentPin.patient_id == patient_id,
        PatientVentPin.vendor == vendor,
    ).delete(synchronize_session=False)

    for position, key in enumerate(ordered):
        db.add(PatientVentPin(patient_id=patient_id, vendor=vendor,
                              parameter_key=key, position=position,
                              set_by=set_by, set_at=now))

    state = db.query(PatientVentPinState).filter(
        PatientVentPinState.patient_id == patient_id,
        PatientVentPinState.vendor == vendor,
    ).first()
    if state is None:
        state = PatientVentPinState(patient_id=patient_id, vendor=vendor)
        db.add(state)
    state.configured = True
    state.set_by = set_by
    state.set_at = now

    db.commit()
