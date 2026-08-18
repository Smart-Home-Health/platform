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
// The numbers under the day-over-day chart. Two shapes have to survive here:
// aggregated buckets ({hour, avg, min, max, count}) and raw samples, which
// carry `avg` alone.
import { describe, it, expect } from 'vitest';
import {
  SERIES_COLORS, seriesColor, alarmsFor, formatHourLabel, hourWindowLabel,
  formatDayLabel, pointsFor, summarizeDay, summarizeDays, yDomain, breaches,
  toCsv, csvFileName,
} from './dayOverDay';

const bucket = (hour, avg, min = avg - 2, max = avg + 2, count = 100) =>
  ({ hour, avg, min, max, count });

const day = (date, buckets, source = 'pulse_ox') => ({ date, source, hourly: buckets });

describe('series colours', () => {
  it('keeps amber and red out of the day palette', () => {
    // Those two mean "alarm" and "breached" on this page; a fourth day must
    // not borrow the meaning just by being fourth.
    expect(SERIES_COLORS).not.toContain('#f0a52e');
    expect(SERIES_COLORS).not.toContain('#f0563c');
  });

  it('wraps rather than running out', () => {
    expect(seriesColor(0)).toBe(SERIES_COLORS[0]);
    expect(seriesColor(SERIES_COLORS.length)).toBe(SERIES_COLORS[0]);
    expect(seriesColor(undefined)).toBe(SERIES_COLORS[0]);
  });
});

describe('alarmsFor', () => {
  const settings = { min_spo2: 90, max_spo2: 100, min_bpm: 55, max_bpm: 155 };

  it('draws only the floor for SpO2 — the ceiling is 100 and nothing breaches it', () => {
    expect(alarmsFor('spo2', settings)).toEqual({ low: 90, high: null });
  });

  it('takes both ends for heart rate', () => {
    expect(alarmsFor('heart_rate', settings)).toEqual({ low: 55, high: 155 });
  });

  it('has nothing to draw for a vital with no configured alarm', () => {
    expect(alarmsFor('weight', settings)).toEqual({ low: null, high: null });
    expect(alarmsFor('spo2', null)).toEqual({ low: null, high: null });
  });

  it('ignores a blank setting rather than reading it as zero', () => {
    expect(alarmsFor('spo2', { min_spo2: '' }).low).toBeNull();
    expect(alarmsFor('spo2', { min_spo2: '88' }).low).toBe(88);
  });
});

describe('labels', () => {
  it('names hours the way the axis reads them', () => {
    expect(formatHourLabel(0)).toBe('12 AM');
    expect(formatHourLabel(6)).toBe('6 AM');
    expect(formatHourLabel(13)).toBe('1 PM');
    expect(formatHourLabel(23)).toBe('11 PM');
  });

  it('keeps the minutes on a sub-hour bucket', () => {
    expect(formatHourLabel(6.25)).toBe('6:15 AM');
    expect(formatHourLabel(13.5)).toBe('1:30 PM');
  });

  it('reads the window as a range', () => {
    expect(hourWindowLabel(0, 23)).toBe('12 AM–11 PM');
    expect(hourWindowLabel(22, 6)).toBe('10 PM–6 AM');
  });

  it('reads a plain date as a local day, not a UTC instant', () => {
    // '2026-08-02' parsed by Date() would land on Aug 1 west of UTC.
    expect(formatDayLabel('2026-08-02')).toBe('Sun Aug 2');
  });
});

describe('pointsFor', () => {
  const d = day('2026-08-02', [bucket(0, 96), bucket(6, 92), bucket(23, 97), { hour: 12, avg: null }]);

  it('drops empty buckets and anything outside the window', () => {
    expect(pointsFor(d).map(b => b.hour)).toEqual([0, 6, 23]);
    expect(pointsFor(d, { startHour: 6, endHour: 12 }).map(b => b.hour)).toEqual([6]);
  });

  it('survives a day with no buckets at all', () => {
    expect(pointsFor(day('2026-08-03', []))).toEqual([]);
    expect(pointsFor(undefined)).toEqual([]);
  });
});

