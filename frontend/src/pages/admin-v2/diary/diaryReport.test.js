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
import { expect, it } from 'vitest';
import { diaryReport } from './diaryReport';

it('groups by source and absolute second across the repeated local hour, preserving each observation', () => {
  const at = '2026-11-01T01:30:00-04:00';
  const observation = { at, source: 'observation', label: 'Movement', question: 'Awake?' };
  const dose = { at, source: 'medication', label: 'Took medicine' };
  const entries = [
    { ...dose, id: 1, note: 'First dose' },
    { ...observation, id: 1, note: 'First movement', answer: 'Yes' },
    { ...dose, id: 2, at: '2026-11-01T05:30:00.999Z', note: 'Second dose' },
    { ...observation, id: 2, at: '2026-11-01T05:30:00.999Z', note: 'Second movement', answer: 'No' },
    { ...dose, id: 3, at: '2026-11-01T05:30:01Z' },
    { ...dose, id: 4, at: '2026-11-01T01:30:00-05:00' },
  ];
  const { rows } = diaryReport({}, { starts_at: at }, entries, 'America/New_York');
  expect(rows.map(row => row.items.map(item => item.entry))).toEqual([
    [entries[0], entries[2]], [entries[1], entries[3]], [entries[4]], [entries[5]],
  ]);
  expect(rows[1].items.map(item => item.followUp)).toEqual(['Awake? Yes', 'Awake? No']);
});
