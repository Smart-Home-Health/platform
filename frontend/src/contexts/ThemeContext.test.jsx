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
// Wave 3 — per-user light/dark/system theme. useAuth + config are mocked so the
// provider is exercised in isolation; we assert <html> class, localStorage,
// matchMedia resolution, and the per-user backend persistence call.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

const apiFetch = vi.fn().mockResolvedValue({ ok: true });
let mockUser = null;

vi.mock('../config', () => ({ apiFetch: (...a) => apiFetch(...a), API_BASE_URL: 'http://api' }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

import { ThemeProvider, useTheme } from './ThemeContext';

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('bogus')}>bogus</button>
    </div>
  );
}

const renderProvider = () => render(<ThemeProvider><Probe /></ThemeProvider>);

// matchMedia stub whose `.matches` we can flip per test.
function stubPrefersDark(matches) {
  window.matchMedia = (query) => ({
    matches, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  });
}

beforeEach(() => {
  localStorage.clear();
  mockUser = null;
  // restoreMocks (vitest.config) wipes the impl before each test — re-establish it.
  apiFetch.mockReset().mockResolvedValue({ ok: true });
  document.documentElement.className = '';
  stubPrefersDark(false);
});
afterEach(() => {
  document.documentElement.className = '';
});

describe('ThemeProvider', () => {
  it('defaults to system and resolves via matchMedia (light)', () => {
    renderProvider();
    expect(screen.getByTestId('theme').textContent).toBe('system');
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('resolves system to dark when the OS prefers dark', () => {
    stubPrefersDark(true);
    renderProvider();
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('reads a stored choice on init', () => {
    localStorage.setItem('theme', 'dark');
    renderProvider();
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('setTheme applies the class, persists, and swaps off the old class', () => {
    renderProvider();
    act(() => screen.getByText('dark').click());
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('ignores an invalid theme value', () => {
    renderProvider();
    act(() => screen.getByText('bogus').click());
    expect(screen.getByTestId('theme').textContent).toBe('system');
  });

  it('persists per-user to the backend when a user is present', async () => {
    mockUser = { id: 7 };
    renderProvider();
    act(() => screen.getByText('dark').click());
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [url, opts] = apiFetch.mock.calls[0];
    expect(String(url)).toContain('/api/auth/preferences');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ preferences: { theme: 'dark' } });
  });

  it('adopts the logged-in user saved preference', async () => {
    mockUser = { id: 7, preferences: { theme: 'light' } };
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('light'));
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
