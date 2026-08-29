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
// The item sheet takes label facts PER SERVING and stores them per unit, so
// logging any amount scales without arithmetic. The barcode field leads the
// form: the wedge scanner types the code + Enter, which fires the lookup and
// fills the sheet from the library or OpenFoodFacts.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ItemSheet from './ItemSheet';
import { nutritionService } from '../../services/nutrition';

vi.mock('../../services/nutrition', () => ({
  nutritionService: {
    createItem: vi.fn(() => Promise.resolve({ id: 9 })),
    updateItem: vi.fn(() => Promise.resolve({ id: 9 })),
    lookupBarcode: vi.fn(() => Promise.resolve({ source: 'none', barcode: 'x' })),
  },
}));

const patient = { id: 5 };

const setup = (props = {}) => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ItemSheet open patient={patient} onSaved={onSaved} onClose={onClose} {...props} />,
  );
  return { ...utils, onSaved, onClose };
};

beforeEach(() => vi.clearAllMocks());

// The wedge scanner types the digits and terminates with Enter.
const wedgeScan = (code) => {
  const input = document.getElementById('item-barcode');
  fireEvent.change(input, { target: { value: code } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

describe('ItemSheet', () => {
  it('stores label facts per unit, divided by the serving size', async () => {
    setup();
    fireEvent.change(document.getElementById('item-name'), { target: { value: 'Green juice' } });
    fireEvent.change(document.getElementById('item-serving'), { target: { value: '240' } });
    fireEvent.change(document.getElementById('item-calories'), { target: { value: '140' } });
    fireEvent.change(document.getElementById('item-protein'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => expect(nutritionService.createItem).toHaveBeenCalled());
    const payload = nutritionService.createItem.mock.calls[0][0];
    expect(payload.patient_id).toBe(5);
    expect(payload.name).toBe('Green juice');
    expect(payload.default_amount).toBe(240);
    expect(payload.default_amount_unit).toBe('ml');
    // 140 kcal / 240 ml — logging 100 ml later reads 58.3 kcal on its own.
    expect(payload.calories_per_unit).toBeCloseTo(0.5833);
    expect(payload.protein_per_unit).toBeCloseTo(0.0083);
  });

  it('shows stored per-unit facts back as per-serving when editing', () => {
    setup({
      editing: {
        id: 3, name: 'Peptamen', item_type: 'tube_feed',
        default_amount: 250, default_amount_unit: 'ml',
        calories_per_unit: 1.5, protein_per_unit: 0.04,
      },
    });
    // 1.5/ml over the 250 ml serving reads as the label's 375.
    expect(document.getElementById('item-calories')).toHaveValue(375);
    expect(document.getElementById('item-protein')).toHaveValue(10);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    return waitFor(() => {
      const [id, payload] = nutritionService.updateItem.mock.calls[0];
      expect(id).toBe(3);
      // Round-trips back to the same per-unit values.
      expect(payload.calories_per_unit).toBeCloseTo(1.5);
      expect(payload.protein_per_unit).toBeCloseTo(0.04);
    });
  });

  it('prefills from an OpenFoodFacts scan without wiping typed fields', async () => {
    nutritionService.lookupBarcode.mockResolvedValue({
      source: 'openfoodfacts',
      barcode: '082592011480',
      suggestion: {
        name: 'Rainbow Machine', brand: 'Naked', item_type: 'liquid',
        default_amount: 450, default_amount_unit: 'ml',
        calories_per_unit: 0.51, barcode: '082592011480',
      },
    });
    setup();
    fireEvent.change(document.getElementById('item-name'), { target: { value: 'My name' } });
    wedgeScan('082592011480');

    await waitFor(() => expect(document.getElementById('item-barcode')).toHaveValue('082592011480'));
    // Typed name survives; blank fields fill from the product.
    expect(document.getElementById('item-name')).toHaveValue('My name');
    expect(document.getElementById('item-brand')).toHaveValue('Naked');
    expect(document.getElementById('item-serving')).toHaveValue(450);
    expect(document.getElementById('item-calories')).toHaveValue(229.5);
  });

  it('looks a scanned code up even when the scanner sends no terminator', async () => {
    setup();
    // Digits land, no Enter — some wedges terminate with Tab or nothing.
    fireEvent.change(document.getElementById('item-barcode'), {
      target: { value: '082592720153' },
    });
    await waitFor(() => expect(nutritionService.lookupBarcode).toHaveBeenCalledWith('082592720153', 5));
  });

  it('warns when the scanned code is already in the library', async () => {
    nutritionService.lookupBarcode.mockResolvedValue({
      source: 'library',
      barcode: '082592011480',
      item: { id: 7, name: 'Naked Green Machine' },
    });
    setup();
    wedgeScan('082592011480');

    await waitFor(() => expect(
      screen.getByText(/already saved as "Naked Green Machine"/),
    ).toBeInTheDocument());
  });
});
