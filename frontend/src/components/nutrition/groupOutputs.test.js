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
import { groupOutputEvents, eventLabel, eventConcerns, eventLocation } from './groupOutputs';

const row = (over = {}) => ({
  id: 1, output_type: 'urine', occurred_at: '2026-08-18T14:18:00Z',
  is_diaper: false, ...over,
});

describe('groupOutputEvents', () => {
  it('puts the rows of one event back together', () => {
    const events = groupOutputEvents([
      row({ id: 1, output_type: 'urine', event_group_id: 'g1' }),
      row({ id: 2, output_type: 'bowel', event_group_id: 'g1' }),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].isMerged).toBe(true);
    expect(events[0].members.map((m) => m.id)).toEqual([1, 2]);
  });

  it('groups a restroom event, not just diapers', () => {
    // The old time-window logic only ever merged diaper rows, so this case
    // always rendered as two separate entries.
    const events = groupOutputEvents([
      row({ id: 1, output_type: 'urine', event_group_id: 'g1', location: 'restroom' }),
      row({ id: 2, output_type: 'bowel', event_group_id: 'g1', location: 'restroom' }),
    ]);
    expect(events).toHaveLength(1);
    expect(eventLabel(events[0])).toBe('Mixed restroom (urine + stool)');
  });

  it('does not merge unrelated rows that happen to be close in time', () => {
    // Two separate events a minute apart used to collapse into one.
    const events = groupOutputEvents([
      row({ id: 1, event_group_id: 'g1', occurred_at: '2026-08-18T14:18:00Z' }),
      row({ id: 2, event_group_id: 'g2', occurred_at: '2026-08-18T14:19:00Z' }),
    ]);
    expect(events).toHaveLength(2);
  });

  it('leaves pre-column rows standing alone', () => {
    const events = groupOutputEvents([row({ id: 1 }), row({ id: 2 })]);
    expect(events).toHaveLength(2);
    expect(events.every((e) => !e.isMerged)).toBe(true);
  });

  it('orders events newest first', () => {
    const events = groupOutputEvents([
      row({ id: 1, event_group_id: 'a', occurred_at: '2026-08-18T10:00:00Z' }),
      row({ id: 2, event_group_id: 'b', occurred_at: '2026-08-18T16:00:00Z' }),
    ]);
    expect(events.map((e) => e.members[0].id)).toEqual([2, 1]);
  });

  it('reads location from the column or the legacy booleans', () => {
    expect(eventLocation({ location: 'catheter' })).toBe('catheter');
    expect(eventLocation({ is_diaper: true })).toBe('diaper');
    expect(eventLocation({})).toBe('restroom');
  });

  it('collects concerns from anywhere in the event', () => {
    const events = groupOutputEvents([
      row({ id: 1, event_group_id: 'g1', has_blood: true }),
      row({ id: 2, output_type: 'bowel', event_group_id: 'g1', straining: true }),
    ]);
    expect(eventConcerns(events[0])).toEqual(['Blood', 'Straining']);
  });
});
