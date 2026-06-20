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
// Shared MQTT section + permission definitions used by the global MQTT page and
// the per-patient settings page.

export const MQTT_SECTIONS = [
  { id: 'spo2', label: 'SpO₂' },
  { id: 'bpm', label: 'Heart Rate' },
  { id: 'perfusion', label: 'Perfusion' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'blood_pressure', label: 'Blood Pressure' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'weight', label: 'Weight' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'spo2_alarm', label: 'SpO₂ Alarm' },
  { id: 'bpm_alarm', label: 'BPM Alarm' },
  { id: 'alarm1', label: 'Alarm 1' },
  { id: 'alarm2', label: 'Alarm 2' },
  // Badge counts — each publishes two sensors: due now (±1h of due) and late (>1h past).
  { id: 'meds_counts', label: 'Medications Due/Late' },
  { id: 'nutrition_counts', label: 'Nutrition Due/Late' },
  { id: 'care_task_counts', label: 'Care Tasks Due/Late' },
  { id: 'equipment_counts', label: 'Equipment Due/Late' },
];

export const PERM_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'get', label: 'Get only' },
  { value: 'set', label: 'Set only' },
  { value: 'both', label: 'Both' },
];

// Badge-count sections are read-only (HA reads the count; there is no set
// handler), so they expose only Off / Get — no `set`/`both`.
export const BADGE_SECTION_IDS = [
  'meds_counts',
  'nutrition_counts',
  'care_task_counts',
  'equipment_counts',
];

const READ_ONLY_PERM_OPTIONS = PERM_OPTIONS.filter(
  (o) => o.value === 'off' || o.value === 'get',
);

// Permission options available for a given section id.
export const permOptionsForSection = (sectionId) =>
  BADGE_SECTION_IDS.includes(sectionId) ? READ_ONLY_PERM_OPTIONS : PERM_OPTIONS;

// Styling for the compact native <select> used in permission dropdowns.
// Native selects give the OS picker, which is the friendliest control on mobile.
export const permSelectClass =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:border-ring focus:outline-none';
