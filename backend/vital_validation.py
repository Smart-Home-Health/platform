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
"""Two-band validation for captured vitals.

Implausible = physically impossible / obvious typo -> hard reject.
Concerning = physiologically possible but outside the patient's expected
range -> requires an explicit caregiver confirmation.

Expected bounds are user-configured per patient (patient_vital_ranges);
the code defaults below are deliberately conservative-wide seeds, not
clinical guidance. Implausible bounds are device/physics limits and ship
as global defaults that per-patient rows may override.

This module is intentionally independent of the legacy global min_spo2 /
max_bpm settings used by the live-monitoring alarm pipeline.
"""
from typing import Dict, Optional, Tuple

from sqlalchemy.orm import Session

from models.custom_vital_definition import CustomVitalDefinition
from models.patient_vital_range import PatientVitalRange

# (vital_key, field_key) -> (min, max). field_key '' for scalar vitals.
DEFAULT_IMPLAUSIBLE: Dict[Tuple[str, str], Tuple[float, float]] = {
    ('heart_rate', ''): (10, 350),
    ('spo2', ''): (30, 100),
    ('blood_pressure', 'systolic'): (30, 300),
    ('blood_pressure', 'diastolic'): (10, 200),
    ('temperature', ''): (80.0, 110.0),   # °F
    ('respiratory_rate', ''): (2, 90),
    ('weight', ''): (0.5, 1500),          # lbs
}

# Conservatively wide seeds shown as source='default' until a patient row exists.
DEFAULT_EXPECTED: Dict[Tuple[str, str], Tuple[Optional[float], Optional[float]]] = {
    ('heart_rate', ''): (40, 180),
    ('spo2', ''): (88, 100),
    ('blood_pressure', 'systolic'): (70, 200),
    ('blood_pressure', 'diastolic'): (40, 120),
    ('temperature', ''): (95.0, 103.0),
    ('respiratory_rate', ''): (8, 40),
    ('weight', ''): (None, None),
}

# Display labels for the built-ins and their component fields. The UI has no
# business title-casing keys ('spo2' -> 'Spo2'); the names live here with the
# units so every surface reads the same.
BUILTIN_LABELS: Dict[str, str] = {
    'blood_pressure': 'Blood Pressure',
    'heart_rate': 'Heart Rate',
    'spo2': 'SpO2',
    'temperature': 'Temperature',
    'respiratory_rate': 'Respiratory Rate',
    'weight': 'Weight',
}

FIELD_LABELS: Dict[str, str] = {'systolic': 'Systolic', 'diastolic': 'Diastolic'}

# Built-in capture vitals: friendly unit + UCUM code + flattened name for
# terminology.loinc_for (which expects VitalType values, not the DB's
# vital_type+vital_group split).
BUILTIN_VITALS: Dict[str, dict] = {
    'blood_pressure': {'unit': 'mmHg', 'ucum': 'mm[Hg]',
                       'fields': ('systolic', 'diastolic'),
                       'loinc_key': {'systolic': 'blood_pressure_systolic',
                                     'diastolic': 'blood_pressure_diastolic',
                                     'map': 'blood_pressure_map'}},
    'heart_rate': {'unit': 'bpm', 'ucum': '/min', 'fields': ('',), 'loinc_key': 'heart_rate'},
    'spo2': {'unit': '%', 'ucum': '%', 'fields': ('',), 'loinc_key': 'spo2'},
    'temperature': {'unit': '°F', 'ucum': '[degF]', 'fields': ('',), 'loinc_key': 'temperature'},
    'respiratory_rate': {'unit': '/min', 'ucum': '/min', 'fields': ('',), 'loinc_key': 'respiratory_rate'},
    'weight': {'unit': 'lbs', 'ucum': '[lb_av]', 'fields': ('',), 'loinc_key': 'weight'},
}


