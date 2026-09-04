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
// UpdateQuantityModal: the low-stock hard gate. Submit PUTs the new quantity
// and hands control back to the caller; the backend error lands in em-error.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../config', () => ({ default: { apiUrl: '' } }));

import UpdateQuantityModal from './UpdateQuantityModal';

const jsonResponse = (body, status = 200) => ({
  ok: status < 400, status, json: async () => body,
});

const INFO = {
  medication_id: 12,
  medication_name: 'Baclofen',
  current_quantity: 1,
  quantity_unit: 'tablet',
  requested_dose: 2,
};

const setup = (props = {}) => {
  const onClose = vi.fn();
  const onUpdated = vi.fn();
  render(<UpdateQuantityModal info={INFO} onClose={onClose} onUpdated={onUpdated} {...props} />);
  return { onClose, onUpdated };
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('UpdateQuantityModal', () => {
  it('explains the shortfall and offers no way to administer anyway', () => {
    setup();
    expect(screen.getByRole('dialog')).toHaveTextContent('Out of Stock — Baclofen');
    expect(screen.getByRole('alert')).toHaveTextContent('Only 1 tablet on hand');
    expect(screen.getByRole('alert')).toHaveTextContent('needs 2 tablet');
    // Only the dialog's close icon, cancel and the gated continue: no
    // "administer anyway" escape hatch.
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label') || b.textContent))
      .toEqual(['Close', 'Cancel', 'Update & Continue']);
    expect(screen.getByRole('button', { name: 'Update & Continue' })).toBeDisabled();
  });

  it('requires a quantity greater than zero', () => {
    setup();
    const input = screen.getByLabelText(/New on-hand quantity/);
    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Update & Continue' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '30' } });
    expect(screen.getByRole('button', { name: 'Update & Continue' })).toBeEnabled();
  });

  it('PUTs the new quantity and lets the caller retry the administration', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 12, quantity: 30 }));
    const { onClose, onUpdated } = setup();

    fireEvent.change(screen.getByLabelText(/New on-hand quantity/), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update & Continue' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    // The caller retries and decides when to unmount; the gate never self-closes.
    expect(onClose).not.toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/medications/12');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ quantity: 30 });
  });

  it('submits on Enter', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const { onUpdated } = setup();
    const input = screen.getByLabelText(/New on-hand quantity/);
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it('surfaces the backend detail in em-error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Quantity locked by pharmacy' }, 409));
    const { onUpdated } = setup();

    fireEvent.change(screen.getByLabelText(/New on-hand quantity/), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update & Continue' }));

    const err = await screen.findByText('Quantity locked by pharmacy');
    expect(err).toHaveClass('em-error');
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('falls back to the status code when the error body has no detail', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('no body'); } });
    setup();
    fireEvent.change(screen.getByLabelText(/New on-hand quantity/), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update & Continue' }));
    expect(await screen.findByText('Failed to update quantity (500)')).toHaveClass('em-error');
  });

  it('cancel aborts the administration', () => {
    const { onClose, onUpdated } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
