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

  it('anchors to the local offset, not the epoch (half-hour zones)', () => {
    // India is UTC+5:30 -> getTimezoneOffset() === -330. Anchoring to epoch
    // multiples would put every hourly tick on :30.
    const spy = vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-330);
    try {
      // 04:00 UTC == 09:30 IST, so the ticks fall on 10:00 / 11:00 / 12:00 IST
      // — half past the hour in UTC, which is exactly what epoch-anchoring
      // would get wrong (it would place them on the UTC hour instead).
      const start = Date.UTC(2026, 7, 17, 4, 0, 0);
      const ticks = buildTimeTicks(start, start + 3 * HOUR, HOUR);
      expect(ticks.map(t => (t - start) / HOUR)).toEqual([0.5, 1.5, 2.5]);
      // Every tick is a whole hour on the *local* (IST) clock.
      const IST_OFFSET = 5.5 * HOUR;
      ticks.forEach(t => expect((t + IST_OFFSET) % HOUR).toBe(0));
    } finally {
      spy.mockRestore();
    }
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
