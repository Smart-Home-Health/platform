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
// Weekly-summary derivations, kept out of the page so the figures and the
// shareable summary can be tested without a canvas.
//
// Reads /api/reports/weekly-summary: period, vitals (per-vital min/avg/max and
// a daily series carrying each day's own low/avg/high), compliance, nutrition,
// alerts, equipment_due and symptoms.

export const VITALS = [
  { key: 'spo2', label: 'SpO2', unit: '%', alarmKey: 'low' },
  { key: 'heart_rate', label: 'Heart rate', unit: 'bpm' },
  { key: 'respiratory_rate', label: 'Respiratory rate', unit: '/min' },
  { key: 'temperature', label: 'Temperature', unit: '°F' },
  { key: 'weight', label: 'Weight', unit: 'lbs' },
];

/* Series colours are identity, not status — same rule as the other reports, so
 * amber and red stay free to mean "alarm" and "breached it". */
export const VITAL_COLORS = {
  spo2: '#4da7bd',
  heart_rate: '#3fbf6a',
  respiratory_rate: '#9b8cf0',
  temperature: '#4dc3b3',
  weight: '#7f9fd4',
};

export const parseDate = (dateStr) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function shiftWeek(endDate, weeks) {
  const d = parseDate(endDate);
  d.setDate(d.getDate() + weeks * 7);
  return toDateStr(d);
}

