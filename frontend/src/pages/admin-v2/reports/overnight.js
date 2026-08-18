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
// Overnight-report derivations, kept out of the page so the header figures and
// the handoff text can be tested without a canvas.
//
// Everything here reads the /api/reports/overnight payload: vitals_summary,
// vitals_chart, alerts.items, oxygen, care_checklist and symptoms.

export const DEFAULT_START_HOUR = 20;
export const DEFAULT_END_HOUR = 8;

/* The status vocabulary the schedule helpers hand back. Adherence is never red
 * — a missed dose is amber, not an emergency — so `missed` and `late` share the
 * alarm colour and only clinical readings get `breach`. */
export const DONE_STATUSES = ['completed', 'on_time', 'late'];
export const STATUS_TONE = {
  completed: 'ok',
  on_time: 'ok',
  late: 'warn',
  missed: 'warn',
  skipped: 'muted',
};

export function formatClock(hour) {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}

export function windowLabel(startHour, endHour) {
  return `${formatClock(startHour)}–${formatClock(endHour)}`;
}

export function windowHours(startHour, endHour) {
  const span = (endHour - startHour + 24) % 24;
  return span === 0 ? 24 : span;
}

/* "Aug 17–18" for a night that crosses midnight, "Aug 17" if it does not. */
export function nightLabel(dateStr, startHour = DEFAULT_START_HOUR, endHour = DEFAULT_END_HOUR) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(start.getTime())) return String(dateStr);
  const month = start.toLocaleDateString('en-US', { month: 'short' });
  if (endHour > startHour) return `${month} ${start.getDate()}`;
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 1);
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  return endMonth === month
    ? `${month} ${start.getDate()}–${end.getDate()}`
    : `${month} ${start.getDate()} – ${endMonth} ${end.getDate()}`;
}

export function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${Math.round(minutes * 10) / 10}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/* How much of the night the sensor covered. The API reports it directly; older
 * payloads (before that field shipped) get nothing rather than a guess. */
export function coverage(data) {
  const vs = data?.vitals_summary;
  if (!vs || vs.coverage_minutes === undefined || vs.coverage_minutes === null) return null;
  const total = vs.window_minutes || null;
  return {
    minutes: vs.coverage_minutes,
    windowMinutes: total,
    pct: total ? Math.round((vs.coverage_minutes / total) * 100) : null,
  };
}

export function checklistRollup(items) {
  const list = Array.isArray(items) ? items : [];
  const done = list.filter(i => DONE_STATUSES.includes(i.status)).length;
  const missed = list.filter(i => i.status === 'missed').length;
  const skipped = list.filter(i => i.status === 'skipped').length;
  return { total: list.length, done, missed, skipped };
}

export function careRollup(checklist) {
  const meds = checklistRollup(checklist?.medications);
  const tasks = checklistRollup(checklist?.care_tasks);
  return {
    meds,
    tasks,
    total: meds.total + tasks.total,
    done: meds.done + tasks.done,
    missed: meds.missed + tasks.missed,
  };
}

/* The span the scheduled items actually fall in — "scheduled between 9 PM and
 * 11 PM" is more use than repeating the window the report was run for. */
export function scheduledSpan(checklist) {
  const times = [
    ...(checklist?.medications || []),
    ...(checklist?.care_tasks || []),
  ].map(i => i.scheduled_time).filter(Boolean);
  if (!times.length) return null;
  const toMinutes = (label) => {
    const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(label).trim());
    if (!match) return null;
    let h = Number(match[1]) % 12;
    if (/pm/i.test(match[3])) h += 12;
    return h * 60 + Number(match[2]);
  };
  const withMinutes = times
    .map(t => ({ label: t, minutes: toMinutes(t) }))
    .filter(t => t.minutes !== null);
  if (!withMinutes.length) return null;
  // Overnight wraps past midnight, so evening times sort before morning ones.
  const keyed = withMinutes.map(t => ({ ...t, key: t.minutes < 12 * 60 ? t.minutes + 24 * 60 : t.minutes }));
  keyed.sort((a, b) => a.key - b.key);
  const first = keyed[0].label;
  const last = keyed[keyed.length - 1].label;
  return first === last ? first : `${first} and ${last}`;
}

/* The episodes list under the chart: worst first is wrong here — a night reads
 * in order — but the nadir is what a reader scans for, so it is carried out. */
export function episodes(data) {
  return (data?.alerts?.items || []).map(a => ({
    ...a,
    startMs: new Date(a.start_time).getTime(),
    endMs: a.end_time ? new Date(a.end_time).getTime() : null,
    nadir: a.spo2_min ?? null,
  }));
}

