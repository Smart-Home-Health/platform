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
// AdminV2AccountSettings on the vc cfg-* chassis.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { authCtx, themeCtx } = vi.hoisted(() => ({
  authCtx: { user: { is_system_admin: true } },
  themeCtx: { theme: 'dark', contrast: 'normal', setTheme: vi.fn(), setContrast: vi.fn() },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => themeCtx }));
vi.mock('../../config', () => ({ API_BASE_URL: '' }));

import AdminV2AccountSettings from './AdminV2AccountSettings';

const ACCOUNT = {
  id: 1, name: 'Carty Family', slug: 'carty', timezone: 'America/New_York',
  created_at: '2026-01-15T12:00:00Z', is_active: true, password_unset: false,
  organization: null,
};

let fetchMock;
const stubFetch = (account = ACCOUNT) => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => account }));
  vi.stubGlobal('fetch', fetchMock);
};

beforeEach(() => {
  authCtx.user = { is_system_admin: true };
  stubFetch();
});

const renderPage = async () => { await act(async () => { render(<AdminV2AccountSettings />); }); };
const callTo = (path, method) =>
  fetchMock.mock.calls.find(([u, o]) => u.endsWith(path) && o?.method === method);

describe('AdminV2AccountSettings', () => {
  it('renders four vc sections, Appearance first', async () => {
    await renderPage();
    expect([...document.querySelectorAll('.cfg-title')].map(t => t.textContent))
      .toEqual(['Appearance', 'Account Details', 'Account Password', 'Account Information']);
    expect(document.querySelector('.tw')).not.toBeInTheDocument();
  });

  it('shows the current theme and contrast and routes a change to the context', async () => {
    await renderPage();
    expect(document.querySelector('#theme').value).toBe('dark');
    expect(document.querySelector('#contrast').value).toBe('normal');
    fireEvent.change(document.querySelector('#theme'), { target: { value: 'system' } });
    expect(themeCtx.setTheme).toHaveBeenCalledWith('system');
    fireEvent.change(document.querySelector('#contrast'), { target: { value: 'high' } });
    expect(themeCtx.setContrast).toHaveBeenCalledWith('high');
  });

  it('loads the account into the detail fields', async () => {
    await renderPage();
    expect(document.querySelector('#name').value).toBe('Carty Family');
    expect(document.querySelector('#slug').value).toBe('carty');
    expect(document.querySelector('#timezone').value).toBe('America/New_York');
  });

  // The Save button sits in the section footer, outside the <form>, and reaches
  // it via the `form` attribute. Guard that it really submits.
  it('saves account details from the footer button outside the form', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.change(document.querySelector('#name'), { target: { value: 'New Name' } });
    });
    const save = screen.getByRole('button', { name: /Save Changes/i });
    expect(save).toHaveAttribute('form', 'account-details-form');
    await act(async () => { fireEvent.submit(document.querySelector('#account-details-form')); });

    const [, opts] = callTo('/api/account', 'PUT');
    expect(JSON.parse(opts.body)).toMatchObject({ name: 'New Name', slug: 'carty' });
    expect(document.querySelector('.em-success')).toHaveTextContent('updated successfully');
  });

  it('normalises the account slug as it is typed', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.change(document.querySelector('#slug'), { target: { value: 'My Account!' } });
    });
    expect(document.querySelector('#slug').value).toBe('myaccount');
  });

  it('shows the account facts, with status on a dot badge', async () => {
    await renderPage();
    const rows = [...document.querySelectorAll('.cfg-facts > div')].map(d => d.textContent);
    expect(rows[0]).toBe('Account ID1');
    expect(rows[2]).toContain('Active');
    expect(document.querySelector('.cfg-facts .cfg-badge')).toHaveClass('ok');
  });

  it('marks an inactive account with the alert badge', async () => {
    stubFetch({ ...ACCOUNT, is_active: false });
    await renderPage();
    expect(document.querySelector('.cfg-facts .cfg-badge')).toHaveClass('alert');
  });

  it('asks for the current password only when one is already set', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Change Password/i })); });
    expect(document.querySelector('#currentPassword')).toBeInTheDocument();
  });

  it('skips the current-password field after a Home Assistant setup', async () => {
    stubFetch({ ...ACCOUNT, password_unset: true });
    await renderPage();
    expect(document.querySelector('.cfg-note')).toHaveTextContent(/No account password has been set/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Set Password/i })); });
    expect(document.querySelector('#currentPassword')).not.toBeInTheDocument();
  });

  it('refuses a mismatched password without calling the API', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Change Password/i })); });
    await act(async () => {
      fireEvent.change(document.querySelector('#newPassword'), { target: { value: 'longenough1' } });
      fireEvent.change(document.querySelector('#confirmPassword'), { target: { value: 'different11' } });
    });
    // jsdom does not submit a form from a button click, so submit it directly.
    await act(async () => {
      fireEvent.submit(document.querySelector('#newPassword').closest('form'));
    });
    expect(document.querySelector('.em-error')).toHaveTextContent('do not match');
    expect(callTo('/api/account/password', 'PUT')).toBeUndefined();
  });

  it('shows the access-denied section to a non-admin', async () => {
    authCtx.user = { is_system_admin: false };
    await renderPage();
    expect(document.querySelector('.cfg-title')).toHaveTextContent('Access Denied');
  });
});
