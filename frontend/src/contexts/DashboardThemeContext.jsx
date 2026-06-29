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
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * Live-dashboard color scheme.
 *
 * Deliberately separate from the admin `ThemeContext` (which is per-user and
 * DB-backed). This one is session-only: whoever is viewing the live dashboard
 * picks a scheme that reads well on their screen, and it resets when the tab/
 * session closes. No backend, no persistence beyond sessionStorage.
 *
 * App.css styling follows a CSS class on `.dashboard-wrapper` (`theme-<scheme>`);
 * the Recharts charts need literal colors, so the chrome (bg/axis/grid/tooltip/
 * text) is supplied here via `chartChrome`. Vital *series* colors stay constant
 * across themes and live at the chart call sites.
 */

const SCHEMES = ['blue', 'dark', 'light'];
const DEFAULT_SCHEME = 'blue';
const STORAGE_KEY = 'dashboardColorScheme';

// Theme-aware chart "chrome" — everything except the vivid series colors.
// `blue` mirrors the dashboard's historical hardcoded values, so the default
// look is unchanged.
export const CHART_CHROME = {
  blue: {
    bg: '#161e2e',
    axis: '#999',
    grid: '#333',
    tooltipBg: '#161e2e',
    tooltipBorder: '#333',
    tooltipText: '#fff',
    text: '#fff',
    textMuted: '#ccc',
    textDim: '#888',
    border: '#333',
  },
  dark: {
    bg: '#0d1117',
    axis: '#8b949e',
    grid: '#30363d',
    tooltipBg: '#161b22',
    tooltipBorder: '#30363d',
    tooltipText: '#e6edf3',
    text: '#e6edf3',
    textMuted: '#8b949e',
    textDim: '#6e7681',
    border: '#30363d',
  },
  light: {
    bg: '#ffffff',
    axis: '#57606a',
    grid: '#d0d7de',
    tooltipBg: '#ffffff',
    tooltipBorder: '#d0d7de',
    tooltipText: '#1f2328',
    text: '#1f2328',
    textMuted: '#57606a',
    textDim: '#6e7781',
    border: '#d0d7de',
  },
};

const DashboardThemeContext = createContext({
  scheme: DEFAULT_SCHEME,
  setScheme: () => {},
  chartChrome: CHART_CHROME[DEFAULT_SCHEME],
});

function getStored() {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return SCHEMES.includes(v) ? v : DEFAULT_SCHEME;
  } catch {
    return DEFAULT_SCHEME;
  }
}

export function DashboardThemeProvider({ children }) {
  // Initialize from sessionStorage so the very first paint is correct.
  const [scheme, setSchemeState] = useState(getStored);

  const setScheme = useCallback((next) => {
    const value = SCHEMES.includes(next) ? next : DEFAULT_SCHEME;
    setSchemeState(value);
    try {
      sessionStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* sessionStorage unavailable (private mode / iframe) — state still applies */
    }
  }, []);

  // Radix overlays (Dialog/Select/Popover) portal into <body>, outside the
  // wrapper, so they can't inherit the board scheme. Mirror it onto <html> via
  // a `dash-scheme-*` class while the dashboard is mounted (see App.css). Scoped
  // to /live since the provider unmounts on navigation away.
  useEffect(() => {
    const el = document.documentElement;
    const cls = `dash-scheme-${scheme}`;
    el.classList.add(cls);
    return () => el.classList.remove(cls);
  }, [scheme]);

  const value = {
    scheme,
    setScheme,
    chartChrome: CHART_CHROME[scheme] || CHART_CHROME[DEFAULT_SCHEME],
  };

  return (
    <DashboardThemeContext.Provider value={value}>
      {children}
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  return useContext(DashboardThemeContext);
}

export const DASHBOARD_SCHEMES = SCHEMES;
