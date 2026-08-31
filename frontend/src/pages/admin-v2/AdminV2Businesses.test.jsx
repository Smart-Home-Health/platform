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
// The Add Business dialog's type picker: a compact EmMultiSelect dropdown of
// checkboxes instead of thirteen full-width check rows.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { authCtx } = vi.hoisted(() => ({
  authCtx: { user: { id: 1, is_system_admin: true, permissions: [] } },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch: (...a) => fetch(...a) }));

import AdminV2Businesses from './AdminV2Businesses';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('/api/businesses/types')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    return { ok: true, status: 200, json: async () => [] };
  }));
});

describe('AdminV2Businesses add dialog', () => {
  it('picks business types from a dropdown of checkboxes', async () => {
    await act(async () => { render(<AdminV2Businesses />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Add business/i })); });

    const trigger = screen.getByLabelText(/Business types/);
    expect(trigger).toHaveTextContent('Select types…');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Closed by default: no checkbox rows on screen.
    expect(screen.queryByRole('checkbox', { name: 'PHARMACY' })).not.toBeInTheDocument();

    await act(async () => { fireEvent.click(trigger); });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'PHARMACY' })); });
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'DME' })); });

    // The trigger summarises the selection.
    expect(trigger).toHaveTextContent('PHARMACY, DME');

    // Escape closes the popover without touching the dialog.
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(screen.queryByRole('checkbox', { name: 'PHARMACY' })).not.toBeInTheDocument();
    expect(screen.getByText('Add business', { selector: '.em-title' })).toBeInTheDocument();
  });
});
