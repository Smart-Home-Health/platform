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
// Turning room readings into the timeline's environment lanes.
//
// Kept apart from the page because this is the part with rules in it: which
// band a reading falls in, and where one band stops and the next starts.

/* The lanes, in the order they read. `banded` metrics show their whole day as
 * a continuous strip because every state is worth seeing (PM2.5 being fine all
 * afternoon is information); the rest only draw where they are out of bounds,
 * so an empty lane means an uneventful one. */
export const ENV_LANES = [
  { metric: 'temperature', label: 'Room °C', banded: false },
  { metric: 'relative_humidity', label: 'Humidity', banded: false },
  { metric: 'co2', label: 'CO2', banded: false },
  { metric: 'pm25', label: 'PM2.5', banded: true },
];

export const ENV_METRIC_KEYS = ENV_LANES.map((l) => l.metric);

/* Where one reading sits against a patient's bounds.
 *
 * Critical is tested before caution so a reading past both reports the worse
 * of the two, and each side is only tested when a bound exists — a missing
 * bound means "no opinion", never zero. */
export function classifyEnv(value, range) {
  if (value == null || Number.isNaN(value) || !range) return 'unknown';
  const { caution_min: cLo, caution_max: cHi,
    critical_min: xLo, critical_max: xHi } = range;
  if (xHi != null && value > xHi) return 'critical-high';
  if (xLo != null && value < xLo) return 'critical-low';
  if (cHi != null && value > cHi) return 'caution-high';
  if (cLo != null && value < cLo) return 'caution-low';
  return 'ok';
}

export const isOutOfBounds = (status) =>
  status !== 'ok' && status !== 'unknown';

export const severityOf = (status) => {
  if (status.startsWith('critical')) return 'critical';
  if (status.startsWith('caution')) return 'caution';
  return status === 'ok' ? 'ok' : 'unknown';
};

export const directionOf = (status) => {
  if (status.endsWith('-high')) return 'high';
  if (status.endsWith('-low')) return 'low';
  return null;
};

/**
 * Collapse bucketed readings into contiguous spans of one status.
 *
 * Adjacent buckets of the same status merge, so an hour over the CO2 ceiling
 * is one bar rather than four. A gap longer than one bucket breaks the span
 * instead of bridging it — the room was not measured then, and drawing
 * straight through would assert a reading nobody took.
 *
 * @param rows      [{ ts: epoch ms, value: number }] ascending
 * @param range     the patient's bounds for this metric
 * @param bucketMs  nominal spacing between readings
 * @param keepOk    include in-bounds spans (banded lanes) or drop them
 */
export function buildEnvSpans(rows, range, bucketMs, { keepOk = false } = {}) {
  const spans = [];
  let current = null;

  const close = () => {
    if (!current) return;
    if (keepOk || isOutOfBounds(current.status)) spans.push(current);
    current = null;
  };

  rows.forEach((row) => {
    const status = classifyEnv(row.value, range);
    const brokeByGap = current && row.ts - current.to > bucketMs * 1.5;
    if (current && (current.status !== status || brokeByGap)) close();
    if (!current) {
      current = { status, from: row.ts, to: row.ts, peak: row.value, samples: 0 };
    }
    current.to = row.ts;
    current.samples += 1;
    // Peak is the reading that best justifies the span's colour: the extreme
    // in whatever direction the span is flagged.
    if (row.value != null) {
      const dir = directionOf(status);
      if (dir === 'low') current.peak = Math.min(current.peak ?? row.value, row.value);
      else current.peak = Math.max(current.peak ?? row.value, row.value);
    }
  });
  close();

  // A span covers the bucket it ends in, not just the instant it started.
  return spans.map((s) => ({ ...s, to: s.to + bucketMs }));
}

/** Worst status seen across a day's spans, for the lane's summary chip. */
export function worstStatus(spans) {
  let worst = 'ok';
  spans.forEach((s) => {
    const sev = severityOf(s.status);
    if (sev === 'critical') worst = 'critical';
    else if (sev === 'caution' && worst !== 'critical') worst = 'caution';
  });
  return worst;
}

export function describeSpan(metricLabel, span, unit) {
  const dir = directionOf(span.status);
  const sev = severityOf(span.status);
  if (!dir) return `${metricLabel} within range`;
  const peak = span.peak == null ? '' : ` (${Math.round(span.peak * 10) / 10}${unit || ''})`;
  return `${metricLabel} ${sev === 'critical' ? 'critically ' : ''}${dir}${peak}`;
}