export function weekLabel(period) {
  if (!period?.start || !period?.end) return '';
  const start = parseDate(period.start);
  const end = parseDate(period.end);
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const year = end.getFullYear();
  return startMonth === endMonth
    ? `${startMonth} ${start.getDate()}–${end.getDate()}, ${year}`
    : `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
}

export const dayLabel = (dateStr) =>
  parseDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const weekdayLabel = (dateStr) =>
  parseDate(dateStr).toLocaleDateString('en-US', { weekday: 'short' });

/* Every day of the week, whether or not anything was recorded — a gap should
 * read as a gap rather than closing up as if the week were shorter. */
export function weekDays(period) {
  if (!period?.start || !period?.end) return [];
  const out = [];
  const cursor = parseDate(period.start);
  const end = parseDate(period.end);
  while (cursor <= end) {
    out.push(toDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function alignSeries(period, daily, field = 'avg') {
  const byDate = Object.fromEntries((daily || []).map(d => [d.date, d]));
  return weekDays(period).map(date => ({
    date,
    value: byDate[date] ? byDate[date][field] ?? null : null,
    low: byDate[date]?.low ?? null,
    high: byDate[date]?.high ?? null,
  }));
}

/* One row per vital that has readings. `worst` is the day the reader is
 * looking for: the lowest low for SpO2, the highest high for the rest. */
export function vitalRows(data, alarms = {}, colors = VITAL_COLORS) {
  const period = data?.period;
  return VITALS.map(v => {
    const vd = data?.vitals?.[v.key];
    const series = alignSeries(period, vd?.daily);
    const recorded = series.filter(p => p.value !== null);
    if (!vd || !recorded.length) return null;

    const lows = series.filter(p => p.low !== null);
    const worstDay = v.key === 'spo2' && lows.length
      ? lows.reduce((a, b) => (b.low < a.low ? b : a))
      : null;
    const alarmLow = v.key === 'spo2' && Number.isFinite(alarms.low) ? alarms.low : null;

    return {
      ...v,
      color: colors[v.key],
      min: vd.min,
      avg: vd.avg,
      max: vd.max,
      series,
      days: recorded.length,
      worstDay,
      breached: alarmLow !== null && vd.min !== null && vd.min < alarmLow,
      alarmLow,
    };
  }).filter(Boolean);
}

/* The care bar. Medications and care tasks are counted separately because only
 * medications record a late/on-time split — folding a completed task into
 * "on time" would be inventing a punctuality it never recorded. */
export function careGroups(compliance) {
  const meds = compliance?.medications || {};
  const tasks = compliance?.care_tasks || {};
  const group = (label, segments, total) => {
    const counted = segments.reduce((sum, s) => sum + s.count, 0);
    return {
      label,
      total: total || counted,
      segments: segments.filter(s => s.count > 0),
      done: segments.filter(s => s.key === 'on_time' || s.key === 'late' || s.key === 'completed')
        .reduce((sum, s) => sum + s.count, 0),
    };
  };
  const out = [];
  if (meds.total_scheduled) {
    out.push(group('Medications', [
      { key: 'on_time', label: 'On time', count: meds.on_time || 0, tone: 'ok' },
      { key: 'late', label: 'Late', count: meds.late || 0, tone: 'warn' },
      { key: 'skipped', label: 'Skipped', count: meds.skipped || 0, tone: 'muted' },
      { key: 'missed', label: 'Missed', count: meds.missed || 0, tone: 'warn' },
    ], meds.total_scheduled));
  }
  if (tasks.total_scheduled) {
    out.push(group('Care tasks', [
      { key: 'completed', label: 'Completed', count: tasks.completed || 0, tone: 'ok' },
      { key: 'skipped', label: 'Skipped', count: tasks.skipped || 0, tone: 'muted' },
      { key: 'missed', label: 'Missed', count: tasks.missed || 0, tone: 'warn' },
    ], tasks.total_scheduled));
  }
  return out;
}

export function careTotals(compliance) {
  const meds = compliance?.medications || {};
  const tasks = compliance?.care_tasks || {};
  const scheduled = (meds.total_scheduled || 0) + (tasks.total_scheduled || 0);
  const done = (meds.on_time || 0) + (meds.late || 0) + (tasks.completed || 0);
  const missed = (meds.missed || 0) + (tasks.missed || 0);
  return {
    scheduled,
    done,
    missed,
    pct: compliance?.overall_pct ?? (scheduled ? Math.round((done / scheduled) * 1000) / 10 : null),
  };
}

export function peakDay(dailyCounts) {
  const list = (dailyCounts || []).filter(d => d.count > 0);
  if (!list.length) return null;
  return list.reduce((a, b) => (b.count > a.count ? b : a));
}

export function equipmentRollup(items) {
  const list = Array.isArray(items) ? items : [];
  const overdue = list.filter(e => (e.days_overdue || 0) > 0);
  return { total: list.length, overdue: overdue.length, items: list, worst: overdue[0] || list[0] || null };
}

/* Minutes only up to a couple of hours — a week's worth of alert time runs to
 * thousands of minutes, which nobody reads as a duration. */
export function formatDuration(minutes) {
  if (!minutes) return '0m';
  if (minutes < 120) return `${Math.round(minutes)}m`;
  const h = Math.round(minutes / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export const formatNumber = (n, digits = 0) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });

/* The four figures at the top. Care adherence is amber when short, never red. */
export function headlineTiles(data) {
  const care = careTotals(data?.compliance);
  const alerts = data?.alerts || {};
  const nutrition = data?.nutrition || {};
  const equipment = equipmentRollup(data?.equipment_due);
  return [
    {
      key: 'care',
      label: 'Care completed',
      value: care.pct === null ? '—' : `${care.pct}%`,
      note: care.scheduled ? `${care.done} of ${care.scheduled}` : 'Nothing scheduled',
      tone: care.pct === null ? null : care.pct >= 90 ? 'ok' : 'warn',
    },
    {
      key: 'alerts',
      label: 'Alert triggers',
      value: alerts.total ?? 0,
      note: alerts.total ? `${formatDuration(alerts.total_duration_minutes)} total` : 'None',
      tone: alerts.total ? 'breach' : 'ok',
    },
    {
      key: 'calories',
      label: 'Avg calories',
      value: nutrition.avg_calories ? formatNumber(nutrition.avg_calories) : '—',
      note: nutrition.goals?.calories_target
        ? `goal ${formatNumber(nutrition.goals.calories_target)}`
        : 'No goal set',
      tone: null,
    },
    {
      key: 'equipment',
      label: 'Equipment due',
      value: equipment.total,
      note: equipment.overdue ? `${equipment.overdue} overdue` : 'Nothing due',
      tone: equipment.overdue ? 'warn' : 'ok',
    },
  ];
}

/* The week as text, for the appointment it is meant to be taken to. */
export function buildSummary(data, { patientName, alarms = {} } = {}) {
  const lines = [];
  const care = careTotals(data?.compliance);
  const alerts = data?.alerts || {};
  const nutrition = data?.nutrition || {};
  const equipment = equipmentRollup(data?.equipment_due);
  const symptoms = data?.symptoms || {};

  lines.push(`${patientName ? `${patientName} · ` : ''}Week of ${weekLabel(data?.period)}`);

  vitalRows(data, alarms).forEach(v => {
    const range = v.min === null || v.max === null ? '' : ` · range ${v.min}–${v.max}${v.unit}`;
    lines.push(`${v.label}: avg ${v.avg}${v.unit}${range}${v.breached ? ` (under the ${v.alarmLow}${v.unit} alarm)` : ''}`);
  });

  if (care.scheduled) {
    lines.push(`Care: ${care.done} of ${care.scheduled} completed${care.pct !== null ? ` (${care.pct}%)` : ''}${care.missed ? ` · ${care.missed} missed` : ''}`);
  }
  lines.push(alerts.total ? `Alert triggers: ${alerts.total}` : 'Alert triggers: none');
  if (nutrition.avg_calories) {
    lines.push(`Nutrition: ${formatNumber(nutrition.avg_calories)} cal/day average${nutrition.goals?.calories_target ? ` against a ${formatNumber(nutrition.goals.calories_target)} goal` : ''}`);
  }
  if (equipment.total) {
    lines.push(`Equipment: ${equipment.total} due${equipment.overdue ? `, ${equipment.overdue} overdue` : ''}`);
  }
  if (symptoms.new?.length || symptoms.unresolved_count) {
    lines.push(`Symptoms: ${symptoms.new?.length || 0} new this week, ${symptoms.unresolved_count || 0} unresolved`);
  }
  return lines.join('\n');
}
