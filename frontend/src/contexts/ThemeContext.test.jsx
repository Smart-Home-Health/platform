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
// Theme (light/dark/system) × contrast (normal/high). useAuth and config are
// mocked so the provider is exercised in isolation; we assert the <html>
// classes, localStorage, matchMedia resolution, the theme-color meta and the
// per-user persistence call.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

const apiFetch = vi.fn().mockResolvedValue({ ok: true });
let mockUser = null;

vi.mock('../config', () => ({ apiFetch: (...a) => apiFetch(...a), API_BASE_URL: 'http://api' }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

import { ThemeProvider, useTheme, THEME_COLOR } from './ThemeContext';

function Probe() {
  const { theme, contrast, resolvedTheme, palette, setTheme, setContrast, savesToProfile } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="contrast">{contrast}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <span data-testid="palette">{palette}</span>
      <span data-testid="saves">{String(savesToProfile)}</span>
      <button onClick={() => setTheme('light')}>light</button>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('system')}>system</button>
      <button onClick={() => setTheme('bogus')}>bogus</button>
      <button onClick={() => setContrast('high')}>high</button>
      <button onClick={() => setContrast('normal')}>normal</button>
    </div>
  );
}

const renderProvider = () => render(<ThemeProvider><Probe /></ThemeProvider>);
const html = () => document.documentElement.classList;
const metaColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

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
  apiFetch.mockReset().mockResolvedValue({ ok: true });
  document.documentElement.className = '';
  document.head.innerHTML = '<meta name="theme-color" content="#000">';
  stubPrefersDark(false);
});
afterEach(() => {
  document.documentElement.className = '';
});

describe('ThemeProvider', () => {
  it('defaults to dark / normal with nothing stored, and writes no class', () => {
    renderProvider();
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('contrast').textContent).toBe('normal');
    expect(screen.getByTestId('palette').textContent).toBe('dark');
    expect(html().contains('light')).toBe(false);
    expect(html().contains('hc')).toBe(false);
    expect(metaColor()).toBe(THEME_COLOR.dark);
  });

  it('system resolves via matchMedia', () => {
    localStorage.setItem('theme', 'system');
    stubPrefersDark(false);
    renderProvider();
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(html().contains('light')).toBe(true);
  });

  it('system resolves to dark when the OS prefers dark', () => {
    localStorage.setItem('theme', 'system');
    stubPrefersDark(true);
    renderProvider();
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(html().contains('light')).toBe(false);
  });

  it('reads stored choices on init', () => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('contrast', 'high');
    renderProvider();
    expect(screen.getByTestId('palette').textContent).toBe('light-hc');
    expect(html().contains('light')).toBe(true);
    expect(html().contains('hc')).toBe(true);
    expect(metaColor()).toBe(THEME_COLOR['light-hc']);
  });

  it('setTheme applies the class, persists locally, and swaps back off', () => {
    renderProvider();
    act(() => screen.getByText('light').click());
    expect(localStorage.getItem('theme')).toBe('light');
    expect(html().contains('light')).toBe(true);
    expect(metaColor()).toBe(THEME_COLOR.light);
    act(() => screen.getByText('dark').click());
    expect(html().contains('light')).toBe(false);
    expect(metaColor()).toBe(THEME_COLOR.dark);
  });

  it('contrast is independent of theme', () => {
    renderProvider();
    act(() => screen.getByText('high').click());
    expect(html().contains('hc')).toBe(true);
    expect(html().contains('light')).toBe(false);
    expect(screen.getByTestId('palette').textContent).toBe('dark-hc');
    expect(localStorage.getItem('contrast')).toBe('high');
    act(() => screen.getByText('light').click());
    expect(screen.getByTestId('palette').textContent).toBe('light-hc');
    act(() => screen.getByText('normal').click());
    expect(html().contains('hc')).toBe(false);
    expect(screen.getByTestId('palette').textContent).toBe('light');
  });

  it('ignores an invalid theme value', () => {
    renderProvider();
    act(() => screen.getByText('bogus').click());
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('does not call the backend without a user, and says so', () => {
    renderProvider();
    expect(screen.getByTestId('saves').textContent).toBe('false');
    act(() => screen.getByText('light').click());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('persists only the changed key per-user when a user is present', async () => {
    mockUser = { id: 7 };
    renderProvider();
    expect(screen.getByTestId('saves').textContent).toBe('true');
    act(() => screen.getByText('high').click());
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [url, opts] = apiFetch.mock.calls[0];
    expect(String(url)).toContain('/api/auth/preferences');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ preferences: { contrast: 'high' } });
  });

  it('adopts the signed-in user saved preferences', async () => {
    mockUser = { id: 7, preferences: { theme: 'light', contrast: 'high' } };
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('palette').textContent).toBe('light-hc'));
    expect(localStorage.getItem('theme')).toBe('light');
    expect(localStorage.getItem('contrast')).toBe('high');
  });

  it('ignores unknown saved values and keeps the device choice', async () => {
    localStorage.setItem('theme', 'light');
    mockUser = { id: 7, preferences: { theme: 'neon' } };
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('light'));
  });
});
