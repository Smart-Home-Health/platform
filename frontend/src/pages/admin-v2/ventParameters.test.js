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
// Reading a ventilator parameter. The fixtures are shaped after real rows
// from 2026-05-31 — including the three parameters whose percentile band
// comes back inverted, which is what printed "660.7 – 40.4" on the old page.
import { describe, it, expect } from 'vitest';
import {
  headlineOf, bandOf, flagsFor, needsReview, bandPosition, formatValue,
  isUnknownParameter, rowsFrom, matchesQuery,
} from './ventParameters';

const param = (over = {}) => ({
  parameter_key: '9408',
  display_label: 'BREATH RATE',
  display_units: 'BPM',
  display_type: 'NumericMonitor',
  grouping: 'Ventilation',
  scale_factor: 1.0,
  precision: 1,
  total_samples: 40,
  stats_by_suffix: {
    5: { n: 10, lo: 0, hi: 20, mean: 12 },
    50: { n: 10, lo: 0, hi: 31, mean: 25 },
    95: { n: 10, lo: 20, hi: 45, mean: 41 },
  },
  ...over,
});

describe('headlineOf', () => {
  it('leads with the median series', () => {
    expect(headlineOf(param())).toMatchObject({
      value: 25, lo: 0, hi: 31, n: 10, basis: 'median',
    });
  });

  it('falls back to the single value when the device sends no median', () => {
    const p = param({ stats_by_suffix: { N: { n: 26, lo: 0, hi: 3029, mean: 370 } } });
    expect(headlineOf(p)).toMatchObject({ value: 370, basis: 'raw' });
  });

  it('treats a bare suffix as the single value too', () => {
    const p = param({ stats_by_suffix: { '': { n: 4, lo: 1, hi: 2, mean: 1.5 } } });
    expect(headlineOf(p).basis).toBe('raw');
  });

  it('returns nothing rather than a zero for a parameter with no stats', () => {
    expect(headlineOf(param({ stats_by_suffix: {} }))).toBeNull();
  });
});

describe('bandOf', () => {
  it('reports the 5th to 95th percentile band', () => {
    expect(bandOf(param())).toEqual({ lo: 12, hi: 41, inverted: false });
  });

  it('orders an inverted band low to high and says that it was inverted', () => {
    // Real condition on 3 of 44 parameters; the old page printed 660.7 – 40.4.
    const p = param({
      stats_by_suffix: {
        5: { n: 9, lo: 0, hi: 900, mean: 660.7 },
        50: { n: 9, lo: 0, hi: 100, mean: 94.9 },
        95: { n: 9, lo: 0, hi: 80, mean: 40.4 },
      },
    });
    expect(bandOf(p)).toEqual({ lo: 40.4, hi: 660.7, inverted: true });
  });

  it('has no band when a percentile series is missing', () => {
    expect(bandOf(param({ stats_by_suffix: { 50: { n: 1, lo: 1, hi: 1, mean: 1 } } })))
      .toBeNull();
  });
});

