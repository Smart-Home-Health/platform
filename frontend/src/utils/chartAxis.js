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
/* Axis helpers for the live charts.
 *
 * The point of all three is *stability*. A streaming chart re-renders about
 * once a second; if the axis scale is derived from the data (recharts'
 * `domain={['dataMin','dataMax']}` plus auto-generated ticks) every new sample
 * moves the domain, the tick values are recomputed from scratch, and the
 * labels renumber and reflow — which reads as flicker. Instead we pin the
 * domain to a wall-clock window and hand recharts an explicit tick list on
 * round boundaries, so labels hold their text and simply slide.
 */

// Wall-clock ladder. Every entry divides evenly into the next unit up, so
// ticks always land on a round second / minute / hour.
export const TIME_TICK_STEPS = [
  15 * 1000,
  30 * 1000,
  60 * 1000,
  2 * 60 * 1000,
  5 * 60 * 1000,
  10 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
];

/** Smallest ladder step that fits `windowMs` in at most `target` ticks. */
export function pickTimeStep(windowMs, target = 5) {
  const span = Math.max(0, windowMs);
  return (
    TIME_TICK_STEPS.find(step => span / step <= target) ||
    TIME_TICK_STEPS[TIME_TICK_STEPS.length - 1]
  );
}

// Enough slack to absorb a DST shift when guessing where in the day to start
// scanning (the guess uses elapsed milliseconds, which a transition skews).
const DAY_MS = 24 * 60 * 60 * 1000;
const DST_SLACK_MS = 2 * 60 * 60 * 1000;

/**
 * Round wall-clock tick positions inside [startMs, endMs].
 *
 * Every ladder step divides evenly into a day, so the boundaries are always
 * "local midnight + k * step". Each one is built from date *components* so the
 * platform resolves the UTC offset in effect at that instant. Two things go
 * wrong if you instead take one offset and add fixed millisecond steps:
 *  - a half-hour zone (India, Newfoundland) puts every hourly tick on :30 when
 *    anchored to the epoch, and
 *  - a DST transition inside the window drags every later tick off the local
 *    boundary — 6h ticks landing on 07:00/13:00/19:00 instead of
 *    06:00/12:00/18:00 for the spring-forward day.
 */
export function buildTimeTicks(startMs, endMs, step) {
  if (!(step > 0) || !(endMs > startMs)) return [];
  const perDay = Math.round(DAY_MS / step);
  const stepSeconds = step / 1000;
  const from = new Date(startMs);
  const year = from.getFullYear();
  const month = from.getMonth();
  const date = from.getDate();
  const ticks = [];

  // The window is at most a day (see CHART_RANGES), so a few calendar days
  // always covers it; the 64-tick cap is the runaway backstop.
  for (let day = 0; day < 4; day += 1) {
    const dayStart = new Date(year, month, date + day).getTime();
    const firstK = Math.max(0, Math.floor((startMs - dayStart - DST_SLACK_MS) / step));
    for (let k = firstK; k < perDay; k += 1) {
      const t = new Date(year, month, date + day, 0, 0, k * stepSeconds).getTime();
      if (t > endMs) return ticks;
      // The spring-forward hour doesn't exist, so two k values can resolve to
      // the same instant — keep the sequence strictly increasing.
      if (t >= startMs && (ticks.length === 0 || t > ticks[ticks.length - 1])) {
        ticks.push(t);
        if (ticks.length >= 64) return ticks;
      }
    }
  }
  return ticks;
}

// 1 / 2 / 5 x 10^n — the classic "nice number" ladder.
function niceStep(rough) {
  if (!(rough > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/**
 * A y-domain that holds still. The raw min/max are padded, then rounded
 * *outward* to a nice step, so the scale only moves when the data genuinely
 * leaves the band instead of breathing with every sample.
 *
 * `clampZero` keeps the existing "don't go below 0 for medical metrics"
 * behaviour. Empty input returns the [0, 10] placeholder the charts used
 * before, so the "waiting for data" state is unchanged.
 */
export function niceYDomain(values, { padRatio = 0.1, clampZero = true, targetTicks = 4 } = {}) {
  const finite = values.filter(v => Number.isFinite(v));
  if (finite.length === 0) return [0, 10];

  const rawMin = Math.min(...finite);
  const rawMax = Math.max(...finite);
  const spread = rawMax - rawMin;
  // A flat line still needs a band to sit in; fall back to a share of the
  // value itself (or 1 at zero) so it lands mid-chart rather than on an edge.
  const pad = spread > 0 ? spread * padRatio : Math.abs(rawMax) * padRatio || 1;

  const step = niceStep((spread + 2 * pad) / targetTicks);
  let lo = Math.floor((rawMin - pad) / step) * step;
  const hi = Math.ceil((rawMax + pad) / step) * step;
  if (clampZero && lo < 0 && rawMin >= 0) lo = 0;

  // Floating-point crumbs (0.30000000000000004) would defeat the whole point
  // by changing the domain identity; round to the step's own precision.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const round = (v) => Number(v.toFixed(Math.min(decimals + 1, 10)));
  return [round(lo), round(hi)];
}
