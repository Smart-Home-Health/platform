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
import {
  buildTimeline, groupChanges, filterEvents, withinRange, byDay,
  timelineSummary, hasNote, toCsvRows, toCsv,
} from './equipmentHistory';

const TODAY = new Date('2026-08-19T12:00:00');

const CHANGES = [
  { id: 1, equipment_id: 10, equipment_name: 'Vent tube', changed_at: '2026-06-26T00:21:00', changed_by_name: 'John' },
  { id: 2, equipment_id: 11, equipment_name: 'Trach tube', changed_at: '2026-06-26T00:22:00', changed_by_name: 'John' },
  { id: 3, equipment_id: 12, equipment_name: 'Humidification chamber', changed_at: '2026-06-26T00:23:00', changed_by_name: 'John', notes: 'Replaced early' },
];

const COUNTS = [
  {
    id: 5, equipment_id: 20, equipment_name: 'Connector STRT Two Base',
    quantity_before: 4, quantity_after: 0, note: 'Used / corrected count',
    counted_by_name: 'Mary', counted_at: '2026-08-19T10:42:00',
  },
];

const SHIPMENTS = [
  {
    id: 30, supplier_name: 'Pediatric Home Service', order_number: '78599210',
    status: 'complete', item_count: 18, actual_delivery: '2026-08-04T14:15:00',
  },
  // Never landed — belongs to no day on this timeline.
  { id: 31, supplier_name: 'Other', status: 'draft', item_count: 2 },
];

const build = () => buildTimeline({ changes: CHANGES, counts: COUNTS, shipments: SHIPMENTS });

describe('buildTimeline', () => {
  it('merges the three records into one list, newest first', () => {
    const events = build();
    expect(events.map((e) => e.kind)).toEqual(['stock', 'delivery', 'change']);
  });

  it('dates a delivery by when it landed, not when it was raised', () => {
    const [, delivery] = build();
    expect(delivery.at).toBe('2026-08-04T14:15:00');
  });

  it('leaves out a shipment that never arrived', () => {
    // A draft has no arrival date; dating it by anything else would be a guess.
    expect(build().some((e) => e.shipmentId === 31)).toBe(false);
  });

  it('drops events with an unusable timestamp rather than sorting them oddly', () => {
    const events = buildTimeline({
      changes: [{ id: 9, equipment_name: 'Broken', changed_at: 'not a date' }],
    });
    expect(events).toEqual([]);
  });

  it('resolves which way a stocktake went', () => {
    const [stock] = build();
    expect(stock.before).toBe(4);
    expect(stock.after).toBe(0);
    expect(stock.delta).toBe(-4);
    expect(stock.direction).toBe('down');
  });

  it('calls a stocktake that changed nothing "same", not a rise', () => {
    const [stock] = buildTimeline({
      counts: [{ id: 1, quantity_before: 5, quantity_after: 5, counted_at: '2026-08-19T10:00:00' }],
    });
    expect(stock.direction).toBe('same');
    expect(stock.delta).toBe(0);
  });
});

describe('groupChanges', () => {
  it('collapses one person\'s changes on one day into a single entry', () => {
    const events = build();
    const set = events.find((e) => e.kind === 'change');
    expect(set.items).toHaveLength(3);
    expect(set.who).toBe('John');
  });

  it('dates the set by its most recent change', () => {
    const set = build().find((e) => e.kind === 'change');
    expect(set.at).toBe('2026-06-26T00:23:00');
  });

  it('keeps different people apart on the same day', () => {
    const events = groupChanges([
      { id: 'a', kind: 'change', at: '2026-06-26T01:00:00', who: 'John' },
      { id: 'b', kind: 'change', at: '2026-06-26T02:00:00', who: 'Mary' },
    ]);
    expect(events).toHaveLength(2);
  });

  it('keeps the same person apart across days', () => {
    // The grouping is per calendar day, not a tolerance around a time —
    // 23:59 and 00:01 are different days and stay separate entries.
    const events = groupChanges([
      { id: 'a', kind: 'change', at: '2026-06-26T23:59:00', who: 'John' },
      { id: 'b', kind: 'change', at: '2026-06-27T00:01:00', who: 'John' },
    ]);
    expect(events).toHaveLength(2);
  });

  it('groups unattributed changes together rather than dropping them', () => {
    const events = groupChanges([
      { id: 'a', kind: 'change', at: '2026-06-26T01:00:00', who: null },
      { id: 'b', kind: 'change', at: '2026-06-26T02:00:00', who: null },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].items).toHaveLength(2);
  });

  it('leaves other kinds untouched', () => {
    const events = groupChanges([{ id: 's', kind: 'stock', at: '2026-08-19T10:00:00' }]);
    expect(events[0].kind).toBe('stock');
    expect(events[0].items).toBeUndefined();
  });
});

