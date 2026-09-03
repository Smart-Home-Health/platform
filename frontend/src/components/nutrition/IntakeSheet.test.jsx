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
// The intake sheet logs one feed as a LIST of items (formula + juices) in a
// single event, can link a hand-logged entry to a scheduled feed (marking it
// complete), and still applies presets as separate records server-side.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import IntakeSheet from './IntakeSheet';
import { nutritionService } from '../../services/nutrition';

vi.mock('../../services/nutrition', () => ({
  nutritionService: {
    recent: vi.fn(() => Promise.resolve({ recent: [] })),
    listPresets: vi.fn(() => Promise.resolve([])),
    listItems: vi.fn(() => Promise.resolve([])),
    createIntakeEvent: vi.fn(() => Promise.resolve({ event_group_id: 'g', intakes: [{ id: 1 }] })),
    updateIntake: vi.fn(() => Promise.resolve({ id: 1 })),
    createItem: vi.fn(() => Promise.resolve({ id: 9 })),
    applyPreset: vi.fn(() => Promise.resolve([{ id: 1 }, { id: 2 }])),
    lookupBarcode: vi.fn(() => Promise.resolve({ source: 'none', barcode: 'x' })),
  },
}));

vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: vi.fn(async () => ({ ok: false })),
}));

const patient = { id: 5, first_name: 'Test', last_name: 'Testerson' };

// The sheet fetches today's open scheduled feeds for the link picker.
const mockDaily = (nutrition = []) => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ nutrition }),
  })));
};

const setup = (props = {}) => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <IntakeSheet open patient={patient} onSaved={onSaved} onClose={onClose} {...props} />,
  );
  return { ...utils, onSaved, onClose };
};

const logButton = () => screen.getByRole('button', { name: /Log (intake|\d+ items)/ });

// Item search now lives in the full-screen picker.
const openPicker = () =>
  fireEvent.click(screen.getByRole('button', { name: /Add items|Add or remove items/ }));

// Add a free-text item row through the picker and fill it in. Manual entry
// commits and closes the picker, so the amount is edited on the form.
const addManualItem = (name = 'Water', amount = '120') => {
  openPicker();
  fireEvent.change(document.getElementById('intake-search'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: `Add "${name}" manually` }));
  fireEvent.change(screen.getByLabelText(`Amount of ${name}`), { target: { value: amount } });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDaily([]);
});

