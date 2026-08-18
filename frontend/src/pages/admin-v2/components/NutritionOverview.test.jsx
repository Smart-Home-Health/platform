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
// The overview's numbers, especially the ones that have to be honest about
// what they do and do not measure.
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NutritionOverview from './NutritionOverview';

const FLUID_TYPES = new Set(['liquid', 'tube_feed', 'hydration']);

const intakeToMl = (i) => (FLUID_TYPES.has(i.item_type) && i.amount ? Number(i.amount) : 0);
const outputToMl = (o) => {
  if (!o.amount) return 0;
  const unit = (o.amount_unit || 'ml').toLowerCase();
  if (unit === 'oz') return Number(o.amount) * 29.5735;
  return Number(o.amount);
};

const setup = (props = {}) => {
  const onLogIntake = vi.fn();
  const onViewOutput = vi.fn();
  const utils = render(
    <NutritionOverview
      selectedDate={new Date('2026-08-18T12:00:00')}
      onPrevDay={vi.fn()}
      onNextDay={vi.fn()}
      onGoToToday={vi.fn()}
      onPickDate={vi.fn()}
      formatDateForApi={() => '2026-08-18'}
      formatDisplayDate={() => 'Wed · Aug 18, 2026'}
      isToday={() => true}
      intakes={[]}
      outputs={[]}
      currentGoal={null}
      loading={false}
      onLogIntake={onLogIntake}
      onLogOutput={vi.fn()}
      onEditIntake={vi.fn()}
      onEditOutput={vi.fn()}
      canCreate
      intakeToMl={intakeToMl}
      outputToMl={outputToMl}
      formatTimeShort={(t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      onViewOutput={onViewOutput}
      {...props}
    />,
  );
  return { ...utils, onLogIntake, onViewOutput };
};

const intake = (over = {}) => ({
  id: 1, item_name: 'Water', item_type: 'liquid', amount: 300, amount_unit: 'ml',
  consumed_at: '2026-08-18T12:10:00Z', ...over,
});
const output = (over = {}) => ({
  id: 1, output_type: 'urine', occurred_at: '2026-08-18T08:15:00Z',
  location: 'restroom', ...over,
});

describe('NutritionOverview', () => {
  it('counts a tube feed toward fluids', () => {
    // tube_feed was missing from the page's own fluid set, so a 525 mL feed
    // contributed nothing to the day's total.
    setup({ intakes: [intake({ id: 2, item_name: 'Peptamen', item_type: 'tube_feed', amount: 525 })] });
    const glance = screen.getByText('Fluids').closest('.novw-stat');
    expect(within(glance).getByText(/525/)).toBeInTheDocument();
  });

  it('says what the fluid balance leaves out', () => {
    // A wet diaper carries no volume, so it cannot appear in a balance. The
    // number stays honest by naming what it excludes.
    setup({
      intakes: [intake({ amount: 1000 })],
      outputs: [
        output({ id: 1, amount: 400, amount_unit: 'ml', location: 'catheter' }),
        output({ id: 2, event_group_id: 'g1', location: 'diaper', is_diaper: true, diaper_wetness: 'wet' }),
        output({ id: 3, event_group_id: 'g2', location: 'diaper', is_diaper: true, diaper_wetness: 'soaked' }),
      ],
    });
    expect(screen.getByText('+600 mL')).toBeInTheDocument();
    expect(screen.getByText(/Excludes 2 unmeasured diaper events/)).toBeInTheDocument();
  });

  it('drops the caveat when everything was measured', () => {
    setup({
      intakes: [intake({ amount: 500 })],
      outputs: [output({ amount: 200, amount_unit: 'ml' })],
    });
    expect(screen.getByText('+300 mL')).toBeInTheDocument();
    expect(screen.queryByText(/Excludes/)).not.toBeInTheDocument();
  });

  it('shows a negative balance as negative', () => {
    setup({
      intakes: [intake({ amount: 100 })],
      outputs: [output({ amount: 400, amount_unit: 'ml' })],
    });
    expect(screen.getByText('−300 mL')).toBeInTheDocument();
  });

  it('counts one mixed event once, not twice', () => {
    setup({
      outputs: [
        output({ id: 1, output_type: 'urine', event_group_id: 'g1', location: 'diaper', is_diaper: true }),
        output({ id: 2, output_type: 'bowel', event_group_id: 'g1', location: 'diaper', is_diaper: true }),
      ],
    });
    const diapers = screen.getByText('Diaper events').closest('.novw-outcell');
    expect(within(diapers).getByText('1')).toBeInTheDocument();
    // ...but it is still one bowel movement and one void underneath.
    const bowel = screen.getByText('Bowel events').closest('.novw-outcell');
    expect(within(bowel).getByText('1')).toBeInTheDocument();
  });

  it('reports concerns rather than interpreting them', () => {
    setup({ outputs: [output({ has_blood: true, straining: true })] });
    expect(screen.getByText(/Blood · Straining recorded today/)).toBeInTheDocument();
  });

  it('says so plainly when there are none', () => {
    setup({ outputs: [output()] });
    expect(screen.getByText('No concerns recorded today')).toBeInTheDocument();
  });

  it('only shows progress bars once a goal exists', () => {
    const { rerender } = setup({ intakes: [intake()] });
    expect(screen.queryByText('Intake progress')).not.toBeInTheDocument();

    rerender(
      <NutritionOverview
        selectedDate={new Date('2026-08-18T12:00:00')}
        onPrevDay={vi.fn()} onNextDay={vi.fn()} onGoToToday={vi.fn()} onPickDate={vi.fn()}
        formatDateForApi={() => '2026-08-18'} formatDisplayDate={() => 'Wed'} isToday={() => true}
        intakes={[intake({ amount: 855 })]} outputs={[]}
        currentGoal={{ total_fluid_ml_target: 1710 }}
        loading={false}
        onLogIntake={vi.fn()} onLogOutput={vi.fn()} onEditIntake={vi.fn()} onEditOutput={vi.fn()}
        canCreate intakeToMl={intakeToMl} outputToMl={outputToMl}
        formatTimeShort={() => '12:10 PM'}
      />,
    );
    expect(screen.getByText('Intake progress')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('filters the timeline and collapses long days', () => {
    const intakes = Array.from({ length: 6 }, (_, n) => intake({
      id: n + 1, item_name: `Item ${n + 1}`, consumed_at: `2026-08-18T0${n + 1}:00:00Z`,
    }));
    setup({ intakes, outputs: [output({ id: 99 })] });

    // Preview caps the list until asked for the rest.
    expect(screen.getByText('Show all 7 entries')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show all 7 entries'));
    expect(screen.getByText('Show fewer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Output' }));
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  });

  it('opens a timeline entry for editing', () => {
    const onEditIntake = vi.fn();
    setup({ intakes: [intake()], onEditIntake });
    fireEvent.click(screen.getByText('Water'));
    expect(onEditIntake).toHaveBeenCalled();
  });

  it('links through to the output tab', () => {
    const { onViewOutput } = setup({ outputs: [output()] });
    fireEvent.click(screen.getByText('View output'));
    expect(onViewOutput).toHaveBeenCalled();
  });
});
