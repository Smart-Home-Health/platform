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

/* Derivations over a day of raw pulse-ox readings.
 *
 * `GET /api/monitoring/history/analyze/{date}` already returns the day's
 * scalars and its SpO2 distribution, but not the shape of the day: when the
 * sensor was on, where the dips were, how long they lasted. All of that is
 * recoverable from `GET /api/monitoring/history/raw/{date}`, so it is computed
 * here rather than added to the API.
 *
 * Pure and side-effect free, so the arithmetic can be tested without a DOM. */

/* The boundary between "worth listing" and "unremarkable".
 *
 * Not an invented number: the analyzer's own distribution buckets put the
 * mid-90s band at 94-96 and the low-90s band at 90-93, so anything under 94
 * has already fallen out of the normal band by the backend's taxonomy.
 * Whether an episode is *alert-level* is a separate question, answered by the
 * patient's configured `min_spo2` alarm threshold. */
export const WATCH_SPO2 = 94;

/* A reading with no usable SpO2. The analyzer counts these as
 * `error_spo2_readings`; they are sensor dropouts, not desaturations, and
 * must never be read as a dip. */
const invalid = (r) => r == null || r.spo2 == null || r.spo2 <= 0;

const ms = (r) => new Date(r.timestamp).getTime();

/** Median gap between consecutive readings, in ms. Used to give a
 *  single-sample episode a duration rather than reporting zero. */
