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
// Day-over-day derivations, kept out of the page so the numbers under the
// chart can be tested without a canvas.
//
// The API returns per-day buckets: {hour, avg, min, max, count} for an
// aggregated request, and {hour, avg} only when aggregation is 'none' (raw
// samples). Everything below has to survive that second shape.

export const MAX_DAYS = 7;

export const VITAL_TYPES = [
  { value: 'spo2', label: 'SpO2', unit: '%' },
  { value: 'heart_rate', label: 'Heart Rate', unit: 'bpm' },
  { value: 'respiratory_rate', label: 'Respiratory Rate', unit: '/min' },
  { value: 'blood_pressure', label: 'Blood Pressure (MAP)', unit: 'mmHg' },
  { value: 'temperature', label: 'Temperature', unit: '°F' },
  { value: 'weight', label: 'Weight', unit: 'lbs' },
];

export const AGGREGATIONS = [
  { value: 'hour', label: 'Hourly', note: 'Hourly average' },
  { value: '15min', label: '15 min', note: '15-minute average' },
  { value: '5min', label: '5 min', note: '5-minute average' },
  { value: 'none', label: 'Raw', note: 'Every sample' },
];

export const SOURCE_LABELS = {
  pulse_ox: 'Pulse ox',
  vent: 'Ventilator',
  manual: 'Manual',
  none: 'No data',
};

/* Identity, not status: these say *which day*, so amber and red are kept out
 * of the set — on this page they mean "below the configured alarm", and a day
 * that happens to be fourth in the list must not borrow that meaning. */
export const SERIES_COLORS = [
  '#4da7bd', // cyan — matches --vc-data-live
  '#3fbf6a', // green — matches --vc-state-complete
  '#9b8cf0', // violet
  '#4dc3b3', // teal
  '#7f9fd4', // steel
  '#d98cc4', // orchid
  '#a8c94a', // lime
];

export const seriesColor = (slot) => SERIES_COLORS[(slot ?? 0) % SERIES_COLORS.length];

/* Which configured alarm thresholds are worth drawing for a vital. These come
 * from account settings — the same numbers the live monitor alarms on — rather
 * than a reference invented for the report. SpO2's ceiling is 100, which
 * nothing breaches, so only its floor is drawn. */
const ALARM_KEYS = {
  spo2: { low: 'min_spo2' },
  heart_rate: { low: 'min_bpm', high: 'max_bpm' },
};