describe('IntakeSheet', () => {
  it('needs at least one valid item before it will save', () => {
    setup();
    expect(logButton()).toBeDisabled();
    addManualItem('Water', '120');
    expect(logButton()).not.toBeDisabled();
  });

  it('logs several items as ONE event, not one call per item', async () => {
    setup();
    addManualItem('Peptamen', '250');
    addManualItem('Green juice', '120');
    expect(screen.getByRole('button', { name: 'Log 2 items' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Log 2 items' }));

    await waitFor(() => expect(nutritionService.createIntakeEvent).toHaveBeenCalledTimes(1));
    const event = nutritionService.createIntakeEvent.mock.calls[0][0];
    expect(event.patient_id).toBe(5);
    expect(event.items).toHaveLength(2);
    expect(event.items.map((i) => i.item_name)).toEqual(['Peptamen', 'Green juice']);
    expect(event.items[1].amount).toBe(120);
  });

  it('sends tube-feed delivery detail only for a tube feed', async () => {
    setup();
    addManualItem('Peptamen', '250');
    // The manual row opens expanded; switch its type and set the route.
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'tube_feed' } });
    fireEvent.change(screen.getByLabelText('Route'), { target: { value: 'pump' } });
    fireEvent.change(document.querySelector('input[id$="-rate"]'), { target: { value: '125' } });
    fireEvent.click(logButton());

    await waitFor(() => expect(nutritionService.createIntakeEvent).toHaveBeenCalled());
    const item = nutritionService.createIntakeEvent.mock.calls[0][0].items[0];
    expect(item.item_type).toBe('tube_feed');
    expect(item.feed_route).toBe('pump');
  });

  it('adds a saved item from search with scaled nutrition', async () => {
    nutritionService.listItems.mockResolvedValue([{
      id: 3, name: 'Peptamen', item_type: 'tube_feed',
      default_amount: 250, default_amount_unit: 'ml', calories_per_unit: 1.5,
    }]);
    setup();
    openPicker();
    fireEvent.change(document.getElementById('intake-search'), { target: { value: 'pept' } });

    const result = await screen.findByText('Peptamen');
    fireEvent.click(result.closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /Done · 1 item/ }));

    // 250 * 1.5 kcal per ml, filled in without anyone doing the arithmetic
    // (shown on the row and summed in the card header).
    expect((await screen.findAllByText(/375 kcal/)).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(logButton());
    await waitFor(() => expect(nutritionService.createIntakeEvent).toHaveBeenCalled());
    const item = nutritionService.createIntakeEvent.mock.calls[0][0].items[0];
    expect(item.item_id).toBe(3);
    expect(item.calories).toBe(375);
  });

  it('rescales a saved item when the amount is adjusted', async () => {
    nutritionService.listItems.mockResolvedValue([{
      id: 3, name: 'Peptamen', item_type: 'tube_feed',
      default_amount: 250, default_amount_unit: 'ml', calories_per_unit: 1.5,
    }]);
    setup();
    openPicker();
    fireEvent.change(document.getElementById('intake-search'), { target: { value: 'pept' } });
    const result = await screen.findByText('Peptamen');
    fireEvent.click(result.closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /Done · 1 item/ }));

    fireEvent.change(screen.getByLabelText('Amount of Peptamen'), { target: { value: '100' } });
    expect((await screen.findAllByText(/150 kcal/)).length).toBeGreaterThanOrEqual(1);
  });

  it('links a hand-logged entry to a scheduled feed and prefills its mix', async () => {
    mockDaily([{
      schedule_id: 8,
      scheduled_time: '2026-08-29T15:30:00+00:00',
      name: 'Lunch',
      completed: false,
      is_prn: false,
      intake_type: 'intake',
      components: [
        { item_id: 1, item_name: 'Peptamen', item_type: 'tube_feed', amount: 240, amount_unit: 'ml', calories: 360 },
        { item_id: 2, item_name: 'Green juice', item_type: 'liquid', amount: 120, amount_unit: 'ml', calories: 84 },
      ],
    }]);
    const { onSaved } = setup();

    const chip = await screen.findByText(/Lunch ·/);
    fireEvent.click(chip.closest('button'));

    // The feed's expected mix lands as editable rows.
    expect(screen.getByText('Peptamen')).toBeInTheDocument();
    expect(screen.getByText('Green juice')).toBeInTheDocument();
    expect(screen.getByText(/Logging will mark it complete/)).toBeInTheDocument();

    // The target panel tracks the plan: prefilled = met, cut an amount and it
    // shows exactly what is missing (the spreadsheet's red cell).
    expect(screen.getByText('Target · Lunch')).toBeInTheDocument();
    expect(screen.getByText('444 / 444 kcal')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Amount of Peptamen'), { target: { value: '120' } });
    expect(screen.getByText('264 / 444 kcal')).toBeInTheDocument();
    expect(screen.getByText('180 kcal to go')).toBeInTheDocument();
    expect(screen.getByText('120 mL to go')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Amount of Peptamen'), { target: { value: '240' } });

    fireEvent.click(screen.getByRole('button', { name: 'Log 2 items' }));
    await waitFor(() => expect(nutritionService.createIntakeEvent).toHaveBeenCalled());
    const event = nutritionService.createIntakeEvent.mock.calls[0][0];
    expect(event.schedule_id).toBe(8);
    expect(event.scheduled_time).toBe('2026-08-29T15:30:00+00:00');
    expect(onSaved).toHaveBeenCalled();
  });

  it('opens pre-linked to a feed for the schedule pages\' Complete Now', async () => {
    const feed = {
      schedule_id: 8,
      scheduled_time: '2026-08-28T21:00:00+00:00', // yesterday — not in today's fetch
      name: 'Dinner',
      completed: false,
      is_prn: false,
      intake_type: 'intake',
      components: [],
      default_item: 'Peptamen', default_amount: 525, default_amount_unit: 'ml',
      default_calories: 525,
    };
    const { onSaved } = setup({ prefillFeed: feed });

    // The mix lands as editable rows, already linked.
    expect(screen.getByText('Complete Dinner')).toBeInTheDocument();
    expect(screen.getByText(/Logging will mark it complete/)).toBeInTheDocument();
    expect(screen.getByLabelText('Amount of Peptamen')).toHaveValue(525);

    fireEvent.click(logButton());
    await waitFor(() => expect(nutritionService.createIntakeEvent).toHaveBeenCalled());
    const event = nutritionService.createIntakeEvent.mock.calls[0][0];
    expect(event.schedule_id).toBe(8);
    expect(event.scheduled_time).toBe('2026-08-28T21:00:00+00:00');
    expect(onSaved).toHaveBeenCalled();
  });

  it('a pre-linked feed can still be unlinked from its chip', async () => {
    const feed = {
      schedule_id: 8, scheduled_time: '2026-08-28T21:00:00+00:00', name: 'Dinner',
      completed: false, is_prn: false, intake_type: 'intake', components: [],
      default_item: 'Peptamen', default_amount: 525, default_amount_unit: 'ml',
    };
    setup({ prefillFeed: feed });
    // The linked note repeats the "Dinner · time" text; the chip is the one
    // inside a button.
    const chips = await screen.findAllByText(/Dinner ·/);
    const chip = chips.map((el) => el.closest('button')).find(Boolean);
    fireEvent.click(chip);
    expect(screen.queryByText(/Logging will mark it complete/)).not.toBeInTheDocument();
  });

  it('unlinks when the feed chip is tapped again', async () => {
    mockDaily([{
      schedule_id: 8, scheduled_time: '2026-08-29T15:30:00+00:00', name: 'Lunch',
      completed: false, is_prn: false, intake_type: 'intake', components: [],
      default_item: 'Peptamen', default_amount: 240, default_amount_unit: 'ml',
    }]);
    setup();
    const chip = await screen.findByText(/Lunch ·/);
    fireEvent.click(chip.closest('button'));
    expect(screen.getByText(/Logging will mark it complete/)).toBeInTheDocument();
    fireEvent.click(chip.closest('button'));
    expect(screen.queryByText(/Logging will mark it complete/)).not.toBeInTheDocument();

    fireEvent.click(logButton());
    // Rows stayed (the prefill), but the link is gone.
    return waitFor(() => {
      const event = nutritionService.createIntakeEvent.mock.calls[0][0];
      expect(event.schedule_id).toBeUndefined();
    });
  });

  it('applies a preset as separate records rather than one event', async () => {
    nutritionService.listPresets.mockResolvedValueOnce([{
      id: 2, name: 'Peptamen 250 + flush',
      components: [{ id: 1 }, { id: 2 }],
    }]);
    const { onSaved } = setup();

    const chip = await screen.findByText('Peptamen 250 + flush');
    fireEvent.click(chip.closest('button'));

    await waitFor(() => expect(nutritionService.applyPreset).toHaveBeenCalled());
    const [presetId, body] = nutritionService.applyPreset.mock.calls[0];
    expect(presetId).toBe(2);
    expect(body.patient_id).toBe(5);
    // The expansion into one record per component is the server's job; the
    // sheet must not flatten it into an event of its own.
    expect(nutritionService.createIntakeEvent).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('adds a recent entry as an item row', async () => {
    nutritionService.recent.mockResolvedValueOnce({
      recent: [{ item_name: 'Water', item_type: 'liquid', amount: 120, amount_unit: 'ml' }],
    });
    setup();
    const chip = await screen.findByText(/Water · 120 ml/);
    fireEvent.click(chip.closest('button'));
    expect(screen.getByText('Water')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount of Water')).toHaveValue(120);
    expect(logButton()).not.toBeDisabled();
  });

  it('saves a reusable item with per-unit nutrition when asked', async () => {
    setup();
    addManualItem('Orange juice', '200');
    // The manual row opens expanded, with the facts inline.
    fireEvent.change(document.querySelector('input[id$="-cal"]'), { target: { value: '90' } });
    fireEvent.click(screen.getByText('Save as a reusable item'));
    fireEvent.click(logButton());

    await waitFor(() => expect(nutritionService.createItem).toHaveBeenCalled());
    const saved = nutritionService.createItem.mock.calls[0][0];
    expect(saved.name).toBe('Orange juice');
    // Stored per unit (90 kcal / 200 ml) so any future amount scales.
    expect(saved.calories_per_unit).toBeCloseTo(0.45);
  });

  it('updates rather than creates when editing', async () => {
    setup({
      editing: {
        id: 11, item_name: 'Water', item_type: 'liquid', amount: 120,
        amount_unit: 'ml', consumed_at: '2026-08-18T14:18:00Z',
      },
    });
    // Edit mode is single-row: no add affordances, no remove.
    expect(screen.queryByText(/manually/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Remove /)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(nutritionService.updateIntake).toHaveBeenCalled());
    const [id, payload] = nutritionService.updateIntake.mock.calls[0];
    expect(id).toBe(11);
    expect(payload.item_name).toBe('Water');
    expect(nutritionService.createIntakeEvent).not.toHaveBeenCalled();
  });

  it('passes the care-task log through when opened from a task', async () => {
    setup({ careTaskLogId: 77, careTaskName: 'Morning feed' });
    expect(screen.getByText(/Morning feed/)).toBeInTheDocument();
    addManualItem();
    fireEvent.click(logButton());
    await waitFor(() => expect(nutritionService.createIntakeEvent).toHaveBeenCalled());
    expect(nutritionService.createIntakeEvent.mock.calls[0][0].care_task_log_id).toBe(77);
  });
});
