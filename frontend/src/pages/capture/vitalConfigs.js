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
// Per-vital capture configuration. The keypad is driven entirely from this
// registry: maxDecimals 0 hides the decimal key, maxIntDigits blocks the
// keypress at input time (spec: block early, don't accept-and-error).

export const BUILTIN_CONFIGS = [
  {
    key: 'blood_pressure',
    label: 'Blood Pressure',
    unit: 'mmHg',
    fields: [
      { key: 'systolic', label: 'Systolic', maxIntDigits: 3, maxDecimals: 0,
        prompt: 'Enter the top number from the monitor.' },
      { key: 'diastolic', label: 'Diastolic', maxIntDigits: 3, maxDecimals: 0,
        prompt: 'Enter the bottom number from the monitor.' },
    ],
  },
  {
    key: 'heart_rate', label: 'Heart Rate', unit: 'bpm',
    fields: [{ key: '', label: 'Heart rate', maxIntDigits: 3, maxDecimals: 0,
               prompt: 'Enter the pulse rate from the monitor.' }],
  },
  {
    key: 'spo2', label: 'Oxygen', sheetLabel: 'Oxygen Saturation', unit: '%',
    fields: [{ key: '', label: 'SpO2', maxIntDigits: 3, maxDecimals: 0,
               prompt: 'Enter SpO2 from the pulse oximeter.' }],
  },
  {
    key: 'temperature', label: 'Temperature', unit: '°F',
    fields: [{ key: '', label: 'Temperature', maxIntDigits: 3, maxDecimals: 1,
               prompt: 'Enter the temperature reading.' }],
  },
  {
    key: 'respiratory_rate', label: 'Respiration', sheetLabel: 'Respiratory Rate', unit: '/min',
    fields: [{ key: '', label: 'Respiratory rate', maxIntDigits: 2, maxDecimals: 0,
               prompt: 'Enter breaths per minute.' }],
  },
  {
    key: 'weight', label: 'Weight', unit: 'lbs',
    fields: [{ key: '', label: 'Weight', maxIntDigits: 4, maxDecimals: 1,
               prompt: 'Enter the weight from the scale.' }],
  },
];

// A custom vital definition ({name, unit, display_label}) becomes a config
// with permissive digits and one decimal place.
export function configForCustomDefinition(def) {
  return {
    key: def.name,
    label: def.display_label || def.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    unit: def.unit || '',
    custom: true,
    fields: [{ key: '', label: def.display_label || def.name, maxIntDigits: 4, maxDecimals: 1,
               prompt: `Enter the ${def.display_label || def.name} reading.` }],
  };
}

export function buildConfigs(customDefinitions = []) {
  return [...BUILTIN_CONFIGS, ...customDefinitions.map(configForCustomDefinition)];
}

// Would `digit` (a '0'-'9' or '.') be accepted after `current`?
export function acceptKey(current, key, field) {
  if (key === '.') {
    if (field.maxDecimals === 0) return false;
    if (current.includes('.')) return false;
    return true;
  }
  const [intPart = '', decPart] = current.split('.');
  if (decPart !== undefined) return decPart.length < field.maxDecimals;
  if (intPart.length >= field.maxIntDigits) return false;
  return true;
}

// Strip leading zeros on commit ("07" -> "7", "0.5" stays).
export function normalizeValue(raw) {
  if (!raw) return null;
  const trimmed = raw.replace(/^0+(?=\d)/, '');
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function formatValue(value, field) {
  if (value === null || value === undefined) return '';
  return field && field.maxDecimals > 0 && !Number.isInteger(value)
    ? String(value)
    : String(value);
}
