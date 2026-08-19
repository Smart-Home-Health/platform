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
import { describe, it, expect } from 'vitest';
import { describeSelection, DAYS, REPEAT_MODES } from './useCronSchedule';

describe('describeSelection', () => {
  it('reads back a daily schedule', () => {
    expect(describeSelection({ mode: 'daily', days: [], dayOfMonth: 1, time: '07:00' }))
      .toBe('Daily · 7:00 AM');
    expect(describeSelection({ mode: 'daily', days: [], dayOfMonth: 1, time: '00:30' }))
      .toBe('Daily · 12:30 AM');
    expect(describeSelection({ mode: 'daily', days: [], dayOfMonth: 1, time: '12:00' }))
      .toBe('Daily · 12:00 PM');
  });

  it('names the selected weekdays', () => {
    expect(describeSelection({ mode: 'weekly', days: [1, 3, 5], dayOfMonth: 1, time: '08:00' }))
      .toBe('Mon, Wed, Fri · 8:00 AM');
  });

  it('treats a full week as daily', () => {
    expect(describeSelection({ mode: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], dayOfMonth: 1, time: '08:00' }))
      .toBe('Daily · 8:00 AM');
  });

  it('says so when a weekly schedule has no days', () => {
    // The form blocks saving in this state; the summary should not pretend
    // the schedule would ever fire.
    expect(describeSelection({ mode: 'weekly', days: [], dayOfMonth: 1, time: '08:00' }))
      .toBe('No days selected');
  });

  it('reads back a monthly schedule', () => {
    expect(describeSelection({ mode: 'monthly', days: [], dayOfMonth: 15, time: '09:30' }))
      .toBe('Day 15 monthly · 9:30 AM');
  });

  it('exposes the day and mode options the forms render', () => {
    expect(DAYS).toHaveLength(7);
    expect(DAYS[0]).toEqual({ value: 0, label: 'Sun' });
    expect(REPEAT_MODES.map((m) => m.value)).toEqual(['daily', 'weekly', 'monthly']);
  });
});
