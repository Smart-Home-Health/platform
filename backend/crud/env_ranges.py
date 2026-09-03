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
"""Per-patient environment bounds: resolve (defaults + overrides) and upsert."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from models.patient_env_range import PatientEnvRange

# The metrics a room is judged on. Room-scoped only: these describe the air
# the patient is actually in, which is the thing a bound can be acted on.
# Outdoor readings are context for correlation, not something a carer can fix,
# so they are deliberately absent.
ENV_RANGE_METRICS = ('temperature', 'relative_humidity', 'co2', 'pm25')

# Starting points, not clinical guidance — every one is overridable per
# patient, and the sources are ordinary public guidance rather than anything
# specific to a condition:
#   temperature/humidity  ASHRAE-style indoor comfort bands
#   co2                   1000 ppm is the usual ventilation complaint level;
#                         2000 ppm is where drowsiness/headache get reported
#   pm25                  the US AQI breakpoints (12 = good/moderate,
#                         35 = moderate/unhealthy-for-sensitive-groups)
# A patient with lung disease will want tighter numbers; that is the point of
# the table.
DEFAULT_ENV_RANGES = {
    'temperature':       {'caution_min': 18.0, 'caution_max': 24.0,
                          'critical_min': 15.0, 'critical_max': 28.0},
    'relative_humidity': {'caution_min': 30.0, 'caution_max': 60.0,
                          'critical_min': 20.0, 'critical_max': 70.0},
    'co2':               {'caution_min': None, 'caution_max': 1000.0,
                          'critical_min': None, 'critical_max': 2000.0},
    'pm25':              {'caution_min': None, 'caution_max': 12.0,
                          'critical_min': None, 'critical_max': 35.0},
}

_BOUNDS = ('caution_min', 'caution_max', 'critical_min', 'critical_max')


def resolve_env_ranges(db: Session, patient_id: int) -> list:
    """Every judged metric for a patient, defaults filled in where unset.

    Always returns one entry per metric in ENV_RANGE_METRICS so the caller
    never has to distinguish "not configured" from "not a metric we judge".
    ``source`` says which it is, because a default bound and a bound someone
    chose for this patient carry different authority and the UI should not
    present them identically.
    """
    stored = {
        r.metric: r for r in db.query(PatientEnvRange)
        .filter(PatientEnvRange.patient_id == patient_id).all()
    }
    out = []
    for metric in ENV_RANGE_METRICS:
        defaults = DEFAULT_ENV_RANGES.get(metric, {})
        row = stored.get(metric)
        entry = {'metric': metric, 'source': 'patient' if row else 'default'}
        for key in _BOUNDS:
            entry[key] = getattr(row, key) if row else defaults.get(key)
        entry['note'] = row.note if row else None
        out.append(entry)
    return out


def upsert_patient_env_ranges(db: Session, patient_id: int, ranges: list,
                              set_by: Optional[int] = None) -> None:
    """Apply a set of per-patient overrides.

    A metric whose bounds are all None is deleted rather than stored as a row
    of nulls — "cleared" has to mean "fall back to the default", or a carer
    who empties the fields would silently switch the metric off instead.
    """
    now = datetime.now(timezone.utc)
    existing = {
        r.metric: r for r in db.query(PatientEnvRange)
        .filter(PatientEnvRange.patient_id == patient_id).all()
    }
    for item in ranges:
        metric = item.get('metric')
        if metric not in ENV_RANGE_METRICS:
            continue
        values = {k: item.get(k) for k in _BOUNDS}
        row = existing.get(metric)
        if all(v is None for v in values.values()) and not item.get('note'):
            if row:
                db.delete(row)
            continue
        if row is None:
            row = PatientEnvRange(patient_id=patient_id, metric=metric)
            db.add(row)
        for key, value in values.items():
            setattr(row, key, value)
        row.note = item.get('note')
        row.set_by = set_by
        row.set_at = now
    db.commit()
