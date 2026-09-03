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
// Reads the per-section MQTT permissions as something a person can hold in
// their head: four groups of related sections, and one sharing mode across
// them all. The stored shape is unchanged — a map of section id to
// 'off' | 'get' | 'set' | 'both'.
import { BADGE_SECTION_IDS, MQTT_SECTIONS } from '../../mqttConstants';

const labelOf = (id) => MQTT_SECTIONS.find((s) => s.id === id)?.label || id;

export const PERMISSION_GROUPS = [
  {
    id: 'live',
    label: 'Live readings',
    sections: ['spo2', 'bpm', 'perfusion', 'temperature', 'blood_pressure'],
  },
  {
    id: 'activity',
    label: 'Care activity',
    sections: ['nutrition', 'weight', 'bathroom'],
  },
  {
    id: 'reminders',
    label: 'Reminders',
    sections: ['meds_counts', 'nutrition_counts', 'care_task_counts', 'equipment_counts'],
  },
  {
    id: 'alarms',
    label: 'Alarms',
    sections: ['spo2_alarm', 'bpm_alarm', 'alarm1', 'alarm2'],
  },
];

// Any section the groups above do not name still has to be reachable, or a
// section added to mqttConstants would quietly become un-editable.
export function permissionGroups() {
  const grouped = new Set(PERMISSION_GROUPS.flatMap((g) => g.sections));
  const rest = MQTT_SECTIONS.map((s) => s.id).filter((id) => !grouped.has(id));
  const groups = PERMISSION_GROUPS.map((g) => ({
    ...g,
    sections: g.sections.filter((id) => MQTT_SECTIONS.some((s) => s.id === id)),
  })).filter((g) => g.sections.length);
  return rest.length ? [...groups, { id: 'other', label: 'Other', sections: rest }] : groups;
}

const isShared = (value) => value === 'get' || value === 'set' || value === 'both';

export function groupRows(sections = {}) {
  return permissionGroups().map((group) => {
    const shared = group.sections.filter((id) => isShared(sections[id]));
    return {
      ...group,
      members: group.sections.map(labelOf),
      blurb: group.sections.map(labelOf).join(', '),
      sharedCount: shared.length,
      total: group.sections.length,
      status: shared.length
        ? { label: `${shared.length} shared`, tone: 'success' }
        : { label: 'Not shared', tone: 'muted' },
    };
  });
}

// Home Assistant can only write back to sections that have a set handler; the
// badge counts are read-only, so "control allowed" leaves them on get.
const controlValueFor = (id) => (BADGE_SECTION_IDS.includes(id) ? 'get' : 'both');

/**
 * Which of the three modes the current permissions add up to.
 * 'none' when nothing is shared at all — reporting "monitor only" there would
 * claim a posture the profile has not taken.
 */
export function sharingMode(sections = {}) {
  const shared = Object.entries(sections).filter(([, value]) => isShared(value));
  if (!shared.length) return 'none';
  if (shared.every(([, value]) => value === 'get')) return 'monitor';
  if (shared.every(([id, value]) => value === controlValueFor(id))) return 'control';
  return 'custom';
}

/**
 * Apply a mode without changing *what* is shared — only the direction. A
 * section that is off stays off: switching to "control allowed" must not start
 * publishing something the care team never chose to share.
 */
export function applyMode(sections = {}, mode) {
  if (mode !== 'monitor' && mode !== 'control') return { ...sections };
  const next = {};
  for (const [id, value] of Object.entries(sections)) {
    if (!isShared(value)) { next[id] = value; continue; }
    next[id] = mode === 'monitor' ? 'get' : controlValueFor(id);
  }
  return next;
}

// Turning sharing on for a profile that has never been configured: start from
// read-only everything rather than an empty page with sixteen dropdowns.
export function monitorOnlyDefaults() {
  return Object.fromEntries(MQTT_SECTIONS.map((s) => [s.id, 'get']));
}

export const hasAnyShared = (sections = {}) =>
  Object.values(sections).some((v) => isShared(v));

export const sharedCount = (sections = {}) =>
  Object.values(sections).filter(isShared).length;

export const MODE_OPTIONS = [
  {
    id: 'monitor',
    label: 'Monitor only',
    blurb: 'Publishes status and readings. Home Assistant cannot record or change care data.',
  },
  {
    id: 'control',
    label: 'Control allowed',
    blurb: 'Home Assistant can also write back — recording readings and care activity through the broker.',
  },
  {
    id: 'custom',
    label: 'Custom',
    blurb: 'Set the direction per section below.',
  },
];
