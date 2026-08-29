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
// The schedule sheet leads with whether a schedule produces an intake record,
// and owns the local-to-UTC cron conversion.
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ScheduleSheet from './ScheduleSheet';

const setup = (props = {}) => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ScheduleSheet open onSave={onSave} onClose={onClose} {...props} />,
  );
  return { ...utils, onSave, onClose };
};

const nameIt = (value = 'Morning feed') =>
  fireEvent.change(document.getElementById('sched-name'), { target: { value } });
const saveButton = () => screen.getByRole('button', { name: /Add schedule|Save changes/ });

beforeEach(() => vi.clearAllMocks());

describe('ScheduleSheet', () => {
  it('needs a name before it will save', () => {
    setup();
    expect(saveButton()).toBeDisabled();
    nameIt();
    expect(saveButton()).not.toBeDisabled();
  });

  it('hides the intake defaults for a care activity', () => {
    setup();
    // A nutrition schedule prefills what gets logged...
    expect(screen.getByText('Defaults when logged')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Care activity' }));
    // ...a diaper check produces no intake record, so there is nothing to
    // prefill and the fields go away rather than collecting dead numbers.
    expect(screen.queryByText('Defaults when logged')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Diaper check' })).toBeInTheDocument();
  });

  it('sends no amounts for a care activity', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Care activity' }));
    nameIt('Diaper check');
    fireEvent.click(saveButton());

    const payload = onSave.mock.calls[0][0];
    expect(payload.schedule_type).toBe('diaper_check');
    expect(payload.default_amount).toBeNull();
    expect(payload.default_calories).toBeNull();
    expect(payload.default_item_name).toBeNull();
    expect(payload.components).toEqual([]);
  });

  it('edits a schedule with a feed mix and sends the whole component list', () => {
    const { onSave } = setup({
      editing: {
        id: 8,
        schedule_type: 'meal',
        name: 'Lunch',
        cron_expression: '30 15 * * *',
        components: [
          { id: 1, item_id: 11, item_name: 'Peptamen', item_type: 'tube_feed', amount: 240, amount_unit: 'ml', sort_order: 0, calories_per_unit: 1.5 },
          { id: 2, item_id: 12, item_name: 'Green juice', item_type: 'liquid', amount: 120, amount_unit: 'ml', sort_order: 1, calories_per_unit: 0.7 },
        ],
      },
    });

    // The mix prefills as rows, and the legacy single-default card gives way.
    expect(screen.getByText('Feed mix')).toBeInTheDocument();
    expect(screen.getByText('Peptamen')).toBeInTheDocument();
    expect(screen.queryByText('Defaults when logged')).not.toBeInTheDocument();

    // Adjust one amount, then save: the payload carries the whole list.
    fireEvent.change(screen.getByLabelText('Amount of Green juice'), { target: { value: '150' } });
    fireEvent.click(saveButton());

    const payload = onSave.mock.calls[0][0];
    expect(payload.components).toEqual([
      expect.objectContaining({ item_id: 11, amount: 240, amount_unit: 'ml', sort_order: 0 }),
      expect.objectContaining({ item_id: 12, amount: 150, amount_unit: 'ml', sort_order: 1 }),
    ]);
  });

  it('builds a daily cron from the chosen time', () => {
    const { onSave } = setup();
    nameIt();
    fireEvent.change(document.getElementById('sched-time'), { target: { value: '07:00' } });
    fireEvent.click(saveButton());

    const cron = onSave.mock.calls[0][0].cron_expression;
    // Stored in UTC, so only the shape is asserted here — the offset is the
    // timezone helper's job.
    expect(cron).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it('will not save a weekly schedule with no days', () => {
    const { onSave } = setup();
    nameIt();
    fireEvent.click(screen.getByRole('radio', { name: 'Weekly' }));
    // The default weekday selection is there; clearing it should block save.
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach((d) => {
      fireEvent.click(screen.getByRole('button', { name: d }));
    });
    expect(saveButton()).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('builds a weekly cron with a day list', () => {
    const { onSave } = setup();
    nameIt();
    fireEvent.click(screen.getByRole('radio', { name: 'Weekly' }));
    fireEvent.click(saveButton());
    expect(onSave.mock.calls[0][0].cron_expression).toMatch(/^\d+ \d+ \* \* [\d,]+$/);
  });

  it('builds a monthly cron on the chosen day', () => {
    const { onSave } = setup();
    nameIt();
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
    fireEvent.change(document.getElementById('sched-dom'), { target: { value: '15' } });
    fireEvent.click(saveButton());
    expect(onSave.mock.calls[0][0].cron_expression).toMatch(/^\d+ \d+ 15 \* \*$/);
  });

  it('reads an existing schedule back into the form', () => {
    setup({
      editing: {
        id: 1, name: 'Morning Peptamen', schedule_type: 'meal',
        cron_expression: '0 12 * * *', default_amount: 525,
        default_amount_unit: 'ml', default_calories: 525, is_active: true,
      },
    });
    expect(document.getElementById('sched-name')).toHaveValue('Morning Peptamen');
    expect(document.getElementById('sched-amount')).toHaveValue(525);
    expect(screen.getByRole('radio', { name: 'Meal' })).toHaveAttribute('aria-checked', 'true');
    // Pausing is only offered on something that already exists.
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('offers pausing only when editing', () => {
    setup();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('says which units count toward the fluid target', () => {
    // Coverage decides fluid by the unit, which is not obvious from the form.
    setup();
    expect(screen.getByText(/count toward the fluid target/)).toBeInTheDocument();
  });
});
