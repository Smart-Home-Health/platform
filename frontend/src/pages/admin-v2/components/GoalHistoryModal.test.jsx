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
// Goals are effective-dated, so their history is real and worth showing.
// Schedules are not, which is why none appear here.
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GoalHistoryModal from './GoalHistoryModal';

const goal = (id, date, fluids, calories, over = {}) => ({
  id, effective_date: date, water_ml_target: fluids, calories_target: calories, ...over,
});

const VERSIONS = [
  goal(1, '2025-10-01T00:00:00Z', 1500, 1450, { end_date: '2025-12-31T00:00:00Z' }),
  goal(2, '2026-01-01T00:00:00Z', 1600, 1500, { end_date: '2026-03-31T00:00:00Z' }),
  goal(3, '2026-04-01T00:00:00Z', 1710, 1575),
];

const setup = (goals = VERSIONS) => render(
  <GoalHistoryModal
    open
    onOpenChange={vi.fn()}
    goals={goals}
    formatDate={(d) => new Date(d).toLocaleDateString('en-US')}
  />,
);

describe('GoalHistoryModal', () => {
  it('lists every version newest first and tags the live one', () => {
    setup();
    const tags = screen.getAllByText('Current');
    expect(tags).toHaveLength(1);
    // The open-ended version is the current one.
    expect(screen.getByText(/present/)).toBeInTheDocument();
    // One per version row; the chart caption reads "Fluids (mL)".
    expect(screen.getAllByText('Fluids')).toHaveLength(3);
  });

  it('makes clear that setting new targets does not overwrite the old ones', () => {
    setup();
    expect(screen.getByText(/never overwrites the previous version/)).toBeInTheDocument();
  });

  it('draws a step per version, held flat until superseded', () => {
    setup();
    // A target holds its value until replaced, so each version is a flat run
    // with a dashed riser between — not a slope implying gradual change.
    const dots = document.querySelectorAll('.nplan-chart-dot');
    expect(dots.length).toBe(6); // 3 versions x 2 series
    const risers = document.querySelectorAll('.nplan-chart-riser');
    expect(risers.length).toBe(4); // 2 transitions x 2 series
  });

  it('charts only the series that have values', () => {
    setup([goal(1, '2026-01-01T00:00:00Z', 1500, null)]);
    const captions = [...document.querySelectorAll('figcaption')].map((c) => c.textContent);
    expect(captions).toEqual(['Fluids (mL)']);
  });

  it('copes with a single version', () => {
    setup([goal(1, '2026-04-01T00:00:00Z', 1710, 1575)]);
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(document.querySelectorAll('.nplan-chart-riser')).toHaveLength(0);
  });

  it('says so when no targets were ever set', () => {
    setup([]);
    expect(screen.getByText(/No targets have been set/)).toBeInTheDocument();
  });

  it('shows no schedule history, because none exists', () => {
    // nutrition_schedules has no effective dating — implying a past schedule
    // state here would be inventing clinical history.
    setup();
    expect(screen.queryByText(/schedules active/i)).not.toBeInTheDocument();
  });
});
