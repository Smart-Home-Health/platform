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
// Stored crons are UTC; the label must read in local time. The test TZ is
// pinned to America/New_York (UTC-4 in August, but Vitest runs with DST per
// the date — these use offsets computed at runtime so they hold year-round).
import { describe, it, expect } from 'vitest';
import { describeCron } from './cronLabel';

// The local hour a given UTC hour renders as today.
const localHourOf = (utcHour) => {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.getHours();
};

const fmt = (h) => {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
};

describe('describeCron', () => {
  it('shows the local wall-clock time, not the stored UTC hour', () => {
    // 10:00 UTC is the 6:00 AM breakfast in America/New_York (EDT).
    expect(describeCron('0 10 * * *')).toBe(`Daily · ${fmt(localHourOf(10))}`);
  });

  it('converts every time of a multi-firing day', () => {
    const label = describeCron('0 10,16 * * *');
    expect(label).toBe(`Daily · ${fmt(localHourOf(10))}, ${fmt(localHourOf(16))}`);
  });

  it('shifts weekly day names when the conversion crosses midnight', () => {
    // 01:00 UTC Monday is Sunday evening in America/New_York.
    const local = localHourOf(1);
    const crossed = local > 1; // conversion moved the time to the prior day
    const label = describeCron('0 1 * * 1');
    expect(label).toBe(`${crossed ? 'Sun' : 'Mon'} · ${fmt(local)}`);
  });

  it('leaves intervals and fallbacks alone', () => {
    expect(describeCron('*/30 * * * *')).toBe('Daily · every 30 min');
    expect(describeCron('')).toBe('Not scheduled');
    expect(describeCron('nonsense')).toBe('nonsense');
  });
});
