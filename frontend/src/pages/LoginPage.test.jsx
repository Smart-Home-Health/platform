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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

const auth = vi.hoisted(() => ({ current: {} }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth.current }));

beforeEach(() => {
  auth.current = {
    isAuthenticated: false, isAccountAuthenticated: false,
    haAccountAuth: true, skipAccountPassword: false,
    restoreHaAccount: vi.fn().mockResolvedValue(false),
    accountAccess: vi.fn(),
  };
});

describe('HA account recovery', () => {
  it('offers retry after a failed HA recovery without showing an account password', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not restore Home Assistant access');
    expect(screen.queryByLabelText('Account password')).not.toBeInTheDocument();
    expect(auth.current.accountAccess).not.toHaveBeenCalled();
    auth.current.restoreHaAccount.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(auth.current.restoreHaAccount).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the account password flow when extra authentication is enabled', () => {
    auth.current.haAccountAuth = false;
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.getByLabelText('Account password')).toBeInTheDocument();
    expect(auth.current.restoreHaAccount).not.toHaveBeenCalled();
  });
});
