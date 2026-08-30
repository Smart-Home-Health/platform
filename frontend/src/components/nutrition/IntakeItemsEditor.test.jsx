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
// Finding items now lives in the full-screen picker: search, barcode, and
// manual entry add to a pending selection (chips), and Done hands the rows
// to the form for configuring. The barcode flow keeps its contract: saved
// items win, unknown codes fall through to OpenFoodFacts as a save-able
// suggestion, and a miss reads as "enter manually" rather than an error.
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import IntakeItemsEditor from './IntakeItemsEditor';
import { nutritionService } from '../../services/nutrition';

vi.mock('../../services/nutrition', () => ({
  nutritionService: {
    listItems: vi.fn(() => Promise.resolve([])),
    recent: vi.fn(() => Promise.resolve({ recent: [] })),
    createItem: vi.fn(() => Promise.resolve({ id: 42, name: 'Naked Green Machine', item_type: 'liquid', default_amount: 100, default_amount_unit: 'ml', calories_per_unit: 0.53 })),
    lookupBarcode: vi.fn(),
  },
}));

const patient = { id: 5 };

function Harness(props) {
  const [items, setItems] = useState([]);
  return <IntakeItemsEditor patient={patient} items={items} onChange={setItems} {...props} />;
}

const openPicker = () =>
  fireEvent.click(screen.getByRole('button', { name: /Add items|Add or remove items/ }));

const doneButton = () => screen.getByRole('button', { name: /Done · \d+ items?/ });

