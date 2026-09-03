/*
 * Smart Home Health
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
// Client mirror of the backend's two-band validation (backend/vital_validation.py
// re-checks everything on save). Range entries come from GET /api/vitals/ranges.

// Physical checks suggested when a concerning value is confirmed — the warning
// copy pattern is: state the comparison, then give the physical check.
const PHYSICAL_CHECKS = {
  spo2: 'Re-check probe placement, then confirm.',
  heart_rate: 'Re-check the sensor, then confirm.',
  blood_pressure: 'Re-check the cuff position, then confirm.',
  temperature: 'Re-take the temperature, then confirm.',
  respiratory_rate: 'Re-count for a full minute, then confirm.',
  weight: 'Re-check the scale, then confirm.',
};

export function rangeFor(ranges, vitalKey, fieldKey = '') {
  return ranges?.find(r => r.vital_key === vitalKey && (r.field_key || '') === fieldKey) || null;
}

export function classify(value, range) {
  if (!range || value === null || value === undefined) return 'ok';
  const { implausible_min, implausible_max, expected_min, expected_max } = range;
  if ((implausible_min != null && value < implausible_min) ||
      (implausible_max != null && value > implausible_max)) return 'implausible';
  if ((expected_min != null && value < expected_min) ||
      (expected_max != null && value > expected_max)) return 'concerning';
  return 'ok';
}

export function formatWithUnit(value, unit) {
  return unit === '%' ? `${value}%` : `${value} ${unit}`.trim();
}

// "88% is below Eli's expected range (92–100%). Re-check probe placement, then confirm."
export function concerningMessage({ value, unit, range, patientFirstName, vitalKey }) {
  const lo = range?.expected_min;
  const hi = range?.expected_max;
  const shown = formatWithUnit(value, unit);
  const who = patientFirstName ? `${patientFirstName}'s` : 'the';
  const span = `(${lo ?? '…'}–${hi ?? '…'}${unit === '%' ? '%' : ''})`;
  const direction = lo != null && value < lo ? 'below' : 'above';
  const check = PHYSICAL_CHECKS[vitalKey] || 'Check the patient, then confirm.';
  return `${shown} is ${direction} ${who} expected range ${span}. ${check}`;
}

export function implausibleMessage({ value, unit, label }) {
  return `${formatWithUnit(value, unit)} isn't a possible ${label.toLowerCase()} reading. ` +
         'Clear it and enter the value from the monitor.';
}

export const CROSS_FIELD_BP_MESSAGE =
  'Diastolic must be lower than systolic. Check which number is which.';

// Evaluate a whole BP pair: returns {band, messages[]}. dia >= sys is always
// implausible; if both fields are merely concerning we emit ONE combined warning.
export function evaluateBloodPressure({ systolic, diastolic, ranges, patientFirstName }) {
  if (diastolic != null && systolic != null && diastolic >= systolic) {
    return { band: 'implausible', messages: [CROSS_FIELD_BP_MESSAGE] };
  }
  const sysRange = rangeFor(ranges, 'blood_pressure', 'systolic');
  const diaRange = rangeFor(ranges, 'blood_pressure', 'diastolic');
  const sysBand = classify(systolic, sysRange);
  const diaBand = classify(diastolic, diaRange);
  if (sysBand === 'implausible' || diaBand === 'implausible') {
    const bad = sysBand === 'implausible'
      ? { value: systolic, label: 'Systolic' } : { value: diastolic, label: 'Diastolic' };
    return { band: 'implausible',
             messages: [implausibleMessage({ ...bad, unit: 'mmHg' })] };
  }
  const messages = [];
  if (sysBand === 'concerning') {
    messages.push(concerningMessage({ value: systolic, unit: 'mmHg', range: sysRange,
                                      patientFirstName, vitalKey: 'blood_pressure' }));
  }
  if (diaBand === 'concerning') {
    messages.push(concerningMessage({ value: diastolic, unit: 'mmHg', range: diaRange,
                                      patientFirstName, vitalKey: 'blood_pressure' }));
  }
  return { band: messages.length ? 'concerning' : 'ok', messages };
}
