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
import { sharingMode } from './home-assistant/haSharing';

// Derives the setup summary shown on the care-profile hub: one status plus a
// few plain-language facts per section. Pure functions — the hub renders what
// these return, and nothing here invents a number the API did not supply.

// Status vocabulary. `planned` is for sections whose UI exists but whose
// backend does not — it never counts toward "ready" or "needs review", so the
// hub's counters stay honest.
export const STATUS_META = {
  ready: { label: 'Ready', tone: 'success' },
  review: { label: 'Needs review', tone: 'warning' },
  error: { label: 'Needs attention', tone: 'danger' },
  optional: { label: 'Optional', tone: 'muted' },
  off: { label: 'Off', tone: 'muted' },
  planned: { label: 'Not configurable yet', tone: 'muted' },
};

// A vital counts as "bounded" when any of its rows carries an expected floor
// or ceiling; blood pressure keeps its bounds on the component rows, so the
// check has to look across the whole group rather than at the vital-level row.
const groupByVital = (ranges) => {
  const groups = new Map();
  for (const row of ranges || []) {
    const key = row.vital_key;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
};

const hasBounds = (rows) =>
  rows.some((r) => r.expected_min !== null && r.expected_min !== undefined)
  || rows.some((r) => r.expected_max !== null && r.expected_max !== undefined);

const ENV_BOUND_FIELDS = ['critical_min', 'caution_min', 'caution_max', 'critical_max'];

export function measurementsSummary({ ranges = [], customDefinitions = [], envRanges = [] } = {}) {
  const custom = new Set((customDefinitions || []).map((d) => d.name));
  const groups = groupByVital(ranges);

  let standardCount = 0;
  let customCount = 0;
  let bounded = 0;
  let unbounded = 0;
  for (const [vitalKey, rows] of groups) {
    if (custom.has(vitalKey)) customCount += 1;
    else standardCount += 1;
    if (hasBounds(rows)) bounded += 1;
    else unbounded += 1;
  }

  const required = (ranges || []).filter((r) => !r.field_key && r.required).length;
  const envBounded = (envRanges || []).filter((row) =>
    ENV_BOUND_FIELDS.some((f) => row[f] !== null && row[f] !== undefined)).length;

  if (groups.size === 0) {
    return { status: 'review', facts: ['No measurements have been set up yet'] };
  }

  const facts = [
    `${standardCount} standard · ${customCount} custom`,
    unbounded === 0
      ? `${bounded} ranges set`
      : `${bounded} ranges set · ${unbounded} not set`,
    `${required} required ${required === 1 ? 'reading' : 'readings'}`,
  ];
  if (envRanges && envRanges.length) {
    facts.push(`${envBounded} of ${envRanges.length} room conditions bounded`);
  }
  return { status: unbounded > 0 ? 'review' : 'ready', facts };
}

// The hub names the sharing posture with the same words the Home Assistant
// page uses for its mode, so the two never describe one config differently.
const MODE_LABELS = {
  monitor: 'Monitor only',
  control: 'Control allowed',
  custom: 'Custom sharing',
};

export function homeAssistantSummary({
  globalOn = false, enabled = false, sections = {}, totalSections = 0,
  topicOverrides = {},
} = {}) {
  if (!globalOn) {
    return {
      status: 'off',
      facts: ['MQTT is turned off for this hub', 'Turn it on in Configuration → MQTT'],
    };
  }
  const shared = Object.values(sections || {}).filter((v) => v && v !== 'off');
  if (!enabled) {
    return {
      status: 'optional',
      facts: ['Not shared with Home Assistant'],
    };
  }
  if (shared.length === 0) {
    return {
      status: 'error',
      facts: ['Sharing is on, but no sections are shared'],
    };
  }
  const customTopics = Boolean(topicOverrides?.state_topic || topicOverrides?.set_topic);
  return {
    status: 'ready',
    facts: [
      totalSections
        ? `${shared.length} of ${totalSections} sections shared`
        : `${shared.length} sections shared`,
      MODE_LABELS[sharingMode(sections)] || MODE_LABELS.custom,
      customTopics ? 'Custom topics' : 'Default topics',
    ],
  };
}

export function careContextSummary(patient) {
  const notes = (patient?.notes || '').trim();
  return {
    status: 'optional',
    facts: [
      notes ? 'Profile notes added' : 'No profile notes added',
      patient?.care_area ? `Care area: ${patient.care_area}` : 'No care area linked',
    ],
  };
}

// The per-profile feature switches are not stored anywhere yet, so this
// reports the truth rather than a count of hardcoded checkboxes.
export function featuresSummary() {
  return {
    status: 'planned',
    facts: ['Every area of the app is available to every profile'],
  };
}

export function setupTotals(sections) {
  return (sections || []).reduce((acc, s) => {
    if (s.status === 'ready') acc.ready += 1;
    else if (s.status === 'review') acc.review += 1;
    else if (s.status === 'error') acc.errors += 1;
    return acc;
  }, { ready: 0, review: 0, errors: 0 });
}
