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
// Wave 3 — AuthContext: the pure errorMessage formatter plus the two-layer auth
// state machine (null -> account -> full -> logout). The global fetch is mocked
// with a tiny URL router; the interceptor + throttle imports are no-oped.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

vi.mock('../utils/authInterceptor', () => ({ installAuthInterceptor: () => {} }));
vi.mock('../utils/messagesPopThrottle', () => ({ clearMessagesPopThrottle: () => {} }));

import { AuthProvider, useAuth, errorMessage } from './AuthContext';

// ---- errorMessage (pure) ----------------------------------------------------
describe('errorMessage', () => {
  it('returns a string detail unchanged', () => {
    expect(errorMessage({ detail: 'Invalid PIN' })).toBe('Invalid PIN');
  });
  it('joins a FastAPI 422 validation array', () => {
    expect(errorMessage({ detail: [{ msg: 'too short' }, { msg: 'must be digits' }] }))
      .toBe('too short; must be digits');
  });
  it('reads an object detail msg', () => {
    expect(errorMessage({ detail: { msg: 'nope' } })).toBe('nope');
  });
  it('falls back when detail is missing or empty', () => {
    expect(errorMessage({})).toBe('Something went wrong');
    expect(errorMessage({ detail: [] }, 'fallback')).toBe('fallback');
  });
});

// ---- provider state machine -------------------------------------------------
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status, body = {}) => ({ ok: false, status, json: async () => body });

function router(routes) {
  return vi.fn((url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    const r = routes.find((x) => u.includes(x.path) && (x.method || 'GET') === method);
    return Promise.resolve(r ? r.res : fail(404, { detail: 'not found' }));
  });
}

const NO_SESSION = [
  { path: '/api/auth/first-run', res: ok({ is_first_run: false }) },
  { path: '/api/auth/session', res: fail(401, { detail: 'Not authenticated' }) },
];

function Probe() {
  const a = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(a.loading)}</span>
      <span data-testid="level">{String(a.authLevel)}</span>
      <span data-testid="isAuth">{String(a.isAuthenticated)}</span>
      <span data-testid="isAcct">{String(a.isAccountAuthenticated)}</span>
      <span data-testid="firstrun">{String(a.isFirstRun)}</span>
      <span data-testid="user">{a.user?.username || ''}</span>
      <button onClick={() => a.accountLogin('fam', 'pw')}>login</button>
      <button onClick={() => a.selectUser(1, '1234')}>select</button>
      <button onClick={() => a.logout()}>logout</button>
    </div>
  );
}

const setFetch = (routes) => vi.stubGlobal('fetch', router(routes));
const renderAuth = async () => {
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
};
const click = async (label) => {
  await act(async () => { screen.getByText(label).click(); });
};

beforeEach(() => {
  sessionStorage.clear();
});

describe('AuthProvider state machine', () => {
  it('settles to unauthenticated with no session', async () => {
    setFetch(NO_SESSION);
    await renderAuth();
    expect(screen.getByTestId('level').textContent).toBe('null');
    expect(screen.getByTestId('isAuth').textContent).toBe('false');
    expect(screen.getByTestId('isAcct').textContent).toBe('false');
  });

  it('detects first-run', async () => {
    setFetch([{ path: '/api/auth/first-run', res: ok({ is_first_run: true }) }]);
    await renderAuth();
    expect(screen.getByTestId('firstrun').textContent).toBe('true');
  });

  it('accountLogin moves to account level (not full)', async () => {
    setFetch([
      ...NO_SESSION,
      { path: '/api/auth/account/login', method: 'POST', res: ok({ account: { id: 1 } }) },
    ]);
    await renderAuth();
    await click('login');
    await waitFor(() => expect(screen.getByTestId('level').textContent).toBe('account'));
    expect(screen.getByTestId('isAcct').textContent).toBe('true');
    expect(screen.getByTestId('isAuth').textContent).toBe('false');
  });

  it('selectUser grants full auth and sets the user', async () => {
    setFetch([
      ...NO_SESSION,
      { path: '/api/auth/account/login', method: 'POST', res: ok({ account: { id: 1 } }) },
      { path: '/api/auth/user/select', method: 'POST', res: ok({ account: { id: 1 }, user: { id: 1, username: 'claude' } }) },
    ]);
    await renderAuth();
    await click('login');
    await waitFor(() => expect(screen.getByTestId('level').textContent).toBe('account'));
    await click('select');
    await waitFor(() => expect(screen.getByTestId('level').textContent).toBe('full'));
    expect(screen.getByTestId('isAuth').textContent).toBe('true');
    expect(screen.getByTestId('user').textContent).toBe('claude');
  });

  it('adopts an existing full session on mount', async () => {
    setFetch([
      { path: '/api/auth/first-run', res: ok({ is_first_run: false }) },
      { path: '/api/auth/session', res: ok({ user_id: 1, username: 'claude', account_id: 1 }) },
    ]);
    await renderAuth();
    expect(screen.getByTestId('level').textContent).toBe('full');
    expect(screen.getByTestId('user').textContent).toBe('claude');
  });

  it('logout resets to unauthenticated', async () => {
    setFetch([
      { path: '/api/auth/first-run', res: ok({ is_first_run: false }) },
      { path: '/api/auth/session', res: ok({ user_id: 1, username: 'claude', account_id: 1 }) },
      { path: '/api/auth/logout', method: 'POST', res: ok({}) },
    ]);
    await renderAuth();
    expect(screen.getByTestId('level').textContent).toBe('full');
    await click('logout');
    await waitFor(() => expect(screen.getByTestId('level').textContent).toBe('null'));
    expect(screen.getByTestId('isAuth').textContent).toBe('false');
  });
});
