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
// IntakeForm is the dialog-free body of IntakeSheet, so the live dashboard
// can host it inline in the docked side pane. The full behavior is covered
// by IntakeSheet.test.jsx; this asserts the inline contract.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import IntakeForm from './IntakeForm';
import { nutritionService } from '../../services/nutrition';

vi.mock('../../services/nutrition', () => ({
  nutritionService: {
    recent: vi.fn(() => Promise.resolve({ recent: [] })),
    listPresets: vi.fn(() => Promise.resolve([])),
    listItems: vi.fn(() => Promise.resolve([])),
    createIntakeEvent: vi.fn(() => Promise.resolve({ event_group_id: 'g', intakes: [{ id: 1 }] })),
    updateIntake: vi.fn(),
    createItem: vi.fn(),
    applyPreset: vi.fn(),
    lookupBarcode: vi.fn(),
  },
}));
vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: vi.fn(async () => ({ ok: false })),
}));

const patient = { id: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true, json: () => Promise.resolve({ nutrition: [] }),
  })));
});

describe('IntakeForm', () => {
  it('renders the whole form inline, with no dialog around it', async () => {
    render(<IntakeForm active patient={patient} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('form.em-form.nsheet')).toBeInTheDocument();
    expect(document.getElementById('intake-search')).toBeInTheDocument();
  });

  it('submits an intake event and reports back', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<IntakeForm active patient={patient} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(document.getElementById('intake-search'), { target: { value: 'Broth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add "Broth" manually' }));
    fireEvent.change(screen.getByLabelText('Amount of Broth'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log intake' }));

    await waitFor(() => expect(nutritionService.createIntakeEvent).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
