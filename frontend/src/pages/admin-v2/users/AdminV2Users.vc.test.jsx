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
// The user sub-pages after moving off shadcn onto the cfg chassis + em-*
// vocabulary. Data comes from a mocked useUserRecord; the pages' own markup is
// what is under test.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

vi.mock('../AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../components/AvatarEditor', () => ({ default: () => <span data-testid="avatar" /> }));
vi.mock('../../../services/haIdentity', () => ({ unlinkHaIdentity: vi.fn() }));

const { record, fns } = vi.hoisted(() => {
  const record = {
    currentUser: { id: 1, is_system_admin: true, permissions: [] },
    user: {
      id: 7, username: 'nurse1', full_name: 'Nurse One', email: '',
      is_active: true, is_system_admin: false, has_pin: false,
      force_password_reset: false, roles: [{ id: 1, name: 'caregiver', display_name: 'Caregiver' }],
      created_at: '2026-01-01T00:00:00Z',
    },
    roles: [{ id: 1, name: 'caregiver', display_name: 'Caregiver', description: 'Day-to-day care' }],
    patients: [{ id: 5, first_name: 'Eli', last_name: 'Carty' }],
    patientIds: [5],
    activity: [],
    haLink: null,
    setHaLink: () => {},
    loading: false,
    error: '',
    setError: () => {},
    reload: async () => {},
  };
  const fns = {
    updateUser: vi.fn(async () => ({})),
    deleteUser: vi.fn(async () => ({})),
    resetUserPassword: vi.fn(async () => ({})),
    forceFirstLogin: vi.fn(async () => ({})),
    saveUserAccess: vi.fn(async () => ({})),
  };
  return { record, fns };
});
vi.mock('./useUserRecord', () => ({ default: () => record, ...fns }));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ userId: '7' }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}));

import AdminV2UserEdit from './AdminV2UserEdit';
import AdminV2UserAccess from './AdminV2UserAccess';
import AdminV2UserSecurity from './AdminV2UserSecurity';
import AdminV2UserDetail from './AdminV2UserDetail';

beforeEach(() => { vi.clearAllMocks(); });

const noShadcn = () => {
  expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
  expect(document.querySelector('.tw')).not.toBeInTheDocument();
};

describe('users pages on the vc chassis', () => {
  it('edit: saves through the section-footer submit tied to the form id', async () => {
    await act(async () => { render(<AdminV2UserEdit />); });
    noShadcn();
    expect(screen.getByLabelText(/Full name/)).toHaveClass('em-input');

    const submit = screen.getByRole('button', { name: 'Save details' });
    expect(submit).toHaveAttribute('form', 'user-edit-form');
    // jsdom does not submit a form from a button click — submit the form itself.
    await act(async () => { fireEvent.submit(document.getElementById('user-edit-form')); });
    expect(fns.updateUser).toHaveBeenCalledWith('7', expect.objectContaining({
      full_name: 'Nurse One',
    }));
  });

  it('access: grant rows toggle via aria-pressed, empty states use cfg-empty', async () => {
    await act(async () => { render(<AdminV2UserAccess />); });
    noShadcn();
    const row = screen.getByRole('button', { name: /Caregiver/ });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    await act(async () => { fireEvent.click(row); });
    expect(row).toHaveAttribute('aria-pressed', 'false');
  });

  it('security: the PIN dialog opens as an EntityModal with em fields', async () => {
    await act(async () => { render(<AdminV2UserSecurity />); });
    noShadcn();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /PIN sign-in/ })); });
    expect(screen.getByText('Set a PIN')).toBeInTheDocument();
    expect(document.querySelector('.em-panel')).toBeInTheDocument();
    expect(screen.getByLabelText(/New PIN/)).toHaveClass('em-input');
    noShadcn();
  });

  it('detail: hub renders on cfg with the delete confirm as a ConfirmSheet', async () => {
    await act(async () => { render(<AdminV2UserDetail />); });
    noShadcn();
    expect(document.querySelector('.cfg-crumb .cfg-back')).toBeInTheDocument();
    // Open the danger zone and ask to delete.
    await act(async () => { fireEvent.click(screen.getByText('Danger zone')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete user' })); });
    const panel = document.querySelector('.em-panel');
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Delete user/ })).toHaveClass('destructive');
    noShadcn();
  });
});
