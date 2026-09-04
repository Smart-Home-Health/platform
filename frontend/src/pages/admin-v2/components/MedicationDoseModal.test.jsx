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
// MedicationDoseModal: prefill from the first schedule, submit payload with
// the Given At converted to UTC, and the backend error surfaced in em-error.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../config', () => ({ default: { apiUrl: '' } }));

import MedicationDoseModal from './MedicationDoseModal';

const jsonResponse = (body, status = 200) => ({
  ok: status < 400, status, json: async () => body,
});

const PATIENT = { id: 5 };
const MED = {
  id: 12,
  name: 'Baclofen',
  instructions: 'Give with food',
  quantity_unit: 'tablet',
  schedules: [{ dose_amount: 2, dose_unit: 'mg' }],
};

const setup = (props = {}) => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <MedicationDoseModal
      open
      onClose={onClose}
      onSaved={onSaved}
      patient={PATIENT}
      medication={MED}
      defaultDateTime="2026-09-04T08:00"
      {...props}
    />,
  );
  return { onClose, onSaved };
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('MedicationDoseModal', () => {
  it('prefills the dose from the first schedule and shows the instructions', () => {
    setup();
    expect(screen.getByRole('dialog')).toHaveTextContent('Record Dose — Baclofen');
    expect(screen.getByLabelText(/Dose Amount/)).toHaveValue(2);
    expect(screen.getByText('mg')).toBeInTheDocument();
    expect(screen.getByText('Give with food')).toBeInTheDocument();
    expect(screen.getByLabelText(/Given At/)).toHaveValue('2026-09-04T08:00');
  });

  it('falls back to the medication unit and disables submit until a dose is entered', () => {
    setup({ medication: { ...MED, schedules: [], instructions: null } });
    expect(screen.getByLabelText(/Dose Amount/)).toHaveValue(null);
    expect(screen.getByText('tablet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record Administration' })).toBeDisabled();
  });

  it('posts an ad-hoc administration with Given At converted to UTC', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    const { onClose, onSaved } = setup();

    fireEvent.change(screen.getByLabelText(/Dose Amount/), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: 'PRN for spasm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Administration' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/medications/12/administer');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    // Tests run pinned to America/New_York; 08:00 EDT is 12:00Z.
    expect(JSON.parse(init.body)).toEqual({
      patient_id: 5,
      dose_amount: 2.5,
      notes: 'PRN for spasm',
      administered_at: '2026-09-04T12:00:00.000Z',
    });
  });

  it('surfaces the backend detail in em-error and keeps the modal open', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Medication is inactive' }, 400));
    const { onClose, onSaved } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Record Administration' }));

    const err = await screen.findByText('Medication is inactive');
    expect(err).toHaveClass('em-error');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Record Administration' })).toBeEnabled();
  });

  it('closes via the cancel button', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
