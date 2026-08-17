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
// Live-chart axis helpers. The suite pins TZ=America/New_York (a whole-hour
// offset), so local-clock assertions are stable; the half-hour-offset case is
// covered by stubbing getTimezoneOffset directly.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { pickTimeStep, buildTimeTicks, niceYDomain, TIME_TICK_STEPS } from './chartAxis';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('pickTimeStep', () => {
  it('keeps every dashboard range within the target tick count', () => {
    // The four CHART_RANGES from useLiveVitalsBuffer.
    for (const minutes of [15, 60, 360, 1440]) {
      const windowMs = minutes * MIN;
      const step = pickTimeStep(windowMs);
      expect(TIME_TICK_STEPS).toContain(step);
      expect(windowMs / step).toBeLessThanOrEqual(5);
    }
  });

  it('picks the smallest step that fits, not just any fitting step', () => {
    expect(pickTimeStep(15 * MIN)).toBe(5 * MIN);   // 3 ticks
    expect(pickTimeStep(60 * MIN)).toBe(15 * MIN);  // 4 ticks
    expect(pickTimeStep(6 * HOUR)).toBe(2 * HOUR);  // 3 ticks
    expect(pickTimeStep(24 * HOUR)).toBe(6 * HOUR); // 4 ticks
  });

  it('honours a custom target', () => {
    expect(pickTimeStep(60 * MIN, 10)).toBe(10 * MIN);
  });

  it('falls back to the largest step for an absurd window', () => {
    expect(pickTimeStep(365 * 24 * HOUR)).toBe(TIME_TICK_STEPS[TIME_TICK_STEPS.length - 1]);
  });
});

