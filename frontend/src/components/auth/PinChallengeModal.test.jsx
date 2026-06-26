/*
 * Smart Home Health Hub
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
// Wave 4 — PIN challenge modal: user picker -> PIN/password -> selectUser. The
// auth context is mocked; ModalBase renders for real.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PinChallengeModal from './PinChallengeModal';

const getAccountUsers = vi.fn();
const selectUser = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ getAccountUsers, selectUser }),
}));

const onSuccess = vi.fn();
const onCancel = vi.fn();

const renderModal = (open = true) =>
  render(<PinChallengeModal open={open} onSuccess={onSuccess} onCancel={onCancel} />);

beforeEach(() => {
  getAccountUsers.mockReset().mockResolvedValue([
    { id: 1, full_name: 'Claude', has_pin: true },
  ]);
  selectUser.mockReset().mockResolvedValue({ success: true });
  onSuccess.mockReset();
  onCancel.mockReset();
});

const pinInput = () => document.querySelector('input[type="password"]');

describe('PinChallengeModal', () => {
  it('renders nothing when closed', () => {
    renderModal(false);
    expect(screen.queryByText('Verify Caregiver')).not.toBeInTheDocument();
    expect(getAccountUsers).not.toHaveBeenCalled();
  });

  it('loads and lists the account users', async () => {
    renderModal();
    expect(await screen.findByText('Claude')).toBeInTheDocument();
    expect(getAccountUsers).toHaveBeenCalled();
  });

  it('shows an empty state when there are no users', async () => {
    getAccountUsers.mockResolvedValue([]);
    renderModal();
    expect(await screen.findByText('No active users available.')).toBeInTheDocument();
  });

  it('verifies with a PIN and fires onSuccess', async () => {
    renderModal();
    fireEvent.click(await screen.findByText('Claude'));
    fireEvent.change(pinInput(), { target: { value: '1234' } });
    await act(async () => { fireEvent.click(screen.getByText('Verify')); });

    expect(selectUser).toHaveBeenCalledWith(1, '1234', null);
    expect(onSuccess).toHaveBeenCalled();
  });

  it('requires a password for a user without a PIN', async () => {
    getAccountUsers.mockResolvedValue([{ id: 2, full_name: 'NoPin', has_pin: false }]);
    renderModal();
    fireEvent.click(await screen.findByText('NoPin'));
    expect(screen.getByText('Password')).toBeInTheDocument(); // password label, not PIN
    fireEvent.change(pinInput(), { target: { value: 'secret' } });
    await act(async () => { fireEvent.click(screen.getByText('Verify')); });

    expect(selectUser).toHaveBeenCalledWith(2, null, 'secret');
  });

  it('switches to password entry when the backend reports requiresPassword', async () => {
    selectUser.mockResolvedValue({ success: false, requiresPassword: true });
    renderModal();
    fireEvent.click(await screen.findByText('Claude'));
    fireEvent.change(pinInput(), { target: { value: '1234' } });
    await act(async () => { fireEvent.click(screen.getByText('Verify')); });

    expect(await screen.findByText('Password')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces an authentication error', async () => {
    selectUser.mockResolvedValue({ success: false, error: 'Invalid PIN' });
    renderModal();
    fireEvent.click(await screen.findByText('Claude'));
    fireEvent.change(pinInput(), { target: { value: '0000' } });
    await act(async () => { fireEvent.click(screen.getByText('Verify')); });

    expect(await screen.findByText('Invalid PIN')).toBeInTheDocument();
  });

  it('cancels from the picker', async () => {
    renderModal();
    await screen.findByText('Claude');
    fireEvent.click(screen.getByText('×')); // ModalBase close
    expect(onCancel).toHaveBeenCalled();
  });
});
