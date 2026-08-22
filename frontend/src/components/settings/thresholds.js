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
// Threshold validation, kept out of the component file so fast refresh stays
// happy and the form/test share one definition.
export const THRESHOLD_FIELDS = [
  { key: 'min_spo2', description: 'Minimum SpO2 threshold' },
  { key: 'max_spo2', description: 'Maximum SpO2 threshold' },
  { key: 'min_bpm', description: 'Minimum heart rate threshold' },
  { key: 'max_bpm', description: 'Maximum heart rate threshold' },
];

const isBlank = (v) => v === '' || v == null || Number.isNaN(Number(v));

/** Returns a message, or null when every pair is a valid low < high. 0 counts as a value. */
export function validateThresholds(form) {
  if (THRESHOLD_FIELDS.some(({ key }) => isBlank(form[key]))) return 'Every threshold needs a number.';
  if (Number(form.min_spo2) >= Number(form.max_spo2)) return 'Min SpO₂ must be below max SpO₂.';
  if (Number(form.min_bpm) >= Number(form.max_bpm)) return 'Min heart rate must be below max heart rate.';
  return null;
}
