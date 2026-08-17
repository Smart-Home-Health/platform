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

/**
 * Round wall-clock tick positions inside [startMs, endMs].
 *
 * Anchored to the *local* UTC offset rather than the epoch: epoch multiples
 * only line up with the local clock when the offset is a whole number of
 * steps, so a half-hour zone (India, Newfoundland) would put every hourly
 * tick on :30.
 */
export function buildTimeTicks(startMs, endMs, step) {
  if (!(step > 0) || !(endMs > startMs)) return [];
  const offset = new Date(startMs).getTimezoneOffset() * 60 * 1000;
  const ticks = [];
  let t = Math.ceil((startMs - offset) / step) * step + offset;
  // Guard against a pathological window/step combination running away.
  for (let i = 0; t <= endMs && i < 64; i += 1) {
    ticks.push(t);
    t += step;
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
