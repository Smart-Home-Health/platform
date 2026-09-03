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
// The derivations both message surfaces share. What matters here is that an
// unknown type still lands somewhere (the column is a free string), that the
// source filter only offers what is actually present, and that a message with
// no follow-up says so rather than rendering a broken link.
import { describe, it, expect } from 'vitest';
import {
  severityOf, categoryOf, humanizeType, groupMessages, sourceOptions,
  filterBySource, formatWhen, scopeLabel, snoozeNote, reviewLink, primaryAction,
} from './messageMeta';

const lowMed = (over = {}) => ({
  id: 1, type: 'low_medication', severity: 'warning', title: 'Ojemda is running low',
  dismissible: true, snoozable: true, ack_scope: 'anyone', patient_id: 2,
  data: { medication_id: 9, medication_name: 'Ojemda' }, ...over,
});
const manual = (over = {}) => ({
  id: 2, type: 'general', severity: 'info', title: 'Test',
  dismissible: true, snoozable: true, ack_scope: 'anyone', ...over,
});

describe('severityOf', () => {
  it('falls back to info for an unknown or missing severity', () => {
    expect(severityOf({ severity: 'critical' }).label).toBe('Critical');
    expect(severityOf({ severity: 'nonsense' }).key).toBe('info');
    expect(severityOf(undefined).key).toBe('info');
  });
});

describe('categoryOf', () => {
  it('labels the known types', () => {
    expect(categoryOf(lowMed()).label).toBe('Medication inventory');
    expect(categoryOf(manual()).label).toBe('Manual message');
  });

  it('humanises a type nothing knows about instead of dropping it', () => {
    const cat = categoryOf({ type: 'oxygen_tank_swap' });
    expect(cat.label).toBe('Oxygen tank swap');
    expect(cat.group).toBe('system');
  });

  it('treats a message with no type as a manual one', () => {
    expect(categoryOf({}).label).toBe('Manual message');
  });
});

describe('humanizeType', () => {
  it('never returns an empty label', () => {
    expect(humanizeType('')).toBe('Message');
    expect(humanizeType(null)).toBe('Message');
  });
});

describe('groupMessages', () => {
  it('files generated messages under system and manual ones under other', () => {
    const groups = groupMessages([manual(), lowMed()]);
    expect(groups.map(g => g.key)).toEqual(['system', 'other']);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].type).toBe('low_medication');
  });

  it('leaves no empty heading behind', () => {
    expect(groupMessages([manual()]).map(g => g.key)).toEqual(['other']);
    expect(groupMessages([])).toEqual([]);
  });
});

describe('sourceOptions / filterBySource', () => {
  it('offers only the sources present, plus all', () => {
    const opts = sourceOptions([lowMed(), lowMed({ id: 3 }), manual()]);
    // Sorted by the label a reader sees, so "Manual message" precedes
    // "Medication inventory" even though the types sort the other way.
    expect(opts.map(o => o.value)).toEqual(['all', 'general', 'low_medication']);
    expect(opts[1].label).toBe('Manual message');
  });

  it('collapses to just "all" when there is nothing to filter', () => {
    expect(sourceOptions([]).map(o => o.value)).toEqual(['all']);
  });

  it('filters by type and passes everything through for all', () => {
    const items = [lowMed(), manual()];
    expect(filterBySource(items, 'low_medication')).toHaveLength(1);
    expect(filterBySource(items, 'all')).toHaveLength(2);
    expect(filterBySource(items, undefined)).toHaveLength(2);
  });
});

describe('formatWhen', () => {
  it('reads as a date and a time', () => {
    expect(formatWhen('2026-06-26T14:22:00Z')).toMatch(/^\w+ \d+ · \d+:\d\d/);
  });

  it('says the message is recent rather than showing Invalid Date', () => {
    expect(formatWhen(null)).toBe('Created recently');
    expect(formatWhen('not a date')).toBe('Created recently');
  });
});

describe('scopeLabel', () => {
  it('distinguishes clearing for everyone from acknowledging individually', () => {
    expect(scopeLabel(manual())).toBe('For everyone');
    expect(scopeLabel(manual({ ack_scope: 'per_user' }))).toBe('Each person acknowledges');
  });
});

describe('snoozeNote', () => {
  const now = Date.parse('2026-06-26T12:00:00Z');

  it('reports a snooze that is still running', () => {
    expect(snoozeNote(manual({ snoozed_until: '2026-06-26T13:00:00Z' }), now))
      .toMatch(/^Snoozed until/);
  });

  it('says nothing about one that has lapsed', () => {
    expect(snoozeNote(manual({ snoozed_until: '2026-06-26T11:00:00Z' }), now)).toBeNull();
    expect(snoozeNote(manual(), now)).toBeNull();
  });
});

describe('reviewLink', () => {
  it('points a low-stock message at that patient in the medication list', () => {
    expect(reviewLink(lowMed())).toEqual({
      label: 'Review Ojemda',
      to: '/care/medications/manage?patient=2',
    });
  });

  it('stays generic for a message raised before the name was carried', () => {
    const link = reviewLink(lowMed({ data: { medication_id: 9 }, patient_id: null }));
    expect(link.label).toBe('Review medication');
    expect(link.to).toBe('/care/medications/manage');
  });

  it('has nothing to offer for a manual message', () => {
    expect(reviewLink(manual())).toBeNull();
  });
});

describe('primaryAction', () => {
  it('names the action by who it clears for', () => {
    expect(primaryAction(manual()).label).toBe('Dismiss');
    expect(primaryAction(manual({ ack_scope: 'per_user' })).label).toBe('Acknowledge');
  });

  it('offers nothing for a message that clears itself', () => {
    expect(primaryAction(lowMed({ dismissible: false }))).toBeNull();
  });
});
