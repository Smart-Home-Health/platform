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
// Wave 1 — timezone/cron utilities. The suite pins TZ=America/New_York (always
// behind UTC), so most assertions use TZ-stable roundtrips/properties rather
// than absolute UTC values that would shift with DST (EDT -4 vs EST -5).
import { describe, it, expect } from 'vitest';
import {
  localTimeToUTC,
  utcTimeToLocal,
  utcDayShiftForLocalTime,
  localTimeAndDaysToUTC,
  utcCronToLocalDaysAndTime,
  parseCronExpression,
  formatCronExpression,
  formatDateOnly,
  checkAdministrationWindow,
  checkEarlyAdministration,
  formatDurationMinutes,
} from './timezone';

describe('local <-> UTC time roundtrip', () => {
  it.each(['00:00', '06:30', '13:15', '23:45'])('roundtrips %s', (t) => {
    const { hour, minute } = localTimeToUTC(t);
    expect(utcTimeToLocal(hour, minute)).toBe(t);
  });

  it('returns numeric hour/minute', () => {
    const { hour, minute } = localTimeToUTC('09:05');
    expect(Number.isInteger(hour)).toBe(true);
    expect(Number.isInteger(minute)).toBe(true);
    expect(minute).toBe(5);
  });
});

describe('utcDayShiftForLocalTime', () => {
  // New York is always behind UTC, so late-evening local times roll the UTC
  // date forward (shift 1) and daytime times stay same-day (shift 0). The -1
  // case only occurs in zones ahead of UTC, which this TZ never is.
  it('late evening rolls UTC forward (+1)', () => {
    expect(utcDayShiftForLocalTime('23:30')).toBe(1);
  });
  it('daytime stays same UTC day (0)', () => {
    expect(utcDayShiftForLocalTime('08:00')).toBe(0);
  });
  it('only ever returns 0 or 1 in this timezone', () => {
    for (let h = 0; h < 24; h++) {
      expect([0, 1]).toContain(utcDayShiftForLocalTime(`${String(h).padStart(2, '0')}:00`));
    }
  });
});

describe('weekly day-list shift roundtrip', () => {
  it('shifts days forward across midnight then back', () => {
    const time = '23:30';      // crosses midnight -> +1 day in UTC
    const localDays = [1, 3];  // Mon, Wed
    const utc = localTimeAndDaysToUTC(time, localDays);
    expect(utc.days).toEqual([2, 4]); // Tue, Thu in UTC

    const back = utcCronToLocalDaysAndTime(utc.hour, utc.minute, utc.days);
    expect(back.time).toBe(time);
    expect(back.days).toEqual(localDays);
  });

  it('daytime keeps the same day list', () => {
    const utc = localTimeAndDaysToUTC('09:00', [0, 6]); // Sun, Sat
    expect(utc.days).toEqual([0, 6]);
  });

  it('wraps Saturday -> Sunday correctly', () => {
    const utc = localTimeAndDaysToUTC('23:30', [6]); // Sat local
    expect(utc.days).toEqual([0]);                   // Sun UTC
  });
});

describe('parseCronExpression / formatCronExpression', () => {
  it('returns null for empty or malformed input', () => {
    expect(parseCronExpression(null)).toBeNull();
    expect(parseCronExpression('')).toBeNull();
    expect(parseCronExpression('1 2 3')).toBeNull(); // wrong field count
  });

  it('parses a daily cron', () => {
    const parsed = parseCronExpression('0 12 * * *');
    expect(parsed.type).toBe('daily');
    expect(parsed.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('parses a monthly cron', () => {
    const parsed = parseCronExpression('30 6 15 * *');
    expect(parsed.type).toBe('monthly');
    expect(parsed.dayOfMonth).toBe(15);
  });

  it('parses a weekly cron and roundtrips local time + days', () => {
    const time = '20:00';
    const localDays = [1, 5]; // Mon, Fri
    const utc = localTimeAndDaysToUTC(time, localDays);
    const cron = `${utc.minute} ${utc.hour} * * ${utc.days.join(',')}`;

    const parsed = parseCronExpression(cron);
    expect(parsed.type).toBe('weekly');
    expect(parsed.time).toBe(time);
    expect(parsed.dayNumbers).toEqual(localDays);
  });

  it('formats each cron shape', () => {
    expect(formatCronExpression('')).toBe('Not scheduled');
    expect(formatCronExpression('0 12 * * *')).toMatch(/^Daily at \d{2}:\d{2}$/);
    expect(formatCronExpression('0 12 15 * *')).toMatch(/^Day 15 at /);
  });
});

describe('formatDateOnly (no timezone drift)', () => {
  it('renders the stored calendar date, not the day before', () => {
    // Midnight-UTC ISO -> must show 05/30, never 05/29.
    expect(
      formatDateOnly('2026-05-30T00:00:00+00:00', { year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-US')
    ).toBe('05/30/2026');
  });
  it('accepts a plain date string', () => {
    expect(formatDateOnly('2026-01-01', { month: '2-digit', day: '2-digit' }, 'en-US')).toBe('01/01');
  });
  it('returns empty string for falsy/invalid input', () => {
    expect(formatDateOnly('')).toBe('');
    expect(formatDateOnly('not-a-date')).toBe('');
  });
});

describe('checkAdministrationWindow', () => {
  const sched = '2026-06-01T12:00:00Z';

  it('is on_window at the scheduled time', () => {
    const r = checkAdministrationWindow(sched, new Date('2026-06-01T12:00:00Z'));
    expect(r.status).toBe('on_window');
    expect(r.minutesOffset).toBe(0);
  });
  it('flags early when given before the window', () => {
    const r = checkAdministrationWindow(sched, new Date('2026-06-01T10:00:00Z'));
    expect(r.status).toBe('early');
    expect(r.minutesOffset).toBe(120);
  });
  it('flags late when given after the window', () => {
    const r = checkAdministrationWindow(sched, new Date('2026-06-01T14:00:00Z'));
    expect(r.status).toBe('late');
    expect(r.minutesOffset).toBe(-120);
  });
  it('treats a naive ISO string as UTC', () => {
    const r = checkAdministrationWindow('2026-06-01T12:00:00', new Date('2026-06-01T12:00:00Z'));
    expect(r.status).toBe('on_window');
  });
  it('returns unknown for missing/invalid input', () => {
    expect(checkAdministrationWindow(null).status).toBe('unknown');
    expect(checkAdministrationWindow('garbage', 'also-garbage').status).toBe('unknown');
  });
});

describe('checkEarlyAdministration wrapper', () => {
  const sched = '2026-06-01T12:00:00Z';
  it('maps early', () => {
    const r = checkEarlyAdministration(sched, new Date('2026-06-01T10:00:00Z'));
    expect(r).toMatchObject({ early: true, late: false, minutesEarly: 120 });
  });
  it('maps late', () => {
    const r = checkEarlyAdministration(sched, new Date('2026-06-01T14:00:00Z'));
    expect(r).toMatchObject({ early: false, late: true, minutesLate: 120 });
  });
});

describe('formatDurationMinutes', () => {
  it.each([
    [45, '45m'],
    [60, '1h'],
    [90, '1h 30m'],
    [125, '2h 5m'],
    [0, '0m'],
    [-10, '0m'],
  ])('formats %i -> %s', (mins, expected) => {
    expect(formatDurationMinutes(mins)).toBe(expected);
  });
});
