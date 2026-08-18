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
// The presentation rollup behind the dose panel's four counts. The suite pins
// TZ=America/New_York, so the local slot labels are deterministic.
import { describe, it, expect } from 'vitest';
import {
  BUCKETS, bucketFor, rollupSchedule, slotLabel, groupBySlot,
} from './scheduleRollup';

const at = (h, m = 0) => new Date(2026, 7, 17, h, m, 0).toISOString();
const dose = (name, status, hour, extra = {}) => ({
  id: `${name}-${hour}`, name, status, scheduled_time: at(hour), ...extra,
});

describe('bucketFor', () => {
  it('maps every status ScheduleList declares', () => {
    expect(bucketFor('completed')).toBe('given');
    expect(bucketFor('skipped')).toBe('skipped');
    expect(bucketFor('missed')).toBe('missed');
    for (const due of ['pending', 'upcoming', 'due_on_time', 'due_warning', 'due_late']) {
      expect(bucketFor(due)).toBe('due');
    }
  });

  it('counts an unknown status as due rather than dropping it', () => {
    // Something a human still has to look at is better than a vanished row.
    expect(bucketFor('something_new')).toBe('due');
    expect(bucketFor(undefined)).toBe('due');
  });

  it('only ever returns a declared bucket', () => {
    const statuses = ['completed', 'skipped', 'missed', 'pending', 'upcoming',
      'due_on_time', 'due_warning', 'due_late', 'nonsense'];
    statuses.forEach(s => expect(BUCKETS).toContain(bucketFor(s)));
  });
});

describe('rollupSchedule', () => {
  it('counts each bucket and totals the day', () => {
    const { counts, total } = rollupSchedule([
      dose('a', 'completed', 8), dose('b', 'completed', 8),
      dose('c', 'missed', 8),
      dose('d', 'due_on_time', 12),
      dose('e', 'skipped', 16),
    ]);
    expect(counts).toEqual({ given: 2, due: 1, missed: 1, skipped: 1 });
    expect(total).toBe(5);
  });

  it('needs attention means missed or due — never given or skipped', () => {
    const { needsAttention } = rollupSchedule([
      dose('given', 'completed', 8),
      dose('skipped', 'skipped', 9),
      dose('missed', 'missed', 10),
      dose('due', 'due_warning', 11),
    ]);
    expect(needsAttention.map(i => i.name)).toEqual(['missed', 'due']);
  });

  it('puts missed ahead of due, and orders each by scheduled time', () => {
    const { needsAttention } = rollupSchedule([
      dose('due-late', 'due_on_time', 16),
      dose('missed-late', 'missed', 12),
      dose('due-early', 'pending', 14),
      dose('missed-early', 'missed', 8),
    ]);
    expect(needsAttention.map(i => i.name))
      .toEqual(['missed-early', 'missed-late', 'due-early', 'due-late']);
  });

  it('leads with the most pressing item', () => {
    const { lead } = rollupSchedule([
      dose('later', 'due_on_time', 16),
      dose('overdue', 'missed', 8),
    ]);
    expect(lead.item.name).toBe('overdue');
    expect(lead.bucket).toBe('missed');
  });

  it('has no lead when the day is clear', () => {
    const { lead, counts, needsAttention } = rollupSchedule([
      dose('a', 'completed', 8), dose('b', 'skipped', 9),
    ]);
    expect(lead).toBeNull();
    expect(needsAttention).toEqual([]);
    expect(counts.given).toBe(1);
  });

  it('orders undated items last instead of leaving it to the engine', () => {
    // A NaN comparator makes the sort order implementation-defined, and
    // groupBySlot explicitly keeps undated items — so they do occur.
    const { needsAttention } = rollupSchedule([
      { id: 'no-date', name: 'undated', status: 'due_on_time', scheduled_time: null },
      dose('late', 'due_on_time', 16),
      { id: 'bad-date', name: 'unparseable', status: 'due_on_time', scheduled_time: 'nope' },
      dose('early', 'due_on_time', 8),
    ]);
    expect(needsAttention.slice(0, 2).map(i => i.name)).toEqual(['early', 'late']);
    expect(needsAttention.slice(2).map(i => i.name).sort())
      .toEqual(['undated', 'unparseable']);
  });

  it('handles an empty day', () => {
    const { counts, total, needsAttention, lead } = rollupSchedule([]);
    expect(counts).toEqual({ given: 0, due: 0, missed: 0, skipped: 0 });
    expect(total).toBe(0);
    expect(needsAttention).toEqual([]);
    expect(lead).toBeNull();
  });

  it('defaults to an empty list rather than throwing', () => {
    expect(rollupSchedule().total).toBe(0);
  });
});

describe('slotLabel', () => {
  it('is the zero-padded local clock time', () => {
    expect(slotLabel(at(8, 0))).toBe('08:00');
    expect(slotLabel(at(16, 5))).toBe('16:05');
  });

  it('is empty for an unparseable time', () => {
    expect(slotLabel('not a date')).toBe('');
    expect(slotLabel(null)).toBe('');
  });
});

describe('groupBySlot', () => {
  it('buckets by local time, earliest first', () => {
    const groups = groupBySlot([
      dose('c', 'pending', 16), dose('a', 'missed', 8),
      dose('b', 'missed', 8), dose('d', 'pending', 12),
    ]);
    expect(groups.map(g => g.time)).toEqual(['08:00', '12:00', '16:00']);
    expect(groups[0].items.map(i => i.name)).toEqual(['a', 'b']);
  });

  it('keeps undated items in a trailing slot instead of dropping them', () => {
    const groups = groupBySlot([
      { id: 'x', name: 'broken', status: 'pending', scheduled_time: 'nope' },
      dose('a', 'missed', 8),
    ]);
    expect(groups.map(g => g.time)).toEqual(['08:00', '']);
    expect(groups[1].items.map(i => i.name)).toEqual(['broken']);
  });

  it('handles an empty day', () => {
    expect(groupBySlot([])).toEqual([]);
  });
});
