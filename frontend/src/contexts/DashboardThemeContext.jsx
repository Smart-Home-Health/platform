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
import { createContext, useContext } from 'react';

/**
 * Live-dashboard chart chrome.
 *
 * The board's charts are recharts (SVG), and SVG presentation attributes take
 * a CSS custom-property reference, so every colour here is a `var(--vc-*)`
 * string: the palette on <html> (dark / light / high-contrast, see
 * contexts/ThemeContext) reaches the plot, axes and tooltips with no
 * JavaScript in the loop and no re-render on a switch. Canvas charts cannot
 * do this — they use utils/themeTokens + hooks/useThemeTokens instead.
 */
export const CHART_CHROME = {
  bg: 'var(--vc-plot-bg)',
  axis: 'var(--vc-text-tertiary)',
  grid: 'var(--vc-line-hairline)',
  tooltipBg: 'var(--vc-bg-sheet)',
  tooltipBorder: 'var(--vc-line-strong)',
  tooltipText: 'var(--vc-text-primary)',
  text: 'var(--vc-text-primary)',
  textMuted: 'var(--vc-text-secondary)',
  textDim: 'var(--vc-text-tertiary)',
  border: 'var(--vc-line-hairline)',
};

// Hoisted (not an inline literal in the Provider) so consumers see a stable
// context value — the live dashboard re-renders ~1 Hz and a fresh object would
// invalidate every memoized chart below it.
const CONTEXT_VALUE = { chartChrome: CHART_CHROME };

const DashboardThemeContext = createContext(CONTEXT_VALUE);

// Radix overlays portal into <body>; they used to be pinned dark from here
// with a `dash-scheme-dark` class on <html>. The palette now lives on <html>
// for the whole app, so portals and the board read the same tokens.
export function DashboardThemeProvider({ children }) {
  return (
    <DashboardThemeContext.Provider value={CONTEXT_VALUE}>
      {children}
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  return useContext(DashboardThemeContext);
}
