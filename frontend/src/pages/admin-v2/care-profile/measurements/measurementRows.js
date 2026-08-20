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
// Turns the API's flat range rows into the list the Measurements page shows:
// one entry per measurement, with a plain-language summary of its bounds.
// Labels and units come from the API (see vital_validation.resolve_ranges) —
// nothing here title-cases a key or keeps its own unit table.

// Room conditions are a fixed set the environment API knows by metric key.
// hasFloor marks the metrics where a low reading means something: CO2 and
// PM2.5 only have ceilings, and offering a floor invites a 0 that reads as a
// real bound and flags every clean reading.
export const ENV_METRICS = [
  { key: 'temperature', label: 'Room temperature', unit: '°C', hasFloor: true },
  { key: 'relative_humidity', label: 'Room humidity', unit: '%', hasFloor: true },
  { key: 'co2', label: 'CO2', unit: 'ppm', hasFloor: false },
  { key: 'pm25', label: 'PM2.5', unit: 'µg/m³', hasFloor: false },
];

const has = (v) => v !== null && v !== undefined && v !== '';

const num = (v) => (has(v) ? String(v) : null);

// One bounded pair as words. A single-sided bound is spelled out rather than
// shown with a comparison glyph.
export function formatRange(min, max, unit) {
  const suffix = unit ? ` ${unit}` : '';
  if (has(min) && has(max)) return `${num(min)}–${num(max)}${suffix}`;
  if (has(min)) return `${num(min)}${suffix} and up`;
  if (has(max)) return `Up to ${num(max)}${suffix}`;
  return null;
}

const boundedRow = (row) => has(row?.expected_min) || has(row?.expected_max);

// Blood pressure is written systolic-first everywhere it is written; the API
// returns its component rows sorted by key, which puts diastolic first.
const COMPONENT_ORDER = ['systolic', 'diastolic'];
const componentRank = (row) => {
  const i = COMPONENT_ORDER.indexOf(row.field_key);
  return i === -1 ? COMPONENT_ORDER.length : i;
};

function vitalSummary(parent, components, unit) {
  if (components.length) {
    // Blood pressure keeps its bounds on the component rows. With every
    // component bounded the unit reads once at the end; when one is missing it
    // has to ride along with the numbers instead, or the sentence ends
    // "diastolic not set mmHg".
    if (!components.some(boundedRow)) return 'No expected range';
    const complete = components.every(boundedRow);
    const parts = components.map((c) => {
      const name = (c.label || c.field_key).toLowerCase();
      const range = formatRange(c.expected_min, c.expected_max, complete ? null : unit);
      return range ? `${range} ${name}` : `${name} not set`;
    });
    return complete ? `${parts.join(' · ')}${unit ? ` ${unit}` : ''}` : parts.join(' · ');
  }
  return formatRange(parent.expected_min, parent.expected_max, unit) || 'No expected range';
}

// Group the flat rows into one entry per measurement, in the order the API
// returned them.
export function buildMeasurementRows(ranges = []) {
  const order = [];
  const groups = new Map();
  for (const row of ranges) {
    if (!groups.has(row.vital_key)) {
      groups.set(row.vital_key, []);
      order.push(row.vital_key);
    }
    groups.get(row.vital_key).push(row);
  }

  return order.map((key) => {
    const rows = groups.get(key);
    const parent = rows.find((r) => !r.field_key) || rows[0];
    const components = rows.filter((r) => r.field_key)
      .sort((a, b) => componentRank(a) - componentRank(b));
    const unit = parent.unit || null;
    return {
      key,
      label: parent.label || key,
      unit,
      builtin: parent.builtin !== false,
      parent,
      components,
      rows,
      required: Boolean(parent.required),
      configured: boundedRow(parent) || components.some(boundedRow),
      summary: vitalSummary(parent, components, unit),
    };
  });
}

export function buildRoomRows(envRanges = []) {
  const byMetric = new Map((envRanges || []).map((r) => [r.metric, r]));
  return ENV_METRICS.filter((m) => byMetric.has(m.key)).map((meta) => {
    const row = byMetric.get(meta.key);
    // "Caution Up to 1000 ppm" reads as two sentences bolted together, so the
    // band name takes the capital and the range that follows it does not.
    const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
    const caution = lower(formatRange(row.caution_min, row.caution_max, meta.unit));
    const critical = lower(formatRange(row.critical_min, row.critical_max, meta.unit));
    const parts = [];
    if (caution) parts.push(`Caution ${caution}`);
    if (critical) parts.push(`Critical ${critical}`);
    return {
      ...meta,
      row,
      configured: parts.length > 0,
      summary: parts.length ? parts.join(' · ') : 'Not bounded',
    };
  });
}

// The counts across the top of the page. Room conditions are summarised in
// their own tab, so they are deliberately not folded in here.
export function measurementCounts(rows) {
  const standard = rows.filter((r) => r.builtin);
  const custom = rows.filter((r) => !r.builtin);
  const unconfigured = rows.filter((r) => !r.configured);
  return {
    standard: standard.length,
    custom: custom.length,
    configured: rows.filter((r) => r.configured).length,
    needsReview: unconfigured.length,
    unconfigured,
  };
}

const joinLabels = (labels) => {
  if (labels.length <= 1) return labels.join('');
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
};

// "3 readings required per encounter" + which ones.
export function completionSummary(rows) {
  const required = rows.filter((r) => r.required);
  const labels = required.map((r) => r.label);
  return {
    count: required.length,
    labels,
    headline: required.length
      ? `${required.length} ${required.length === 1 ? 'reading' : 'readings'} required per encounter`
      : 'No readings are required to complete an encounter',
    detail: required.length
      ? `${joinLabels(labels)}.`
      : 'Every measurement is optional — an encounter can be saved with any of them.',
  };
}
