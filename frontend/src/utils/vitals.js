/*
 * Smart Home Health Hub
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
// Shared display-name helpers for vital types.
//
// vital_type slugs come from the DB as snake_case identifiers; the UI needs
// nicely capitalized labels everywhere it shows them. Centralizing this here
// keeps Dashboard, HistoryModal, RecordVitalsForm, and any future consumer
// rendering the same string for the same vital.

export const KNOWN_VITAL_LABELS = {
  blood_pressure: 'Blood Pressure',
  spo2: 'SpO₂',
  heart_rate: 'Heart Rate',
  respiratory_rate: 'Respiratory Rate',
  perfusion_index: 'Perfusion Index',
  body_temp: 'Body Temperature',
  skin_temp: 'Skin Temperature',
  temperature: 'Temperature',
  bathroom: 'Bathroom',
  weight: 'Weight',
  calories: 'Calories',
  water: 'Water Intake',
  nutrition: 'Nutrition',
  blood_glucose: 'Blood Glucose',
};

export function formatVitalDisplayName(slug) {
  if (!slug) return '';
  if (KNOWN_VITAL_LABELS[slug]) return KNOWN_VITAL_LABELS[slug];
  return slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
