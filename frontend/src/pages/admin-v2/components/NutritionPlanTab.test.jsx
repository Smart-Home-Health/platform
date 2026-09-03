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

// What a stored UTC hour reads as on the runner's clock today.
const localStamp = (utcHour, utcMinute) => {
  const d = new Date();
  d.setUTCHours(utcHour, utcMinute, 0, 0);
  const h = d.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
};

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

  it('tucks the schedules behind a summary row and lists them in the sheet', () => {
    const { onEditSchedule } = setup();
    // The tab itself stays compact — the list is behind one flat row.
    expect(screen.queryByText('Morning Peptamen')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /1 active/ }));
    expect(screen.getByText('Morning Peptamen')).toBeInTheDocument();
    // The stored cron is UTC ('0 7 * * *'); the row must read local.
    expect(
      screen.getByText(new RegExp(`Daily · ${localStamp(7, 0)}`)),
    ).toBeInTheDocument();

    // Tapping the row edits it.
    fireEvent.click(screen.getByText('Morning Peptamen'));
    expect(onEditSchedule).toHaveBeenCalled();
  });

  it('keeps a paused schedule reachable on the Inactive tab', () => {
    setup({
      plan: plan({
        schedules: [{
          id: 2, name: 'Old feed', schedule_type: 'meal', cron_expression: '0 9 * * *',
          is_active: false, daily: { occurrences: 1 },
        }],
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: /0 active · 1 paused/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Inactive · 1/ }));
    expect(screen.getByText('Old feed')).toBeInTheDocument();
    // Resume rides the row.
    expect(screen.getByLabelText('Resume Old feed')).toBeInTheDocument();
  });

  it('pauses and deletes from the sheet rows', () => {
    const { onToggleSchedule, onDeleteSchedule } = setup();
    fireEvent.click(screen.getByRole('button', { name: /1 active/ }));
    fireEvent.click(screen.getByLabelText('Pause Morning Peptamen'));
    expect(onToggleSchedule).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Delete Morning Peptamen'));
    expect(onDeleteSchedule).toHaveBeenCalled();
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
  it('reads back the forms the schedule builder produces, in local time', () => {
    // Stored crons are UTC; the label converts to the runner's timezone
    // (pinned America/New_York), so expectations are computed, not literal.
    expect(describeCron('0 7 * * *')).toBe(`Daily · ${localStamp(7, 0)}`);
    expect(describeCron('30 12 * * *')).toBe(`Daily · ${localStamp(12, 30)}`);
    expect(describeCron('0 0 * * *')).toBe(`Daily · ${localStamp(0, 0)}`);
    // 07:00 UTC stays on the same local day in America/New_York, so the
    // day names hold.
    expect(describeCron('0 7 * * 1,3,5')).toBe(`Mon, Wed, Fri · ${localStamp(7, 0)}`);
    // A full week of days is just daily.
    expect(describeCron('0 7 * * 0,1,2,3,4,5,6')).toBe(`Daily · ${localStamp(7, 0)}`);
    expect(describeCron('0 */4 * * *')).toBe('Daily · every 4h');
    expect(describeCron(null)).toBe('Not scheduled');
    // Anything unrecognised comes back as-is rather than being guessed at.
    expect(describeCron('weird')).toBe('weird');
  });
});
