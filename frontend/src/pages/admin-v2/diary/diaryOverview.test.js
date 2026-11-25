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
import { diaryOverview } from './diaryOverview';

it('separates the two local 1 AM hours and leaves unmeasured quarters blank', () => {
  const start = '2026-11-01T05:00:00Z', through = '2026-11-01T06:00:00Z';
  const stats = { low: 92, avg: 95, high: 98 };
  const { svg } = diaryOverview({ start, through, categories: { observation: [start, through], alerts: [], vitals: [] },
    signals: [start, through].map(at => ({ at, spo2: stats, bpm: null })) }, 'America/New_York');
  const figure = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(figure.documentElement.textContent).toContain('01:00 EDT');
  expect(figure.documentElement.textContent).toContain('01:00 EST');
  expect(figure.documentElement.textContent).toContain('No valid readings');
  expect(figure.querySelectorAll('circle')).toHaveLength(6); // two isolated bins for each line
  const marks = figure.querySelector('path[fill="#264f5c"]').getAttribute('d');
  expect(marks.match(/M/g)).toHaveLength(2);
  expect(figure.documentElement.textContent.match(/Not included/g)).toHaveLength(4);
});

it('handles a single flat quarter at the saturation ceiling', () => {
  const at = '2026-11-23T04:11:00Z';
  const { svg } = diaryOverview({ start: at, through: at, categories: { alerts: [] },
    signals: [{ at, spo2: { low: 100, avg: 100, high: 100 }, bpm: null }] }, 'UTC');
  expect(svg).not.toMatch(/NaN|Infinity/);
});
