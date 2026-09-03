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
// Forced first-login password reset: client-side checks surface inline, and
// a good submission calls resetPassword with the carried-through password.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PasswordResetPage from './PasswordResetPage';

const auth = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  isAuthenticated: false,
  isAccountAuthenticated: true,
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));

const renderPage = (state = { userId: 7, fullName: 'Ada Lovelace', currentPassword: 'oldpassword1' }) => render(
  <MemoryRouter initialEntries={[{ pathname: '/first-login', state }]}>
    <Routes>
      <Route path="/first-login" element={<PasswordResetPage />} />
      <Route path="/care" element={<div>care home</div>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  auth.resetPassword.mockReset();
  auth.resetPassword.mockResolvedValue({ success: true });
});

describe('PasswordResetPage', () => {
  it('greets the user and hides the current-password field when it was carried through', () => {
    renderPage();
    expect(screen.getByText(/Welcome, Ada Lovelace/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).toBeNull();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('flags a mismatch inline without calling the API', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different1' } });
    fireEvent.submit(document.querySelector('form'));
    expect(screen.getByText('New passwords do not match')).toHaveClass('au-error');
    expect(auth.resetPassword).not.toHaveBeenCalled();
  });

  it('resets with the carried password and moves on', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpassword1' } });
    fireEvent.submit(document.querySelector('form'));
    await waitFor(() => expect(auth.resetPassword).toHaveBeenCalledWith(7, 'oldpassword1', 'newpassword1', null));
    expect(await screen.findByText('care home')).toBeInTheDocument();
  });
});
