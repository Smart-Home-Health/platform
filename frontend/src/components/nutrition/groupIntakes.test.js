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
import { groupIntakeEvents, intakeEventLabel } from './groupIntakes';

const row = (over = {}) => ({
  id: 1,
  item_name: 'Peptamen',
  item_type: 'tube_feed',
  amount: 250,
  amount_unit: 'ml',
  calories: 375,
  consumed_at: '2026-08-29T15:30:00+00:00',
  event_group_id: null,
  ...over,
});

describe('groupIntakeEvents', () => {
  it('groups rows sharing an event_group_id into one event', () => {
    const events = groupIntakeEvents([
      row({ id: 1, event_group_id: 'g1' }),
      row({ id: 2, event_group_id: 'g1', item_name: 'Green juice', item_type: 'liquid', amount: 120, calories: 84 }),
      row({ id: 3, event_group_id: 'g2', consumed_at: '2026-08-29T12:00:00+00:00' }),
    ]);
    expect(events).toHaveLength(2);
    expect(events[0].key).toBe('g1'); // newest first
    expect(events[0].isMerged).toBe(true);
    expect(events[0].members).toHaveLength(2);
    expect(intakeEventLabel(events[0])).toBe('Feed (2 items)');
  });

  it('sums calories and fluid across the event, fluid by the unit', () => {
    const [event] = groupIntakeEvents([
      row({ id: 1, event_group_id: 'g1' }),                       // 250 ml tube feed
      row({ id: 2, event_group_id: 'g1', item_name: 'Applesauce', item_type: 'food', amount: 100, amount_unit: 'grams', calories: 60 }),
    ]);
    expect(event.totalCalories).toBe(435);
    expect(event.totalFluidMl).toBe(250); // grams of food add no fluid
  });

  it('lets rows from before event_group_id stand alone', () => {
    const events = groupIntakeEvents([row({ id: 4 }), row({ id: 5 })]);
    expect(events).toHaveLength(2);
    expect(events.every((e) => !e.isMerged)).toBe(true);
    expect(intakeEventLabel(events[0])).toBe('Peptamen');
  });
});
