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
// Wave 3 — live-dashboard color scheme (session-only, no backend).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  DashboardThemeProvider,
  useDashboardTheme,
  CHART_CHROME,
  DASHBOARD_SCHEMES,
} from './DashboardThemeContext';

function Probe() {
  const { scheme, setScheme, chartChrome } = useDashboardTheme();
  return (
    <div>
      <span data-testid="scheme">{scheme}</span>
      <span data-testid="bg">{chartChrome.bg}</span>
      <button onClick={() => setScheme('dark')}>dark</button>
      <button onClick={() => setScheme('bogus')}>bogus</button>
    </div>
  );
}

const renderProvider = () =>
  render(
    <DashboardThemeProvider>
      <Probe />
    </DashboardThemeProvider>
  );

beforeEach(() => {
  sessionStorage.clear();
  document.documentElement.className = '';
});
afterEach(() => {
  document.documentElement.className = '';
});

describe('DashboardThemeProvider', () => {
  it('defaults to blue and applies the html scheme class', () => {
    renderProvider();
    expect(screen.getByTestId('scheme').textContent).toBe('blue');
    expect(screen.getByTestId('bg').textContent).toBe(CHART_CHROME.blue.bg);
    expect(document.documentElement.classList.contains('dash-scheme-blue')).toBe(true);
  });

  it('initializes from sessionStorage', () => {
    sessionStorage.setItem('dashboardColorScheme', 'light');
    renderProvider();
    expect(screen.getByTestId('scheme').textContent).toBe('light');
  });

  it('setScheme updates state, sessionStorage, class, and chrome', () => {
    renderProvider();
    act(() => screen.getByText('dark').click());
    expect(screen.getByTestId('scheme').textContent).toBe('dark');
    expect(sessionStorage.getItem('dashboardColorScheme')).toBe('dark');
    expect(document.documentElement.classList.contains('dash-scheme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('dash-scheme-blue')).toBe(false);
    expect(screen.getByTestId('bg').textContent).toBe(CHART_CHROME.dark.bg);
  });

  it('falls back to the default for an invalid scheme', () => {
    renderProvider();
    act(() => screen.getByText('bogus').click());
    expect(screen.getByTestId('scheme').textContent).toBe('blue');
  });

  it('removes the scheme class on unmount', () => {
    const { unmount } = renderProvider();
    expect(document.documentElement.classList.contains('dash-scheme-blue')).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains('dash-scheme-blue')).toBe(false);
  });

  it('CHART_CHROME defines every scheme with consistent keys', () => {
    expect(Object.keys(CHART_CHROME).sort()).toEqual([...DASHBOARD_SCHEMES].sort());
    const keys = Object.keys(CHART_CHROME.blue).sort();
    for (const s of DASHBOARD_SCHEMES) {
      expect(Object.keys(CHART_CHROME[s]).sort()).toEqual(keys);
    }
  });
});
