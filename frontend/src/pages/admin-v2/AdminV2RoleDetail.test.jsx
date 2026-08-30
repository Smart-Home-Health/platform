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
// AdminV2RoleDetail on the vc cfg-* chassis.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

// The auth object must keep a stable identity — the load effect is keyed on it,
// so a fresh object per call re-fetches forever.
const { authCtx, navigate } = vi.hoisted(() => ({
  authCtx: { user: { is_system_admin: true, permissions: [] } },
  navigate: vi.fn(),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ roleId: '3' }),
  useNavigate: () => navigate,
}));
vi.mock('../../config', () => ({ default: { apiUrl: '' } }));

import AdminV2RoleDetail from './AdminV2RoleDetail';

const ROLE = {
  id: 3, name: 'nurse', display_name: 'Registered Nurse', description: 'Bedside clinical staff',
  is_active: true, is_system_role: false, user_count: 4,
  permissions: [{ id: 1 }, { id: 4 }],
};
const PERMS = [
  { id: 1, name: 'vitals.read', display_name: 'Read vitals', category: 'vitals' },
  { id: 2, name: 'vitals.write', display_name: 'Write vitals', category: 'vitals' },
  { id: 4, name: 'medications.read', display_name: 'Read medications', category: 'medications' },
];

let fetchMock;
const stubFetch = (role = ROLE) => {
  fetchMock = vi.fn(async (url) => ({
    ok: true, status: 200,
    json: async () => (url.includes('/permissions') ? PERMS : role),
  }));
  vi.stubGlobal('fetch', fetchMock);
};

beforeEach(() => {
  authCtx.user = { is_system_admin: true, permissions: [] };
  navigate.mockReset();
  stubFetch();
});

const renderPage = async () => { await act(async () => { render(<AdminV2RoleDetail />); }); };
const callTo = (method) => fetchMock.mock.calls.find(([, o]) => o?.method === method);

describe('AdminV2RoleDetail', () => {
  it('renders vc sections rather than shadcn cards', async () => {
    await renderPage();
    expect([...document.querySelectorAll('.cfg-title')].map(t => t.textContent))
      .toEqual(['Registered Nurse', 'Permissions']);
    expect(document.querySelector('.tw')).not.toBeInTheDocument();
  });

  it('shows role status on dot badges in the crumb bar', async () => {
    await renderPage();
    const tags = [...document.querySelectorAll('.cfg-crumb-tags .cfg-badge')].map(b => b.textContent);
    expect(tags).toEqual(['4 users', 'Active']);
    expect(document.querySelector('.cfg-crumb-tags .cfg-badge.ok')).toHaveTextContent('Active');
  });

  it('locks the role code and leaves the display name editable', async () => {
    await renderPage();
    expect(document.querySelector('#rd-name')).toBeDisabled();
    expect(document.querySelector('#rd-display')).toBeEnabled();
    expect(document.querySelector('#rd-display').value).toBe('Registered Nurse');
  });

  it('saves details through PUT', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.change(document.querySelector('#rd-display'), { target: { value: 'RN' } });
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save details/i })); });
    const [, opts] = callTo('PUT');
    expect(JSON.parse(opts.body)).toEqual({
      display_name: 'RN', description: 'Bedside clinical staff', is_active: true,
    });
  });

  it('renders permission pills with the role selection marked', async () => {
    await renderPage();
    const on = [...document.querySelectorAll('.cfg-perm.on')].map(b => b.textContent);
    expect(on).toEqual(['Read', 'Read']); // vitals.read + medications.read
    expect(document.querySelector('.cfg-perm[aria-pressed="false"]')).toHaveTextContent('Write');
  });

  it('toggles a permission and saves the new id set', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Write' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save permissions/i })); });
    const [, opts] = callTo('PUT');
    expect(JSON.parse(opts.body).permission_ids.sort()).toEqual([1, 2, 4]);
  });

  it('hides delete for a system role', async () => {
    stubFetch({ ...ROLE, is_system_role: true });
    await renderPage();
    expect(screen.queryByRole('button', { name: /Delete role/i })).not.toBeInTheDocument();
    // System roles cannot be deactivated either.
    expect(document.querySelector('#rd-status')).toBeDisabled();
  });

  it('confirms before deleting, then navigates back to the role list', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Delete role/i })); });
    expect(screen.getByText(/removes it from every user/i)).toBeInTheDocument();
    expect(callTo('DELETE')).toBeUndefined();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Delete Role$/ })); });
    expect(callTo('DELETE')).toBeTruthy();
    expect(navigate).toHaveBeenCalledWith('/care/configuration/users/roles');
  });
});
