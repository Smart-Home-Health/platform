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
// Grace-period cues: an unfilled past dose that is still actionable keeps
// status 'missed' and gets an "Overdue · Xd" label from these helpers.
import { describe, it, expect } from 'vitest';
import { computeScheduleStatus, formatOverdue, overdueLabel, graceTitle } from './scheduleStatus';

describe('formatOverdue', () => {
  it('reads in minutes, then hours, then days', () => {
    expect(formatOverdue(0)).toBe('0m');
    expect(formatOverdue(45)).toBe('45m');
    expect(formatOverdue(89)).toBe('89m');
    expect(formatOverdue(90)).toBe('1h');
    expect(formatOverdue(14 * 60 + 25)).toBe('14h');
    expect(formatOverdue(47 * 60)).toBe('47h');
    expect(formatOverdue(48 * 60)).toBe('2d');
    expect(formatOverdue(3 * 1440 + 60)).toBe('3d');
  });

  it('never goes negative or NaN', () => {
    expect(formatOverdue(-5)).toBe('0m');
    expect(formatOverdue(undefined)).toBe('0m');
    expect(formatOverdue('abc')).toBe('0m');
  });
});

describe('overdueLabel / graceTitle', () => {
  const item = {
    in_grace: true,
    overdue_minutes: 3 * 1440 + 60,
    scheduled_time: '2026-09-01T14:00:00+00:00',
    grace_expires_at: '2026-09-05T18:48:00+00:00',
  };

  it('labels only in-grace items', () => {
    expect(overdueLabel(item)).toBe('Overdue · 3d');
    expect(overdueLabel({ ...item, in_grace: false })).toBeNull();
    expect(overdueLabel(null)).toBeNull();
  });

  it('explains when it was due and when the grace lapses', () => {
    const title = graceTitle(item);
    expect(title).toMatch(/^Originally due .*Sep 1.*; grace expires .*Sep 5/);
    expect(graceTitle({ ...item, in_grace: false })).toBeUndefined();
    // Unparseable dates fall out rather than reading "Invalid Date".
    expect(graceTitle({ ...item, grace_expires_at: 'nope' })).toMatch(/^Originally due /);
    expect(graceTitle({ ...item, grace_expires_at: 'nope' })).not.toMatch(/Invalid/);
  });

  it('does not change the status taxonomy: an in-grace dose is still missed', () => {
    expect(computeScheduleStatus({ ...item, completed: false })).toBe('missed');
    expect(computeScheduleStatus({ ...item, completed: true })).toBe('completed');
  });
});
