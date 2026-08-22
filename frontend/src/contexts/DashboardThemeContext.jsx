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
import { createContext, useContext, useEffect } from 'react';

/**
 * Live-dashboard chart chrome.
 *
 * The live board is dark-only by design (bedside-monitor aesthetic, aligned
 * with the vc tokens in styles/vc-tokens.css). Recharts needs literal colors,
 * so the chrome (bg/axis/grid/tooltip/text) is supplied here; the CSS side
 * resolves through the `--dash-*` variables in App.css, which are defined
 * from the same vc token values. Vital *series* colors stay at call sites.
 */

// Mirrors vc-tokens.css: bg-base #0a0e14, surface #131a24, sheet #161e29,
// text-primary #e8edf3, secondary #9aa8b8, tertiary #6b7987.
export const CHART_CHROME = {
  bg: '#0f1620',
  axis: '#6b7987',
  grid: 'rgba(255, 255, 255, 0.08)',
  tooltipBg: '#161e29',
  tooltipBorder: 'rgba(255, 255, 255, 0.2)',
  tooltipText: '#e8edf3',
  text: '#e8edf3',
  textMuted: '#9aa8b8',
  textDim: '#6b7987',
  border: 'rgba(255, 255, 255, 0.1)',
};

// Hoisted (not an inline literal in the Provider) so consumers see a stable
// context value — the live dashboard re-renders ~1 Hz and a fresh object would
// invalidate every memoized chart below it.
const CONTEXT_VALUE = { chartChrome: CHART_CHROME };

const DashboardThemeContext = createContext(CONTEXT_VALUE);

export function DashboardThemeProvider({ children }) {
  // Radix overlays (Dialog/Select/Popover) portal into <body>, outside the
  // dashboard wrapper, so they can't inherit the board's dark tokens. Pin
  // them dark on <html> while the live dashboard is mounted (see the
  // `:root.dash-scheme-dark` block in App.css).
  //
  // `vc-form-skin` on <body> is the same opt-in the admin makes in
  // AdminV2Layout: it turns on vc-forms.css for the shared shadcn primitives
  // (the Equipment/Settings/Camera panels and the dialogs the rebuilt panels
  // open). It goes on <body>, not the board wrapper, so it also reaches the
  // portalled Select/Dialog content. /live and /care never co-mount, so the
  // two owners can't strip each other's class. Both sheets gate on
  // `:root:is(:not(.light), .dash-scheme-dark)`, so a light-theme user still
  // gets the dark skin on the dark-only board.
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add('dash-scheme-dark');
    document.body.classList.add('vc-form-skin');
    return () => {
      el.classList.remove('dash-scheme-dark');
      document.body.classList.remove('vc-form-skin');
    };
  }, []);

  return (
    <DashboardThemeContext.Provider value={CONTEXT_VALUE}>
      {children}
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  return useContext(DashboardThemeContext);
}