describe('flagsFor', () => {
  it('flags nothing on a well-described parameter', () => {
    expect(flagsFor(param())).toEqual([]);
    expect(needsReview(param())).toBe(false);
  });

  it('flags a parameter with no median series', () => {
    const p = param({ stats_by_suffix: { N: { n: 26, lo: 0, hi: 3029, mean: 370 } } });
    expect(flagsFor(p).map((f) => f.key)).toContain('rawOnly');
    expect(needsReview(p)).toBe(true);
  });

  it('flags a missing scale factor', () => {
    expect(flagsFor(param({ scale_factor: null })).map((f) => f.key)).toContain('noScale');
  });

  it('does not flag a scale of 1.0 as missing', () => {
    // 1.0 is both a real scale and the parser's fallback for unknown. We
    // cannot tell them apart, so we say nothing rather than guess either way.
    expect(flagsFor(param({ scale_factor: 1.0 })).map((f) => f.key)).not.toContain('noScale');
  });

  it('flags missing units without calling it a review item', () => {
    const flags = flagsFor(param({ display_units: null }));
    expect(flags.map((f) => f.key)).toEqual(['noUnits']);
    expect(needsReview(param({ display_units: null }))).toBe(false);
  });

  it('flags an unknown parameter once, not three times', () => {
    // The API falls back to the bare key for the label, and such a row has no
    // units or scale either — saying so three times is noise.
    const unknown = param({
      parameter_key: '16011', display_label: '16011', display_type: null,
      display_units: null, scale_factor: null,
    });
    expect(isUnknownParameter(unknown)).toBe(true);
    expect(flagsFor(unknown).map((f) => f.key)).toEqual(['unknown']);
    expect(needsReview(unknown)).toBe(true);
  });

  it('does not mistake a dictionary entry that labels itself by its key', () => {
    const odd = param({ display_label: '9408', display_type: 'NumericMonitor' });
    expect(isUnknownParameter(odd)).toBe(false);
  });

  it('orders flags worst first', () => {
    const p = param({
      display_units: null, scale_factor: null,
      stats_by_suffix: { N: { n: 3, lo: 0, hi: 9, mean: 4 } },
    });
    expect(flagsFor(p).map((f) => f.key)).toEqual(['rawOnly', 'noScale', 'noUnits']);
  });
});

describe('bandPosition', () => {
  it('places a value inside its range', () => {
    expect(bandPosition(25, 0, 50)).toBe(0.5);
    expect(bandPosition(0, 0, 50)).toBe(0);
    expect(bandPosition(50, 0, 50)).toBe(1);
  });

  it('clamps a value that sits outside its own range', () => {
    expect(bandPosition(60, 0, 50)).toBe(1);
    expect(bandPosition(-5, 0, 50)).toBe(0);
  });

  it('refuses to place a value with nothing to place it against', () => {
    expect(bandPosition(25, null, 50)).toBeNull();
    expect(bandPosition(null, 0, 50)).toBeNull();
    // A flat range would divide by zero and render as a bar at the far left.
    expect(bandPosition(5, 5, 5)).toBeNull();
  });
});

describe('formatValue', () => {
  it('honours the vendor precision', () => {
    expect(formatValue(20.74, 1)).toBe('20.7');
    expect(formatValue(11.4912, 2)).toBe('11.49');
  });

  it('drops decimals on values in the thousands', () => {
    expect(formatValue(3029.4, 2)).toBe('3029');
  });

  it('caps runaway precision', () => {
    expect(formatValue(1.23456789, 9)).toBe('1.2346');
  });

  it('returns nothing for a missing value', () => {
    expect(formatValue(null, 1)).toBeNull();
    expect(formatValue(undefined, 1)).toBeNull();
  });
});

describe('rowsFrom', () => {
  const day = {
    groups: [
      { name: 'Ventilation', parameters: [param(), param({ parameter_key: '9406', display_label: 'VTE' })] },
      { name: 'Oxygen', parameters: [param({ parameter_key: '16003', display_label: 'OA2 O2 Delivered' })] },
    ],
  };

  it('flattens the groups while keeping membership and order', () => {
    const rows = rowsFrom(day);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.group)).toEqual(['Ventilation', 'Ventilation', 'Oxygen']);
    expect(rows[0].headline.value).toBe(25);
  });

  it('survives an empty day', () => {
    expect(rowsFrom(null)).toEqual([]);
    expect(rowsFrom({ groups: [] })).toEqual([]);
  });

  it('searches label and vendor key', () => {
    const rows = rowsFrom(day);
    expect(rows.filter((r) => matchesQuery(r, 'vte'))).toHaveLength(1);
    expect(rows.filter((r) => matchesQuery(r, '16003'))).toHaveLength(1);
    expect(rows.filter((r) => matchesQuery(r, ''))).toHaveLength(3);
    expect(rows.filter((r) => matchesQuery(r, 'nope'))).toHaveLength(0);
  });
});