export function samplePeriodMs(readings) {
  if (!readings || readings.length < 2) return 0;
  const gaps = [];
  for (let i = 1; i < readings.length; i++) {
    const g = ms(readings[i]) - ms(readings[i - 1]);
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/**
 * Contiguous runs of valid readings below `watch`.
 *
 * A run ends at the first valid reading at or above the threshold. Invalid
 * readings do not end a run and do not extend it — a dropout in the middle of
 * a desaturation is missing information, not a recovery.
 */
export function findEpisodes(readings, { watch = WATCH_SPO2, alarm = null } = {}) {
  if (!readings || !readings.length) return [];
  const period = samplePeriodMs(readings);
  const out = [];
  let run = null;

  const close = () => {
    if (!run) return;
    const span = run.lastMs - run.firstMs;
    out.push({
      startMs: run.firstMs,
      endMs: run.lastMs,
      // One sample covers the period up to the next one, so a lone reading is
      // reported as one sample period rather than as an instant.
      durationMs: span > 0 ? span : period,
      nadir: run.nadir,
      bpmAtNadir: run.bpmAtNadir,
      readings: run.count,
      // Alert-level only when the patient's own alarm threshold was breached.
      alertLevel: alarm != null && run.nadir < alarm,
    });
    run = null;
  };

  for (const r of readings) {
    if (invalid(r)) continue;
    if (r.spo2 < watch) {
      const t = ms(r);
      if (!run) run = { firstMs: t, lastMs: t, nadir: r.spo2, bpmAtNadir: r.bpm ?? null, count: 0 };
      run.lastMs = t;
      run.count += 1;
      if (r.spo2 < run.nadir) { run.nadir = r.spo2; run.bpmAtNadir = r.bpm ?? null; }
    } else {
      close();
    }
  }
  close();
  return out;
}

/**
 * Presence buckets across the covered window, for the coverage strip.
 * Returns `count` slots, each true when at least one valid reading lands in it.
 */
export function coverageBuckets(readings, count = 96) {
  const valid = (readings || []).filter(r => !invalid(r));
  if (valid.length < 2 || count < 1) return { buckets: [], startMs: null, endMs: null };
  const startMs = ms(valid[0]);
  const endMs = ms(valid[valid.length - 1]);
  const span = endMs - startMs;
  if (span <= 0) return { buckets: [], startMs, endMs };
  const buckets = new Array(count).fill(false);
  for (const r of valid) {
    const i = Math.min(count - 1, Math.floor(((ms(r) - startMs) / span) * count));
    buckets[i] = true;
  }
  return { buckets, startMs, endMs };
}

/**
 * Thin the series for plotting. Keeps the extremes of each bucket rather than
 * an average, so a brief desaturation cannot be smoothed out of the picture.
 */
export function downsample(readings, maxPoints = 240) {
  const valid = (readings || []).filter(r => !invalid(r));
  if (valid.length <= maxPoints) {
    return valid.map(r => ({ t: ms(r), spo2: r.spo2, bpm: r.bpm ?? null }));
  }
  const size = Math.ceil(valid.length / Math.max(1, Math.floor(maxPoints / 2)));
  const out = [];
  for (let i = 0; i < valid.length; i += size) {
    const slice = valid.slice(i, i + size);
    let lo = slice[0], hi = slice[0];
    for (const r of slice) {
      if (r.spo2 < lo.spo2) lo = r;
      if (r.spo2 > hi.spo2) hi = r;
    }
    // Emit in time order so the line does not zig-zag backwards.
    const pair = ms(lo) <= ms(hi) ? [lo, hi] : [hi, lo];
    for (const r of pair) out.push({ t: ms(r), spo2: r.spo2, bpm: r.bpm ?? null });
  }
  return out;
}

/** Whole seconds, as "18s" / "2m 04s". */
export function formatDuration(msSpan) {
  const total = Math.max(0, Math.round((msSpan || 0) / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/**
 * The "at a glance" lines: the reading of the day a caregiver wants without
 * doing the arithmetic. `tone` drives the icon, and follows the project rule
 * that amber is attention and red is clinical concern.
 */
export function atAGlance(analysis, episodes, alarm) {
  if (!analysis) return [];
  const dist = analysis.spo2_distribution || {};
  const lowNineties = dist.low_90s_90_93?.count || 0;
  const belowNinety = Object.entries(dist)
    .filter(([k]) => k !== 'zero_errors' && BELOW_90_KEYS.has(k))
    .reduce((a, [, v]) => a + (v?.count || 0), 0);
  const alertLevel = (episodes || []).filter(e => e.alertLevel).length;

  const lines = [];
  lines.push(belowNinety > 0
    ? { tone: 'alert', text: `${belowNinety.toLocaleString()} readings below 90%` }
    : { tone: 'ok', text: 'No readings below 90%' });
  if (lowNineties > 0) lines.push({ tone: 'due', text: `${lowNineties.toLocaleString()} readings between 90-93%` });
  if (alertLevel > 0) {
    lines.push({ tone: 'alert', text: `${alertLevel} episode${alertLevel === 1 ? '' : 's'} below the ${alarm}% alarm threshold` });
  }
  if (analysis.error_spo2_readings > 0) {
    lines.push({ tone: 'due', text: `${analysis.error_spo2_readings.toLocaleString()} sensor errors` });
  }
  lines.push({ tone: 'info', text: `Coverage: ${formatHours(analysis.time_logged_minutes)} of selected day` });
  return lines;
}

const BELOW_90_KEYS = new Set([
  'high_eighties_85_89', 'low_eighties_80_84', 'seventies_70_79', 'sixties_60_69',
  'fifties_50_59', 'forties_40_49', 'thirties_30_39', 'twenties_20_29', 'below_twenty',
]);

/** Minutes as "3h 01m" / "47m". */
export function formatHours(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/* The analyzer returns thirteen SpO2 buckets. That is the right resolution for
 * the wide view, but at the narrow stop it is thirteen near-empty bars, so the
 * sub-90 buckets fold into one band. Folding rather than truncating matters:
 * dropping the tail would hide exactly the readings that matter most.
 *
 * Colours follow the project rule — green is good, cyan is the normal band,
 * amber is attention, red is clinical concern, grey is absent data. */
export const BANDS = [
  { key: 'high', label: 'High 90s (97%+)', tone: 'complete', from: ['high_90s_97_plus'] },
  { key: 'mid', label: 'Mid 90s (94-96%)', tone: 'live', from: ['mid_90s_94_96'] },
  { key: 'low', label: 'Low 90s (90-93%)', tone: 'due', from: ['low_90s_90_93'] },
  { key: 'below', label: 'Below 90%', tone: 'alert', from: [...BELOW_90_KEYS] },
  { key: 'errors', label: 'Sensor errors', tone: 'idle', from: ['zero_errors'] },
];

/** Fold the thirteen analyzer buckets into the five bands above. */
export function collapseDistribution(distribution) {
  const dist = distribution || {};
  return BANDS.map(band => {
    const count = band.from.reduce((a, k) => a + (dist[k]?.count || 0), 0);
    const percentage = band.from.reduce((a, k) => a + (dist[k]?.percentage || 0), 0);
    return { ...band, count, percentage: Math.round(percentage * 10) / 10 };
  });
}
