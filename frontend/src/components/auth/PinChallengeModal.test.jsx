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
// Wave 4 — PIN challenge modal: user picker -> PIN/password -> selectUser. The
// auth context is mocked; ModalBase renders for real.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

const passwordInput = () => document.querySelector('input[type="password"]');
// PIN mode has no text field: digits come from the on-screen pad (or a
// hardware keyboard, see below).
const tapPin = (digits) => {
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }));
};

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
    expect(document.querySelector('input')).toBeNull(); // no typeable field, nothing to autofill
    tapPin('1234');
    expect(screen.getByTestId('pc-pin-slots')).toHaveAttribute('aria-label', 'PIN: 4 of 8 digits entered');
    await act(async () => { fireEvent.click(screen.getByText('Verify')); });

    expect(selectUser).toHaveBeenCalledWith(1, '1234', null);
    expect(onSuccess).toHaveBeenCalled();
  });

  it('takes digits, Backspace and Enter from a hardware keyboard', async () => {
    renderModal();
    fireEvent.click(await screen.findByText('Claude'));
    for (const k of ['1', '2', '3', '5', 'Backspace', '4']) fireEvent.keyDown(document, { key: k });
    expect(screen.getByTestId('pc-pin-slots')).toHaveAttribute('aria-label', 'PIN: 4 of 8 digits entered');
    await act(async () => { fireEvent.keyDown(document, { key: 'Enter' }); });
    expect(selectUser).toHaveBeenCalledWith(1, '1234', null);
  });

  it('will not verify fewer than 4 digits, and caps at 8', async () => {
    renderModal();
    fireEvent.click(await screen.findByText('Claude'));
    tapPin('123');
    expect(screen.getByText('Verify')).toBeDisabled();
    tapPin('456789');
    expect(screen.getByTestId('pc-pin-slots')).toHaveAttribute('aria-label', 'PIN: 8 of 8 digits entered');
    expect(screen.getByRole('button', { name: '9' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Backspace' })).toBeEnabled();
  });

  it('shows a rejected PIN (selectUser throws on 401) and clears the entry', async () => {
    selectUser.mockRejectedValue(new Error('Invalid PIN'));
    renderModal();
    fireEvent.click(await screen.findByText('Claude'));
    tapPin('0000');
    await act(async () => { fireEvent.click(screen.getByText('Verify')); });
    expect(await screen.findByText('Invalid PIN')).toBeInTheDocument();
    expect(screen.getByTestId('pc-pin-slots')).toHaveAttribute('aria-label', 'PIN: 0 of 8 digits entered');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('requires a password for a user without a PIN', async () => {
    getAccountUsers.mockResolvedValue([{ id: 2, full_name: 'NoPin', has_pin: false }]);
    renderModal();
    fireEvent.click(await screen.findByText('NoPin'));
    expect(screen.getByText('Password')).toBeInTheDocument(); // password label, not PIN
    fireEvent.change(passwordInput(), { target: { value: 'secret' } });
    await act(async () => { fireEvent.click(screen.getByText('Verify')); });

    expect(selectUser).toHaveBeenCalledWith(2, null, 'secret');
  });

  it('switches to password entry when the backend reports requiresPassword', async () => {
    selectUser.mockResolvedValue({ success: false, requiresPassword: true });
    renderModal();
    fireEvent.click(await screen.findByText('Claude'));
    tapPin('1234');
    await act(async () => { fireEvent.click(screen.getByText('Verify')); });

    expect(await screen.findByText('Password')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces an authentication error', async () => {
    selectUser.mockResolvedValue({ success: false, error: 'Invalid PIN' });
    renderModal();
    fireEvent.click(await screen.findByText('Claude'));
    tapPin('0000');
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