const scanACode = async (code = '082592720153') => {
  openPicker();
  fireEvent.click(screen.getByLabelText('Scan a barcode'));
  const input = screen.getByLabelText('Barcode');
  fireEvent.change(input, { target: { value: code } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

beforeEach(() => vi.clearAllMocks());

describe('IntakeItemsEditor picker flow', () => {
  it('adds a saved library item on a barcode hit and configures it after Done', async () => {
    nutritionService.lookupBarcode.mockResolvedValue({
      source: 'library',
      barcode: '082592720153',
      item: {
        id: 7, name: 'Naked Green Machine', item_type: 'liquid',
        default_amount: 450, default_amount_unit: 'ml', calories_per_unit: 0.53,
      },
    });
    render(<Harness />);
    await scanACode();

    // The scan lands as a removable chip in the pending selection.
    await waitFor(() => expect(screen.getByText(/Naked Green Machine · 450 ml/)).toBeInTheDocument());
    expect(nutritionService.lookupBarcode).toHaveBeenCalledWith('082592720153', 5);

    // Done returns to the form, where the amount is editable and the scaled
    // calories (450 * 0.53 ≈ 238.5) show on the row and in the card header.
    fireEvent.click(doneButton());
    expect(screen.getByLabelText('Amount of Naked Green Machine')).toHaveValue(450);
    expect(screen.getAllByText(/238.5 kcal/).length).toBeGreaterThanOrEqual(1);
  });

  it('turns an OpenFoodFacts suggestion into a row flagged for saving', async () => {
    nutritionService.lookupBarcode.mockResolvedValue({
      source: 'openfoodfacts',
      barcode: '082592720153',
      suggestion: {
        name: 'Green Machine', brand: 'Naked', item_type: 'liquid',
        default_amount: 240, default_amount_unit: 'ml',
        calories_per_unit: 0.53, barcode: '082592720153',
      },
    });
    render(<Harness />);
    await scanACode();

    await waitFor(() => expect(screen.getByText(/Green Machine · 240 ml/)).toBeInTheDocument());
    expect(screen.getByText(/will be saved for next time/)).toBeInTheDocument();
    // Nothing hits the library yet — saving happens when the intake is logged.
    expect(nutritionService.createItem).not.toHaveBeenCalled();
  });

  it('saves the suggestion immediately when rows must be library items', async () => {
    nutritionService.lookupBarcode.mockResolvedValue({
      source: 'openfoodfacts',
      barcode: '082592720153',
      suggestion: {
        name: 'Naked Green Machine', item_type: 'liquid',
        default_amount: 100, default_amount_unit: 'ml',
        calories_per_unit: 0.53, barcode: '082592720153',
      },
    });
    render(<Harness requireSavedItem showFacts={false} />);
    await scanACode();

    // A schedule component needs a real item_id, so the item is created now,
    // with its barcode, and the row references it.
    await waitFor(() => expect(nutritionService.createItem).toHaveBeenCalled());
    expect(nutritionService.createItem.mock.calls[0][0].barcode).toBe('082592720153');
    await waitFor(() => expect(screen.getByText(/Naked Green Machine/)).toBeInTheDocument());
  });

  it('reads a miss as "enter manually", not an error', async () => {
    nutritionService.lookupBarcode.mockResolvedValue({ source: 'none', barcode: '082592720153' });
    render(<Harness />);
    await scanACode();

    await waitFor(() => expect(screen.getByText(/No match for barcode/)).toBeInTheDocument());
    fireEvent.click(doneButton());
    expect(document.querySelectorAll('.nitems-row')).toHaveLength(0);
  });

  it('survives a lookup failure (offline hub)', async () => {
    nutritionService.lookupBarcode.mockRejectedValue(new Error('network'));
    render(<Harness />);
    await scanACode();

    await waitFor(() => expect(screen.getByText(/Barcode lookup failed/)).toBeInTheDocument());
  });

  it('offers built-in Water without a library item, and creates one on pick', async () => {
    nutritionService.listItems.mockResolvedValue([]);
    render(<Harness />);
    openPicker();
    fireEvent.change(screen.getByPlaceholderText('Search saved items'), { target: { value: 'wat' } });

    const offer = await screen.findByText(/built-in · counts toward fluids/);
    fireEvent.click(offer.closest('button'));

    // Picking it materializes the real library item (a schedule component
    // needs an item id) with zero facts, and adds it to the selection.
    await waitFor(() => expect(nutritionService.createItem).toHaveBeenCalled());
    const created = nutritionService.createItem.mock.calls[0][0];
    expect(created.name).toBe('Water');
    expect(created.calories_per_unit).toBe(0);
    await waitFor(() => expect(screen.getByText(/Naked Green Machine/)).toBeInTheDocument());
  });

  it('steps aside when the library already has a Water', async () => {
    nutritionService.listItems.mockResolvedValue([{
      id: 5, name: 'Water', item_type: 'liquid',
      default_amount: 60, default_amount_unit: 'ml', calories_per_unit: 0,
    }]);
    render(<Harness />);
    openPicker();
    fireEvent.change(screen.getByPlaceholderText('Search saved items'), { target: { value: 'water' } });

    // The built-in offer may flash while the debounced search runs; once the
    // library's own Water lands, the offer must be gone.
    await waitFor(() => {
      expect(screen.getByText('Water')).toBeInTheDocument();
      expect(screen.queryByText(/built-in · counts toward fluids/)).not.toBeInTheDocument();
    });
  });

  it('cancel discards what the picker session added', async () => {
    nutritionService.lookupBarcode.mockResolvedValue({
      source: 'library',
      barcode: '082592720153',
      item: { id: 7, name: 'Naked Green Machine', item_type: 'liquid', default_amount: 450, default_amount_unit: 'ml' },
    });
    render(<Harness />);
    await scanACode();
    await waitFor(() => expect(screen.getByText(/Naked Green Machine · 450 ml/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.querySelectorAll('.nitems-row')).toHaveLength(0);
  });

  it('adds a manual row and opens it for configuring on the form', async () => {
    render(<Harness />);
    openPicker();
    fireEvent.change(screen.getByPlaceholderText('Search saved items'), { target: { value: 'Broth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add "Broth" manually' }));

    // Manual entry commits immediately — configure on the form, not in the
    // picker — with the row expanded (its editable name field is visible).
    expect(screen.getByLabelText('Amount of Broth')).toBeInTheDocument();
    expect(screen.getByLabelText('Item name')).toHaveValue('Broth');
  });

  it('one-tap adds a recent combo with its last-logged amount', async () => {
    nutritionService.recent.mockResolvedValue({
      recent: [{ item_name: 'Mighty Mango', item_type: 'liquid', amount: 123, amount_unit: 'ml' }],
    });
    render(<Harness />);
    openPicker();

    const row = await screen.findByText('Mighty Mango');
    fireEvent.click(row.closest('button'));
    await waitFor(() => expect(screen.getByText(/Mighty Mango · 123 ml/)).toBeInTheDocument());

    fireEvent.click(doneButton());
    expect(screen.getByLabelText('Amount of Mighty Mango')).toHaveValue(123);
  });

  it('removes a row', async () => {
    nutritionService.lookupBarcode.mockResolvedValue({
      source: 'library',
      barcode: '082592720153',
      item: { id: 7, name: 'Naked Green Machine', item_type: 'liquid', default_amount: 450, default_amount_unit: 'ml' },
    });
    render(<Harness />);
    await scanACode();
    await waitFor(() => expect(screen.getByText(/Naked Green Machine · 450 ml/)).toBeInTheDocument());
    fireEvent.click(doneButton());

    fireEvent.click(screen.getByLabelText('Remove Naked Green Machine'));
    expect(screen.queryByText('Naked Green Machine')).not.toBeInTheDocument();
  });
});