describe('filterEvents', () => {
  it('filters by kind', () => {
    expect(filterEvents(build(), { type: 'stock' })).toHaveLength(1);
    expect(filterEvents(build(), { type: 'delivery' })).toHaveLength(1);
    expect(filterEvents(build(), { type: 'all' })).toHaveLength(3);
  });

  it('treats notes as a cross-cutting filter, not a fourth source', () => {
    // The stocktake and one change both carry a note; both should survive.
    const noted = filterEvents(build(), { type: 'note' });
    expect(noted.map((e) => e.kind).sort()).toEqual(['change', 'stock']);
  });

  it('searches inside a change set, not just its heading', () => {
    // The set's own title is empty; the supply name lives on its members.
    const found = filterEvents(build(), { search: 'trach' });
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('change');
  });

  it('searches the delivery reference and supplier', () => {
    expect(filterEvents(build(), { search: '78599210' })).toHaveLength(1);
    expect(filterEvents(build(), { search: 'pediatric' })).toHaveLength(1);
  });

  it('is case-insensitive and ignores surrounding space', () => {
    expect(filterEvents(build(), { search: '  MARY ' })).toHaveLength(1);
  });
});

describe('withinRange', () => {
  it('keeps only what falls inside the window', () => {
    expect(withinRange(build(), 30, TODAY).map((e) => e.kind)).toEqual(['stock', 'delivery']);
  });

  it('keeps everything when the range is off', () => {
    expect(withinRange(build(), 0, TODAY)).toHaveLength(3);
  });
});

describe('byDay', () => {
  it('buckets events by calendar day, newest day first', () => {
    const days = byDay(build());
    expect(days).toHaveLength(3);
    expect(days[0].events[0].kind).toBe('stock');
  });

  it('puts several events on one day into the same bucket', () => {
    const days = byDay([
      { id: 1, at: '2026-08-19T09:00:00' },
      { id: 2, at: '2026-08-19T17:00:00' },
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].events).toHaveLength(2);
  });
});

describe('timelineSummary', () => {
  it('reports the count and the span actually shown', () => {
    const { count, from, to } = timelineSummary(build());
    expect(count).toBe(3);
    expect(from.getMonth()).toBe(5);  // June
    expect(to.getMonth()).toBe(7);    // August
  });

  it('says nothing rather than an empty range', () => {
    expect(timelineSummary([])).toEqual({ count: 0, from: null, to: null });
  });
});

describe('hasNote', () => {
  it('finds a note on the event or on a member of a set', () => {
    expect(hasNote({ note: 'x' })).toBe(true);
    expect(hasNote({ items: [{ note: null }, { note: 'y' }] })).toBe(true);
    expect(hasNote({ items: [{ note: null }] })).toBe(false);
    expect(hasNote({})).toBe(false);
  });
});

describe('csv export', () => {
  it('exports a change set as its members, not as a summary row', () => {
    const rows = toCsvRows(build());
    const changeRows = rows.filter((r) => r[1] === 'Change');
    expect(changeRows).toHaveLength(3);
    expect(changeRows.map((r) => r[2])).toContain('Trach tube');
  });

  it('spells out what a stocktake did', () => {
    const row = toCsvRows(build()).find((r) => r[1] === 'Stock');
    expect(row[3]).toBe('4 → 0 (Used / corrected count)');
  });

  it('quotes cells containing commas or quotes', () => {
    const csv = toCsv([{
      kind: 'stock', at: '2026-08-19T10:00:00', title: 'Tube, large',
      before: 1, after: 2, note: 'said "ok"', who: 'Mary',
    }]);
    expect(csv).toContain('"Tube, large"');
    expect(csv).toContain('"1 → 2 (said ""ok"")"');
  });

  it('starts with a header row', () => {
    expect(toCsvRows([])[0]).toEqual(['When', 'Type', 'What', 'Detail', 'Who']);
  });
});
