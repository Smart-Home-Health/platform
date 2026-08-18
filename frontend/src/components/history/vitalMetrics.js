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

/* What the recorded-vitals panel knows about each vital.
 *
 * `GET /api/vitals/types` returns whatever distinct strings are in the column,
 * with no label, unit or ordering — and the column currently also holds junk
 * (see UNRECOGNISED below). This supplies the presentation; the API stays the
 * source of truth for which vitals a patient actually has. */

/* Blood pressure arrives as three fields on one record rather than a `value`,
 * because that is how the endpoint groups it. Everything else is scalar. */
export const METRICS = [
  { key: 'blood_pressure', label: 'Blood pressure', short: 'BP', unit: 'mmHg', icon: 'heart',
    fields: [
      { key: 'systolic', label: 'Systolic', tone: 'live' },
      { key: 'map', label: 'MAP', tone: 'idle' },
      { key: 'diastolic', label: 'Diastolic', tone: 'complete' },
    ] },
  { key: 'temperature', label: 'Temperature', short: 'Temp', unit: '°F', icon: 'flame', decimals: 1 },
  { key: 'respiratory_rate', label: 'Respiration', short: 'Resp', unit: 'br/min', icon: 'vent' },
  { key: 'weight', label: 'Weight', short: 'Weight', unit: 'lb', icon: 'body', decimals: 1 },
  { key: 'spo2', label: 'SpO₂', short: 'SpO₂', unit: '%', icon: 'oximeter' },
  { key: 'heart_rate', label: 'Heart rate', short: 'HR', unit: 'BPM', icon: 'vitals' },
  { key: 'blood_glucose', label: 'Blood glucose', short: 'Glucose', unit: 'mg/dL', icon: 'droplet' },
];

const BY_KEY = new Map(METRICS.map(m => [m.key, m]));

/* `vital_type` is a free text column, and three rows in it read `patient_id`
 * with the patient's own id as the value — a malformed manual write, not a
 * vital. Unrecognised types are still listed (hiding real data would be
 * worse), but they sort last and are marked, so junk cannot masquerade as a
 * measurement. */
export function metricFor(type) {
  return BY_KEY.get(type) || {
    key: type,
    label: humanise(type),
    short: humanise(type),
    unit: '',
    icon: 'vitals',
    unrecognised: true,
  };
}

function humanise(type) {
  return String(type || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Order the API's type list: known vitals in clinical order, junk last. */
export function orderTypes(types) {
  const known = METRICS.map(m => m.key).filter(k => (types || []).includes(k));
  const rest = (types || []).filter(t => !BY_KEY.has(t)).sort();
  return [...known, ...rest];
}

export const RANGES = [
  { key: '24h', label: '24H', days: 1 },
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
];

const stamp = (r) => new Date(r.timestamp || r.datetime).getTime();

/**
 * Newest record per vital type. The endpoint already returns newest-first, but
 * this does not lean on that — a panel that shows a stale "latest" reading is
 * worse than one that costs a comparison.
 */
export function latestByType(records) {
  const out = new Map();
  for (const r of records || []) {
    if (!r || !r.vital_type) continue;
    const t = stamp(r);
    if (Number.isNaN(t)) continue;
    const held = out.get(r.vital_type);
    if (!held || t > stamp(held)) out.set(r.vital_type, r);
  }
  return out;
}

const round = (n, decimals = 0) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

/** The reading as displayed: "124/71" for BP, "100.5" for a scalar. */
export function formatReading(record, metric) {
  if (!record) return null;
  if (metric?.key === 'blood_pressure') {
    const { systolic, diastolic } = record;
    if (systolic == null && diastolic == null) return null;
    return `${systolic ?? '--'}/${diastolic ?? '--'}`;
  }
  if (record.value == null) return null;
  return String(round(record.value, metric?.decimals || 0));
}

/** "just now" / "3h ago" / "11d ago". */
export function relativeAge(timestamp, now = Date.now()) {
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return '';
  const secs = Math.max(0, Math.round((now - t) / 1000));
  if (secs < 90) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** ISO instant `days` before `now`, for the endpoint's start_date filter. */
export function since(days, now = Date.now()) {
  return new Date(now - days * 86400000).toISOString();
}

/** Chart points for a metric, oldest first (the API returns newest first). */
export function toSeries(records, metric) {
  const pts = (records || [])
    .map(r => {
      const t = stamp(r);
      if (Number.isNaN(t)) return null;
      if (metric?.key === 'blood_pressure') {
        if (r.systolic == null && r.diastolic == null && r.map == null) return null;
        return { t, systolic: r.systolic ?? null, diastolic: r.diastolic ?? null, map: r.map ?? null };
      }
      if (r.value == null) return null;
      return { t, value: r.value };
    })
    .filter(Boolean);
  pts.sort((a, b) => a.t - b.t);
  return pts;
}
