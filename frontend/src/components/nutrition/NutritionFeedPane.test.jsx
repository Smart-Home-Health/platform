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
// The live dashboard's side pane completion form: a pending feed prefills
// its mix as editable rows and records WITH the adjusted items; a queued
// flush gets an adjustable amount with Run and Skip.
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NutritionFeedPane from './NutritionFeedPane';

vi.mock('../../services/nutrition', () => ({
  nutritionService: { listItems: vi.fn(() => Promise.resolve([])), lookupBarcode: vi.fn(), createItem: vi.fn() },
}));

const patient = { id: 5 };

const feedItem = (over = {}) => ({
  id: '8-2026-08-29T15:30:00+00:00',
  name: 'Lunch',
  extra: null,
  status: 'due_on_time',
  is_completed: false,
  scheduled_time: '2026-08-29T15:30:00+00:00',
  _raw: {
    schedule_id: 8,
    name: 'Lunch',
    schedule_type: 'meal',
    row_kind: 'schedule',
    components: [
      { item_id: 1, item_name: 'Peptamen', item_type: 'tube_feed', amount: 240, amount_unit: 'ml', calories: 360 },
      { item_id: 2, item_name: 'Green juice', item_type: 'liquid', amount: 120, amount_unit: 'ml', calories: 84 },
    ],
    flush_components: [{ item_name: 'Water', amount: 60, amount_unit: 'ml' }],
  },
  ...over,
});

const flushItem = () => ({
  id: 'flush-3',
  name: 'Lunch flush',
  status: 'due_on_time',
  is_completed: false,
  scheduled_time: '2026-08-29T16:22:00+00:00',
  _raw: {
    schedule_id: 8,
    row_kind: 'flush',
    followup_id: 3,
    default_amount: 60,
    default_amount_unit: 'ml',
  },
});

const setup = (item, props = {}) => {
  const onRecord = vi.fn();
  const onSkipFlush = vi.fn();
  render(
    <MemoryRouter>
      <NutritionFeedPane
        item={item}
        patient={patient}
        recordingAs="John Carty"
        onRecord={onRecord}
        onSkipFlush={onSkipFlush}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onRecord, onSkipFlush };
};

beforeEach(() => vi.clearAllMocks());

describe('NutritionFeedPane', () => {
  it('prefills the feed mix as editable rows and records with the adjusted items', () => {
    const { onRecord } = setup(feedItem());

    expect(screen.getByText('Peptamen')).toBeInTheDocument();
    expect(screen.getByText('Green juice')).toBeInTheDocument();
    // The flush hint says what happens after, without logging it now.
    expect(screen.getByText(/Water \(60 ml\) will be scheduled as a flush/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Amount of Green juice'), { target: { value: '90' } });
    fireEvent.change(document.getElementById('ldfeed-note'), { target: { value: 'smoothie day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark taken' }));

    expect(onRecord).toHaveBeenCalledTimes(1);
    const [item, opts] = onRecord.mock.calls[0];
    expect(item.name).toBe('Lunch');
    expect(opts.note).toBe('smoothie day');
    expect(opts.items.map((r) => [r.itemName, r.amount])).toEqual([
      ['Peptamen', '240'], ['Green juice', '90'],
    ]);
  });

  it('disables Mark taken until every row is valid', () => {
    setup(feedItem());
    fireEvent.change(screen.getByLabelText('Amount of Peptamen'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Mark taken' })).toBeDisabled();
  });

  it('runs or skips a queued flush with an adjustable amount', () => {
    const { onRecord, onSkipFlush } = setup(flushItem());

    const amount = document.getElementById('ldfeed-flush-amount');
    expect(amount).toHaveValue(60);
    fireEvent.change(amount, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run flush' }));
    expect(onRecord).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Lunch flush' }),
      expect.objectContaining({ amount: 45 }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    expect(onSkipFlush).toHaveBeenCalled();
  });

  it('uses its own note id so it cannot collide with the meds pane', () => {
    setup(feedItem());
    expect(document.getElementById('ldfeed-note')).toBeInTheDocument();
    expect(document.getElementById('ld-dose-note')).toBeNull();
  });
});