export function alarmsFor(vitalType, settings) {
  const keys = ALARM_KEYS[vitalType];
  if (!keys || !settings) return { low: null, high: null };
  const num = (key) => {
    if (!key) return null;
    const raw = settings[key];
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return { low: num(keys.low), high: num(keys.high) };
}

const HOUR_NAMES = [
  '12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM', '7 AM',
  '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM',
  '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM',
];

export function formatHourLabel(hour) {
  const h = Math.floor(hour);
  const minutes = Math.round((hour - h) * 60);
  const base = HOUR_NAMES[((h % 24) + 24) % 24] || '';
  if (!minutes) return base;
  const [num, period] = base.split(' ');
  return `${num}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function hourWindowLabel(startHour, endHour) {
  return `${formatHourLabel(startHour)}–${formatHourLabel(endHour)}`;
}

/* Date strings are plain YYYY-MM-DD local days — parsed by hand so the
 * browser doesn't read them as UTC and shift the label back a day. */
export function parseDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDayLabel(dateStr) {
  const dt = parseDate(dateStr);
  if (Number.isNaN(dt.getTime())) return String(dateStr);
  // No separator between the weekday and the date: three chips have to fit a
  // phone row, and the comma/dot is the widest thing that adds nothing.
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .replace(',', '');
}

export const inWindow = (hour, startHour, endHour) => hour >= startHour && hour < endHour + 1;

export function pointsFor(day, { startHour = 0, endHour = 23 } = {}) {
  return (day?.hourly || [])
    .filter(b => b && b.avg !== null && b.avg !== undefined && inWindow(b.hour, startHour, endHour));
}

/**
 * The row under the chart. `avg` is weighted by sample count where the API
 * gives one — an hour holding 3,000 pulse-ox samples should not count the same
 * as an hour holding one manual reading.
 */
export function summarizeDay(day, window = {}) {
  const points = pointsFor(day, window);
  if (!points.length) {
    return { points: [], avg: null, low: null, high: null, coverage: 0, samples: 0 };
  }
  let weighted = 0;
  let weight = 0;
  let low = Infinity;
  let high = -Infinity;
  const hours = new Set();
  points.forEach(b => {
    const n = Number.isFinite(b.count) && b.count > 0 ? b.count : 1;
    weighted += b.avg * n;
    weight += n;
    // Raw requests have no min/max — the sample itself is both.
    low = Math.min(low, b.min ?? b.avg);
    high = Math.max(high, b.max ?? b.avg);
    hours.add(Math.floor(b.hour));
  });
  return {
    points,
    avg: Math.round((weighted / weight) * 10) / 10,
    low,
    high,
    coverage: hours.size,
    samples: weight,
  };
}

export function summarizeDays(days, window = {}) {
  return (days || []).map(day => ({ date: day.date, source: day.source, ...summarizeDay(day, window) }));
}

/* Y range from what is actually drawn — the averages. Bucket minimums are
 * deliberately excluded: a single dropout to 70% would stretch the axis and
 * flatten every trace on it, and the day's true low is reported in the table
 * below instead. The range then widens to take in an alarm line, but only when
 * that line is near enough to be about this chart. */
export function yDomain(rows, { vitalType, alarms = {}, padRatio = 0.1 } = {}) {
  const values = [];
  rows.forEach(r => r.points.forEach(b => values.push(b.avg)));
  if (!values.length) return { min: 0, max: 100, lines: [] };

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const span = dataMax - dataMin;
  const pad = Math.max(span * padRatio, 1);

  let min = vitalType === 'spo2' ? Math.max(0, Math.min(dataMin - pad, 92)) : Math.max(0, dataMin - pad);
  let max = vitalType === 'spo2' ? 100 : dataMax + pad;

  // Measured against the axis rather than the data: a flat day still shows its
  // alarm line, because the axis around it already has room.
  const reach = Math.max(span * 0.5, 5);
  const lines = [];
  if (Number.isFinite(alarms.low) && alarms.low !== null && alarms.low >= min - reach) {
    lines.push({ key: 'low', value: alarms.low });
    min = Math.min(min, alarms.low - pad / 2);
  }
  if (Number.isFinite(alarms.high) && alarms.high !== null && alarms.high <= max + reach) {
    lines.push({ key: 'high', value: alarms.high });
    max = Math.max(max, alarms.high + pad / 2);
  }
  // Whole numbers only: an axis that starts at 89.5 because that is where the
  // padding landed reads like a measurement rather than a scale.
  return { min: Math.floor(min), max: vitalType === 'spo2' ? max : Math.ceil(max), lines };
}

/* A day breaches when its lowest reading fell under the configured alarm (or
 * its highest went over). That is the one thing on this page that earns red —
 * it is the same threshold the monitor alarms on. */
export function breaches(row, alarms = {}) {
  return {
    low: Number.isFinite(alarms.low) && alarms.low !== null && row.low !== null && row.low < alarms.low,
    high: Number.isFinite(alarms.high) && alarms.high !== null && row.high !== null && row.high > alarms.high,
  };
}

export function toCsv(reportData, window = {}) {
  const unit = reportData?.unit || '';
  const header = ['date', 'hour', `avg (${unit})`, `min (${unit})`, `max (${unit})`, 'samples'];
  const lines = [header.join(',')];
  (reportData?.days || []).forEach(day => {
    pointsFor(day, window).forEach(b => {
      lines.push([
        day.date,
        b.hour,
        b.avg ?? '',
        b.min ?? '',
        b.max ?? '',
        b.count ?? '',
      ].join(','));
    });
  });
  return `${lines.join('\n')}\n`;
}

export function csvFileName(vitalType, dates) {
  const span = dates.length ? `${dates[0]}_${dates[dates.length - 1]}` : 'no-days';
  return `day-over-day_${vitalType}_${span}.csv`;
}
