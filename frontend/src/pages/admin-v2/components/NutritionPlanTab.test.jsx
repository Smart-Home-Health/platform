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
// The plan view puts targets next to what is scheduled to meet them, which is
// the whole reason Manage and Goals stopped being separate pages.
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NutritionPlanTab from './NutritionPlanTab';
import { describeCron } from './cronLabel';

const plan = (over = {}) => ({
  goal: {
    id: 1, water_ml_target: 1710, calories_target: 1575,
    effective_date: '2026-04-01T00:00:00Z',
  },
  coverage: [
    { key: 'fluids', unit: 'mL', scheduled: 1710, goal: 1710, percent: 100,
      shortfall: 0, covered: true, daily_events: 5 },
    { key: 'calories', unit: 'kcal', scheduled: 1575, goal: 1575, percent: 100,
      shortfall: 0, covered: true, daily_events: 3 },
  ],
  schedules: [{
    id: 1, name: 'Morning Peptamen', schedule_type: 'tube_feed',
    cron_expression: '0 7 * * *', default_amount: 525, default_amount_unit: 'ml',
    default_calories: 525, is_active: true,
    daily: { occurrences: 1, fluid_ml: 525, calories: 525 },
  }],
  basis: 'scheduled',
  ...over,
});

const setup = (props = {}) => {
  const handlers = {
    onEditGoal: vi.fn(), onViewGoalHistory: vi.fn(), onAddSchedule: vi.fn(),
    onEditSchedule: vi.fn(), onToggleSchedule: vi.fn(), onDeleteSchedule: vi.fn(),
  };
  const utils = render(
    <NutritionPlanTab
      plan={plan()}
      loading={false}
      canCreate canUpdate canDelete
      formatDate={(d) => new Date(d).toLocaleDateString('en-US')}
      {...handlers}
      {...props}
    />,
  );
  return { ...utils, ...handlers };
};

describe('NutritionPlanTab', () => {
  it('shows targets and what is scheduled against them', () => {
    setup();
    expect(screen.getByText('Targets')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getAllByText(/1,710/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Covered')).toHaveLength(2);
  });

  it('names the shortfall rather than just showing a short bar', () => {
    setup({
      plan: plan({
        coverage: [
          { key: 'fluids', unit: 'mL', scheduled: 525, goal: 1710, percent: 30.7,
            shortfall: 1185, covered: false, daily_events: 1 },
        ],
      }),
    });
    expect(screen.getByText('1,185 mL short')).toBeInTheDocument();
  });

  it('says coverage is about the plan, not the record', () => {
    // The distinction between scheduled and logged is the one thing this view
    // could most easily be misread on.
    setup();
    expect(
      screen.getByText('Coverage reflects scheduled amounts, not logged intake.'),
    ).toBeInTheDocument();
  });

  it('handles having no targets set without pretending otherwise', () => {
    setup({ plan: plan({ goal: null }) });
    expect(screen.getByText(/No targets set/)).toBeInTheDocument();
    // Nothing to measure against, so no coverage card at all.
    expect(screen.queryByText('Coverage')).not.toBeInTheDocument();
  });

  it('renders a schedule as a card with a readable cadence', () => {
    setup();
    expect(screen.getByText('Morning Peptamen')).toBeInTheDocument();
    expect(screen.getByText('Daily · 7:00 AM')).toBeInTheDocument();
  });

  it('marks a paused schedule instead of hiding it', () => {
    setup({
      plan: plan({
        schedules: [{
          id: 2, name: 'Old feed', schedule_type: 'meal', cron_expression: '0 9 * * *',
          is_active: false, daily: { occurrences: 1 },
        }],
      }),
    });
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('opens goal history and goal editing from Targets', () => {
    const { onViewGoalHistory, onEditGoal } = setup();
    fireEvent.click(screen.getByText('History'));
    expect(onViewGoalHistory).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Edit'));
    expect(onEditGoal).toHaveBeenCalled();
  });

  it('hides the write actions without permission', () => {
    setup({ canCreate: false, canUpdate: false, canDelete: false });
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Add schedule')).not.toBeInTheDocument();
    // Reading the plan is still fine.
    expect(screen.getByText('History')).toBeInTheDocument();
  });
});

describe('describeCron', () => {
  it('reads back the forms the schedule builder produces', () => {
    expect(describeCron('0 7 * * *')).toBe('Daily · 7:00 AM');
    expect(describeCron('30 12 * * *')).toBe('Daily · 12:30 PM');
    expect(describeCron('0 0 * * *')).toBe('Daily · 12:00 AM');
    expect(describeCron('0 7 * * 1,3,5')).toBe('Mon, Wed, Fri · 7:00 AM');
    // A full week of days is just daily.
    expect(describeCron('0 7 * * 0,1,2,3,4,5,6')).toBe('Daily · 7:00 AM');
    expect(describeCron('0 */4 * * *')).toBe('Daily · every 4h');
    expect(describeCron(null)).toBe('Not scheduled');
    // Anything unrecognised comes back as-is rather than being guessed at.
    expect(describeCron('weird')).toBe('weird');
  });
});