describe('buildTimeTicks', () => {
  it('lands on round local-clock boundaries', () => {
    // 14:03:37 local -> the 5-minute ticks should be :05, :10, :15...
    const start = new Date(2026, 7, 17, 14, 3, 37, 250).getTime();
    const ticks = buildTimeTicks(start, start + 15 * MIN, 5 * MIN);
    const labels = ticks.map(t => {
      const d = new Date(t);
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${d.getSeconds()}`;
    });
    expect(labels).toEqual(['14:05:0', '14:10:0', '14:15:0']);
  });

  it('stays inside the window', () => {
    const start = new Date(2026, 7, 17, 9, 0, 0).getTime();
    const end = start + HOUR;
    const ticks = buildTimeTicks(start, end, 15 * MIN);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(start);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(end);
  });

  it('only changes as the window crosses a step boundary — the whole point', () => {
    // A window sliding one second at a time must keep the same labels until a
    // boundary passes; that stability is what stops the axis flickering.
    const base = new Date(2026, 7, 17, 14, 3, 0).getTime();
    const first = buildTimeTicks(base, base + 15 * MIN, 5 * MIN);
    for (let s = 1; s <= 60; s += 1) {
      const t = base + s * 1000;
      expect(buildTimeTicks(t, t + 15 * MIN, 5 * MIN)).toEqual(first);
    }
  });

  // The invariant that matters: read back in local time, every tick sits on a
  // multiple of the step within its own day. This is what makes the labels
  // round, and it holds regardless of the zone's offset or a DST transition.
  const onLocalBoundary = (t, step) => {
    const d = new Date(t);
    const intoDay = ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000
      + d.getMilliseconds();
    return intoDay % step === 0;
  };

  it('puts every tick on a local-clock boundary, for every range', () => {
    const start = new Date(2026, 7, 17, 14, 3, 37, 250).getTime();
    for (const minutes of [15, 60, 360, 1440]) {
      const windowMs = minutes * MIN;
      const step = pickTimeStep(windowMs);
      const ticks = buildTimeTicks(start, start + windowMs, step);
      expect(ticks.length).toBeGreaterThan(0);
      ticks.forEach(t => expect(onLocalBoundary(t, step)).toBe(true));
    }
  });

  it('holds the boundary across a spring-forward transition', () => {
    // TZ is pinned to America/New_York: 2026-03-08 02:00 EST -> 03:00 EDT.
    // A fixed offset taken at the window start used to push the post-shift
    // ticks to 07:00 / 13:00 / 19:00.
    const start = new Date(2026, 2, 7, 18, 0, 0).getTime();
    const ticks = buildTimeTicks(start, start + 24 * HOUR, 6 * HOUR);
    expect(ticks.map(t => new Date(t).getHours())).toEqual([18, 0, 6, 12, 18]);
    ticks.forEach(t => expect(onLocalBoundary(t, 6 * HOUR)).toBe(true));
  });

  it('holds the boundary across a fall-back transition', () => {
    // 2026-11-01 02:00 EDT -> 01:00 EST. The repeated hour must not produce a
    // duplicate or a backwards step. Note 24 *real* hours from Oct 31 18:00
    // only reaches 17:00 local, because that day is 25 hours long — so the
    // closing 18:00 tick falls outside the window, correctly.
    const start = new Date(2026, 9, 31, 18, 0, 0).getTime();
    const ticks = buildTimeTicks(start, start + 24 * HOUR, 6 * HOUR);
    expect(ticks.map(t => new Date(t).getHours())).toEqual([18, 0, 6, 12]);
    ticks.forEach(t => expect(onLocalBoundary(t, 6 * HOUR)).toBe(true));
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  it('stays strictly increasing over the non-existent spring-forward hour', () => {
    // An hourly walk straight through 02:00 on 2026-03-08 — the local clock
    // goes 01:00 then 03:00, and 5 real hours reach 06:00 because the day is
    // only 23 hours long.
    const start = new Date(2026, 2, 8, 0, 30, 0).getTime();
    const ticks = buildTimeTicks(start, start + 5 * HOUR, HOUR);
    expect(new Set(ticks).size).toBe(ticks.length);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
    expect(ticks.map(t => new Date(t).getHours())).toEqual([1, 3, 4, 5, 6]);
    // No 02:00 label, because that hour does not exist locally.
    expect(ticks.map(t => new Date(t).getHours())).not.toContain(2);
  });

  it('returns nothing for a degenerate window or step', () => {
    const now = Date.now();
    expect(buildTimeTicks(now, now, 5 * MIN)).toEqual([]);
    expect(buildTimeTicks(now, now + HOUR, 0)).toEqual([]);
    expect(buildTimeTicks(now + HOUR, now, 5 * MIN)).toEqual([]);
  });
});

describe('niceYDomain', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the placeholder band for no data', () => {
    expect(niceYDomain([])).toEqual([0, 10]);
    expect(niceYDomain([null, undefined, NaN])).toEqual([0, 10]);
  });

  it('rounds outward so the data always fits inside', () => {
    const values = [93, 97, 99];
    const [lo, hi] = niceYDomain(values);
    expect(lo).toBeLessThanOrEqual(93);
    expect(hi).toBeGreaterThanOrEqual(99);
  });

  it('holds still while values drift within the band', () => {
    // Typical SpO2 wobble: the domain must not move for every sample.
    const base = niceYDomain([94, 96, 98]);
    expect(niceYDomain([94, 96, 98, 97])).toEqual(base);
    expect(niceYDomain([94, 95, 96, 98, 97.5])).toEqual(base);
  });

  it('re-steps when the data genuinely leaves the band', () => {
    const base = niceYDomain([94, 96, 98]);
    const wider = niceYDomain([60, 96, 98]);
    expect(wider[0]).toBeLessThan(base[0]);
  });

  it('gives a flat series a band to sit in', () => {
    const [lo, hi] = niceYDomain([72, 72, 72]);
    expect(hi).toBeGreaterThan(lo);
    expect(lo).toBeLessThanOrEqual(72);
    expect(hi).toBeGreaterThanOrEqual(72);
  });

  it('clamps at zero for non-negative data, and releases it when asked', () => {
    expect(niceYDomain([1, 2, 3])[0]).toBe(0);
    expect(niceYDomain([1, 2, 3], { clampZero: false })[0]).toBeLessThanOrEqual(0);
  });

  it('does not clamp data that is genuinely negative', () => {
    expect(niceYDomain([-5, 3])[0]).toBeLessThan(0);
  });

  it('avoids floating-point crumbs that would change the domain identity', () => {
    const [lo, hi] = niceYDomain([0.12, 0.34, 0.28]);
    expect(String(lo)).not.toMatch(/\d{6,}/);
    expect(String(hi)).not.toMatch(/\d{6,}/);
  });
});