def resolve_ranges(db: Session, patient_id: int) -> Dict[Tuple[str, str], dict]:
    """Merge patient_vital_ranges rows over the code defaults.

    Returns one entry per (vital_key, field_key) covering every built-in
    vital and every custom definition for the patient. Each entry carries its
    display label and unit so callers never have to title-case a key or keep
    their own unit table. Custom vitals get no
    default bounds — a value we know nothing about is never blocked or
    warned on unless the care team configured a range for it.
    """
    resolved: Dict[Tuple[str, str], dict] = {}
    for vital_key, meta in BUILTIN_VITALS.items():
        if '' not in meta['fields']:
            # Multi-field vitals (blood pressure) get a bounds-less vital-level
            # row: it carries the required flag the components inherit.
            resolved[(vital_key, '')] = {
                'vital_key': vital_key, 'field_key': '',
                'label': BUILTIN_LABELS.get(vital_key, vital_key),
                'unit': meta.get('unit'), 'builtin': True,
                'expected_min': None, 'expected_max': None,
                'implausible_min': None, 'implausible_max': None,
                'required': False, 'source': 'default',
                'note': None, 'set_by': None, 'set_at': None,
            }
        for field_key in meta['fields']:
            imp = DEFAULT_IMPLAUSIBLE.get((vital_key, field_key), (None, None))
            exp = DEFAULT_EXPECTED.get((vital_key, field_key), (None, None))
            resolved[(vital_key, field_key)] = {
                'vital_key': vital_key, 'field_key': field_key,
                'label': FIELD_LABELS.get(field_key) if field_key
                         else BUILTIN_LABELS.get(vital_key, vital_key),
                'unit': meta.get('unit'), 'builtin': True,
                'expected_min': exp[0], 'expected_max': exp[1],
                'implausible_min': imp[0], 'implausible_max': imp[1],
                'required': False, 'source': 'default',
                'note': None, 'set_by': None, 'set_at': None,
            }
    for cd in db.query(CustomVitalDefinition).filter(
            CustomVitalDefinition.patient_id == patient_id).all():
        resolved.setdefault((cd.name, ''), {
            'vital_key': cd.name, 'field_key': '',
            'label': cd.display_label or cd.name,
            'unit': cd.unit, 'builtin': False,
            'expected_min': None, 'expected_max': None,
            'implausible_min': None, 'implausible_max': None,
            'required': False, 'source': 'default',
            'note': None, 'set_by': None, 'set_at': None,
        })
    for row in db.query(PatientVitalRange).filter(
            PatientVitalRange.patient_id == patient_id).all():
        key = (row.vital_key, row.field_key or '')
        base = resolved.get(key, {
            'vital_key': row.vital_key, 'field_key': row.field_key or '',
            'label': row.vital_key, 'unit': None, 'builtin': False,
        })
        imp_default = DEFAULT_IMPLAUSIBLE.get(key, (None, None))
        base.update({
            'expected_min': row.expected_min, 'expected_max': row.expected_max,
            'implausible_min': row.implausible_min if row.implausible_min is not None else imp_default[0],
            'implausible_max': row.implausible_max if row.implausible_max is not None else imp_default[1],
            'required': bool(row.required), 'source': 'patient',
            'note': row.note, 'set_by': row.set_by,
            'set_at': row.set_at.isoformat() if row.set_at else None,
        })
        resolved[key] = base
    # The required flag lives on the vital-level ('', field_key) row; multi-
    # field vitals inherit it so API output matches the documented model.
    for vital_key, meta in BUILTIN_VITALS.items():
        parent = resolved.get((vital_key, ''))
        if parent is None:
            continue
        for field_key in meta['fields']:
            if field_key:
                entry = resolved.get((vital_key, field_key))
                if entry is not None:
                    entry['required'] = parent['required']
    return resolved


def classify(value: float, entry: Optional[dict]) -> str:
    """Classify a value against a resolved range entry: ok | concerning | implausible."""
    if entry is None:
        return 'ok'
    imp_min, imp_max = entry.get('implausible_min'), entry.get('implausible_max')
    if (imp_min is not None and value < imp_min) or (imp_max is not None and value > imp_max):
        return 'implausible'
    exp_min, exp_max = entry.get('expected_min'), entry.get('expected_max')
    if (exp_min is not None and value < exp_min) or (exp_max is not None and value > exp_max):
        return 'concerning'
    return 'ok'