export function statTiles(data, alarms = {}) {
  const vs = data?.vitals_summary || {};
  const alerts = data?.alerts || {};
  const oxygen = data?.oxygen || {};
  const care = careRollup(data?.care_checklist);
  const nadir = vs.spo2?.min ?? null;
  const alarmLow = Number.isFinite(alarms.low) ? alarms.low : null;

  return [
    {
      key: 'episodes',
      label: 'Alert episodes',
      value: alerts.total ?? 0,
      note: alerts.total ? `${formatMinutes(alerts.total_duration_minutes)} total` : 'None',
      tone: alerts.total ? 'breach' : 'ok',
    },
    {
      key: 'nadir',
      label: 'SpO2 nadir',
      value: nadir ?? '—',
      unit: nadir === null ? '' : '%',
      note: vs.spo2 ? `avg ${vs.spo2.avg}%` : 'No readings',
      // Red only when it went under the alarm the monitor uses.
      tone: alarmLow !== null && nadir !== null && nadir < alarmLow ? 'breach' : null,
    },
    {
      key: 'below90',
      label: 'Below 90%',
      value: formatMinutes(vs.spo2?.time_below_90_minutes ?? 0),
      note: vs.spo2?.time_below_90_minutes ? 'of the window' : 'None',
      tone: vs.spo2?.time_below_90_minutes ? 'breach' : 'ok',
    },
    {
      key: 'oxygen',
      label: 'Oxygen use',
      value: formatMinutes(oxygen.total_minutes ?? 0),
      note: oxygen.highest_flow ? `peak ${oxygen.highest_flow}L` : 'None given',
      tone: null,
    },
    {
      key: 'care',
      label: 'Care completed',
      value: `${care.done}/${care.total}`,
      note: care.missed ? `${care.missed} missed` : 'All done',
      // Adherence is never red on this page.
      tone: care.total === 0 ? null : care.done === care.total ? 'ok' : 'warn',
    },
  ];
}

/* A shift handoff, as text. Deliberately plain: it gets pasted into a message
 * or a paper log, so it carries the numbers and no formatting. */
export function buildHandoff(data, { patientName, startHour, endHour } = {}) {
  const vs = data?.vitals_summary || {};
  const alerts = data?.alerts || {};
  const oxygen = data?.oxygen || {};
  const care = careRollup(data?.care_checklist);
  const cov = coverage(data);
  const lines = [];

  const who = patientName ? `${patientName} · ` : '';
  lines.push(`${who}Overnight ${nightLabel(data?.date, startHour, endHour)} · ${windowLabel(startHour, endHour)}`);

  if (vs.spo2) {
    lines.push(`SpO2 ${vs.spo2.min}–${vs.spo2.max}% (avg ${vs.spo2.avg}%) · ${formatMinutes(vs.spo2.time_below_90_minutes)} below 90%`);
  } else {
    lines.push('SpO2: no readings in the window');
  }
  if (vs.heart_rate) {
    lines.push(`HR ${vs.heart_rate.min}–${vs.heart_rate.max} bpm (avg ${vs.heart_rate.avg})`);
  }

  lines.push(alerts.total
    ? `Alert episodes: ${alerts.total} · ${formatMinutes(alerts.total_duration_minutes)} total · longest ${formatMinutes(alerts.longest_duration_minutes)}`
    : 'Alert episodes: none');

  lines.push(oxygen.total_minutes
    ? `Oxygen: ${formatMinutes(oxygen.total_minutes)}${oxygen.highest_flow ? ` · peak ${oxygen.highest_flow}L` : ''}`
    : 'Oxygen: none');

  if (care.total) {
    const missed = [];
    if (care.meds.missed) missed.push(`${care.meds.missed} medication${care.meds.missed === 1 ? '' : 's'}`);
    if (care.tasks.missed) missed.push(`${care.tasks.missed} care task${care.tasks.missed === 1 ? '' : 's'}`);
    lines.push(`Care: ${care.done} of ${care.total} completed${missed.length ? ` · missed ${missed.join(', ')}` : ''}`);
  }

  const symptoms = data?.symptoms || [];
  if (symptoms.length) {
    lines.push(`Symptoms: ${symptoms.map(s => `${s.symptom_type} (${s.severity}/10)`).join(', ')}`);
  }

  if (cov) {
    lines.push(`Sensor coverage: ${formatMinutes(cov.minutes)} of ${formatMinutes(cov.windowMinutes)}${cov.pct !== null ? ` (${cov.pct}%)` : ''}`);
  }

  return lines.join('\n');
}

export function toCsv(data) {
  const lines = ['timestamp,spo2,hr'];
  (data?.vitals_chart || []).forEach(p => {
    lines.push([new Date(p.ts * 1000).toISOString(), p.spo2, p.hr].join(','));
  });
  return `${lines.join('\n')}\n`;
}

export function csvFileName(dateStr) {
  return `overnight_${dateStr || 'report'}.csv`;
}