describe('summarizeDay', () => {
  it('weights the average by sample count', () => {
    // An hour holding 3,000 pulse-ox samples should not count the same as an
    // hour holding one manual reading.
    const row = summarizeDay(day('2026-08-02', [
      { hour: 0, avg: 98, min: 97, max: 99, count: 3000 },
      { hour: 1, avg: 90, min: 90, max: 90, count: 1 },
    ]));
    expect(row.avg).toBeCloseTo(98, 1);
    expect(row.samples).toBe(3001);
  });

  it('takes the low from bucket minimums, not from the averages', () => {
    const row = summarizeDay(day('2026-08-02', [bucket(0, 96, 88, 99), bucket(1, 95, 93, 97)]));
    expect(row.low).toBe(88);
    expect(row.high).toBe(99);
  });

  it('falls back to the sample itself when raw data has no min/max', () => {
    const row = summarizeDay(day('2026-08-02', [
      { hour: 0.1, avg: 94 }, { hour: 0.2, avg: 91 },
    ]));
    expect(row.low).toBe(91);
    expect(row.high).toBe(94);
    expect(row.avg).toBeCloseTo(92.5, 1);
  });

  it('counts coverage in whole hours even at sub-hour aggregation', () => {
    const row = summarizeDay(day('2026-08-02', [
      bucket(6, 95), bucket(6.25, 95), bucket(6.5, 95), bucket(7, 95),
    ]));
    expect(row.coverage).toBe(2);
  });

  it('reports nothing rather than NaN for a day with no data', () => {
    expect(summarizeDay(day('2026-08-02', []))).toMatchObject({
      avg: null, low: null, high: null, coverage: 0,
    });
  });

  it('keeps the date and source when summarizing a list', () => {
    const rows = summarizeDays([day('2026-08-02', [bucket(0, 96)], 'manual')]);
    expect(rows[0]).toMatchObject({ date: '2026-08-02', source: 'manual' });
  });
});

describe('yDomain', () => {
  const rows = (buckets) => summarizeDays([day('2026-08-02', buckets)]);

  it('pins SpO2 to 100 at the top and leaves headroom below', () => {
    const d = yDomain(rows([bucket(0, 96, 95, 97)]), { vitalType: 'spo2' });
    expect(d.max).toBe(100);
    expect(d.min).toBeLessThanOrEqual(92);
  });

  it('draws the alarm line when it is near the data', () => {
    const d = yDomain(rows([bucket(0, 93, 91, 95)]), { vitalType: 'spo2', alarms: { low: 90 } });
    expect(d.lines).toEqual([{ key: 'low', value: 90 }]);
    expect(d.min).toBeLessThan(90);
  });

  it('leaves out an alarm nowhere near the readings', () => {
    // Flattening a 60-100 bpm trace to fit a 155 ceiling helps nobody.
    const d = yDomain(rows([bucket(0, 80, 78, 82)]), {
      vitalType: 'heart_rate', alarms: { low: 55, high: 155 },
    });
    expect(d.lines).toEqual([]);
    expect(d.max).toBeLessThan(100);
  });

  it('falls back to a sane range with nothing plotted', () => {
    expect(yDomain([], { vitalType: 'spo2' })).toMatchObject({ min: 0, max: 100, lines: [] });
  });
});

describe('breaches', () => {
  const row = { low: 88, high: 160 };

  it('flags the day whose reading went past the configured alarm', () => {
    expect(breaches(row, { low: 90, high: null })).toMatchObject({ low: true });
    expect(breaches(row, { low: 55, high: 155 })).toEqual({ low: false, high: true });
  });

  it('flags nothing when no alarm is configured', () => {
    expect(breaches(row, {})).toEqual({ low: false, high: false });
    expect(breaches({ low: null, high: null }, { low: 90 })).toEqual({ low: false, high: false });
  });
});

describe('toCsv', () => {
  const data = {
    unit: '%',
    days: [day('2026-08-02', [bucket(0, 96, 94, 98, 120), { hour: 1, avg: null }])],
  };

  it('writes one row per plotted bucket, with the unit in the header', () => {
    const lines = toCsv(data).trim().split('\n');
    expect(lines[0]).toBe('date,hour,avg (%),min (%),max (%),samples');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('2026-08-02,0,96,94,98,120');
  });

  it('exports what is on screen — the hour window applies', () => {
    expect(toCsv(data, { startHour: 6, endHour: 23 }).trim().split('\n')).toHaveLength(1);
  });

  it('names the file after the vital and the span', () => {
    expect(csvFileName('spo2', ['2026-08-02', '2026-08-04']))
      .toBe('day-over-day_spo2_2026-08-02_2026-08-04.csv');
    expect(csvFileName('spo2', [])).toContain('no-days');
  });
});
