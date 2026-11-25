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
import { diaryTimeFormat } from './diaryTime';

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
  const full = diaryTimeFormat('America/New_York');
  const clock = diaryTimeFormat('America/New_York', false);
  expect(rows.map(row => row.time)).toEqual([full, clock, clock, full].map((format, i) =>
    format.format(new Date(rows[i].at))));
});

it('shows the date on the first row of each local hour, including after midnight and a day without entries', () => {
  const entries = [
    '2026-11-24T17:55:11Z', // 23:40 in Kathmandu
    '2026-11-24T18:01:02Z', // 23:46, across a UTC hour boundary
    '2026-11-24T18:15:00Z', // local midnight
    '2026-11-26T18:15:00Z', // same hour on a later date
  ].map((at, id) => ({ at, id, source: 'observation', label: 'Movement' }));
  const zone = 'Asia/Kathmandu';
  const { rows } = diaryReport({}, { starts_at: entries[0].at }, entries, zone);
  const clock = { timeZone: zone, hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' };
  const full = { ...clock, year: 'numeric', month: 'short', day: 'numeric' };
  expect(rows.map(row => row.time)).toEqual(entries.map(({ at }, i) =>
    new Intl.DateTimeFormat(undefined, i === 1 ? clock : full).format(new Date(at))));
});

it('keeps a preset named Custom observation when it shares a row with a free-text entry', () => {
  const at = '2026-11-23T15:00:00Z';
  const preset = { id: 1, at, source: 'observation', label: 'Custom observation', is_custom: false };
  const custom = { ...preset, id: 2, is_custom: true, note: 'Trach change' };
  const { rows } = diaryReport({}, { starts_at: at }, [preset, custom], 'UTC');
  expect(rows).toHaveLength(1);
  expect(rows[0].items.map(item => item.showLabel)).toEqual([true, false]);
});
