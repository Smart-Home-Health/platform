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
// The intake sheet adapts to the type being logged, prefills from saved items
// and recent entries, and — for presets — logs each component as its own
// record rather than one combined blob.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import IntakeSheet from './IntakeSheet';
import { nutritionService } from '../../services/nutrition';

vi.mock('../../services/nutrition', () => ({
  nutritionService: {
    recent: vi.fn(() => Promise.resolve({ recent: [] })),
    listPresets: vi.fn(() => Promise.resolve([])),
    listItems: vi.fn(() => Promise.resolve([])),
    createIntake: vi.fn(() => Promise.resolve({ id: 1 })),
    updateIntake: vi.fn(() => Promise.resolve({ id: 1 })),
    createItem: vi.fn(() => Promise.resolve({ id: 9 })),
    applyPreset: vi.fn(() => Promise.resolve([{ id: 1 }, { id: 2 }])),
  },
}));

const patient = { id: 5, first_name: 'Test', last_name: 'Testerson' };

const setup = (props = {}) => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <IntakeSheet open patient={patient} onSaved={onSaved} onClose={onClose} {...props} />,
  );
  return { ...utils, onSaved, onClose };
};

// The sheet title also reads "Log intake", and "Amount unit" collides with a
// loose /^Amount/ label match — so address these by role and id.
const logButton = () => screen.getByRole('button', { name: 'Log intake' });
const amountInput = () => document.getElementById('intake-amount');
const fillBasics = (name = 'Water', amount = '120') => {
  fireEvent.change(document.getElementById('intake-item'), { target: { value: name } });
  fireEvent.change(amountInput(), { target: { value: amount } });
};

beforeEach(() => vi.clearAllMocks());

describe('IntakeSheet', () => {
  it('needs an item and an amount before it will save', () => {
    setup();
    expect(logButton()).toBeDisabled();
    fireEvent.change(document.getElementById('intake-item'), { target: { value: 'Water' } });
    expect(logButton()).toBeDisabled();
    fireEvent.change(amountInput(), { target: { value: '120' } });
    expect(logButton()).not.toBeDisabled();
  });

  it('does not offer Supplement as both a type and a context', () => {
    setup();
    // It is an intake type...
    expect(screen.getByRole('radio', { name: 'Supplement' })).toBeInTheDocument();
    // ...and must not also appear among the meal-context chips.
    const contextChips = screen.getAllByRole('button')
      .filter((b) => ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Other'].includes(b.textContent));
    expect(contextChips).toHaveLength(5);
  });

  it('shows tube-feed delivery fields only for a tube feed', () => {
    setup();
    expect(screen.queryByText('Route')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Tube feed' }));
    expect(screen.getByText('Route')).toBeInTheDocument();
    expect(screen.getByText('Rate (mL/hr)')).toBeInTheDocument();
    // The item field reframes itself for a feed.
    expect(screen.getByText('Formula')).toBeInTheDocument();
  });

  it('switches units to ones that suit the type', () => {
    setup();
    expect(screen.getByLabelText('Amount unit')).toHaveValue('ml');
    fireEvent.click(screen.getByRole('radio', { name: 'Food' }));
    expect(screen.getByLabelText('Amount unit')).toHaveValue('grams');
  });

  it('logs a tube feed with its delivery detail', async () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Tube feed' }));
    fireEvent.change(document.getElementById('intake-item'), { target: { value: 'Peptamen' } });
    fireEvent.change(amountInput(), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Pump' }));
    fireEvent.change(document.getElementById('intake-rate'), { target: { value: '125' } });
    fireEvent.click(logButton());

    await waitFor(() => expect(nutritionService.createIntake).toHaveBeenCalled());
    const [patientId, payload] = nutritionService.createIntake.mock.calls[0];
    expect(patientId).toBe(5);
    expect(payload.item_type).toBe('tube_feed');
    expect(payload.feed_route).toBe('pump');
    expect(payload.rate_ml_per_hr).toBe(125);
  });

  it('does not send delivery detail for a non-feed', async () => {
    setup();
    fillBasics();
    fireEvent.click(logButton());
    await waitFor(() => expect(nutritionService.createIntake).toHaveBeenCalled());
    const payload = nutritionService.createIntake.mock.calls[0][1];
    expect(payload.feed_route).toBeNull();
    expect(payload.rate_ml_per_hr).toBeNull();
  });

  it('prefills and scales nutrition from a saved item', async () => {
    nutritionService.listItems.mockResolvedValueOnce([{
      id: 3, name: 'Peptamen', item_type: 'tube_feed',
      default_amount: 250, default_amount_unit: 'ml', calories_per_unit: 1.5,
    }]);
    setup();
    fireEvent.change(document.getElementById('intake-search'), { target: { value: 'pept' } });

    const result = await screen.findByText('Peptamen');
    fireEvent.click(result.closest('button'));

    // 250 * 1.5 kcal per ml, filled in without anyone doing the arithmetic.
    fireEvent.click(screen.getByText('Nutrition details'));
    await waitFor(() => expect(document.getElementById('intake-cal')).toHaveValue(375));
  });

  it('leaves barcode scanning visibly unavailable', () => {
    setup();
    expect(screen.getByLabelText(/Scan a barcode/)).toBeDisabled();
  });

  it('applies a preset as separate records rather than one row', async () => {
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
    // sheet must not flatten it into a single createIntake call.
    expect(nutritionService.createIntake).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('prefills from a recent entry', async () => {
    nutritionService.recent.mockResolvedValueOnce({
      recent: [{ item_name: 'Water', item_type: 'liquid', amount: 120, amount_unit: 'ml' }],
    });
    setup();
    const chip = await screen.findByText(/Water · 120 ml/);
    fireEvent.click(chip.closest('button'));
    expect(document.getElementById('intake-item')).toHaveValue('Water');
    expect(amountInput()).toHaveValue(120);
  });

  it('keeps time and context on Save + another', async () => {
    const { onClose, onSaved } = setup();
    fireEvent.click(screen.getByText('Lunch'));
    fillBasics();
    fireEvent.click(screen.getByText('Save + another'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    // Same meal, next item.
    expect(screen.getByText('Lunch').closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(document.getElementById('intake-item')).toHaveValue('');
  });

  it('saves a reusable item with per-unit nutrition when asked', async () => {
    setup();
    fillBasics('Orange juice', '200');
    fireEvent.click(screen.getByText('Nutrition details'));
    fireEvent.change(document.getElementById('intake-cal'), { target: { value: '90' } });
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
    expect(screen.queryByText('Save + another')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(nutritionService.updateIntake).toHaveBeenCalled());
    expect(nutritionService.updateIntake.mock.calls[0][0]).toBe(11);
    expect(nutritionService.createIntake).not.toHaveBeenCalled();
  });

  it('passes the care-task log through when opened from a task', async () => {
    setup({ careTaskLogId: 77, careTaskName: 'Morning feed' });
    expect(screen.getByText(/Morning feed/)).toBeInTheDocument();
    fillBasics();
    fireEvent.click(logButton());
    await waitFor(() => expect(nutritionService.createIntake).toHaveBeenCalled());
    expect(nutritionService.createIntake.mock.calls[0][1].care_task_log_id).toBe(77);
  });
});
