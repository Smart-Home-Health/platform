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
// The directory shell and its create/filter dialogs after moving off shadcn.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('../AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../components/HAIdentitiesCard', () => ({ default: () => null }));

const { authCtx } = vi.hoisted(() => ({
  authCtx: { user: { id: 1, is_system_admin: true, permissions: [] } },
}));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/care/configuration/patients' }),
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}));
vi.mock('../../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: (...args) => fetch(...args),
  API_BASE_URL: '',
  isIngress: () => false,
}));

import AdminV2Directory from './AdminV2Directory';

const PATIENTS = [
  { id: 5, first_name: 'Eli', last_name: 'Carty', is_active: true },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('/api/patients')) {
      return { ok: true, status: 200, json: async () => PATIENTS };
    }
    return { ok: true, status: 200, json: async () => [] };
  }));
});

describe('directory on the vc chassis', () => {
  it('renders rows, stats and toolbar without shadcn or a .tw island', async () => {
    await act(async () => { render(<AdminV2Directory />); });
    expect(document.querySelector('.tw')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
    expect(document.querySelector('.cfg .cp-stats')).toBeInTheDocument();
    expect(document.querySelector('.dir-search .em-input')).toBeInTheDocument();
    expect(screen.getByText('Eli Carty')).toBeInTheDocument();
  });

  it('opens the create dialog and the filter sheet as EntityModals', async () => {
    await act(async () => { render(<AdminV2Directory />); });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Add/ })); });
    expect(document.querySelector('.em-panel')).toBeInTheDocument();
    expect(screen.getByLabelText(/First Name/)).toHaveClass('em-input');
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
    // Close it, then open the filter sheet.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Filter/ })); });
    expect(document.querySelector('.em-panel .em-select-wrap select')).toBeTruthy();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
  });
});
