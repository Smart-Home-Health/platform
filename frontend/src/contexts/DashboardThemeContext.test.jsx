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
// Live-dashboard chart chrome: var(--vc-*) references, so the SVG charts
// follow the palette on <html> without the provider touching the DOM.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DashboardThemeProvider,
  useDashboardTheme,
  CHART_CHROME,
} from './DashboardThemeContext';

const seen = [];
function Probe() {
  const value = useDashboardTheme();
  seen.push(value);
  return <span data-testid="bg">{value.chartChrome.bg}</span>;
}

beforeEach(() => {
  seen.length = 0;
  document.documentElement.className = '';
  document.body.className = '';
});
afterEach(() => {
  document.documentElement.className = '';
  document.body.className = '';
});

describe('DashboardThemeProvider', () => {
  it('provides the single chart chrome', () => {
    render(
      <DashboardThemeProvider>
        <Probe />
      </DashboardThemeProvider>
    );
    expect(screen.getByTestId('bg').textContent).toBe(CHART_CHROME.bg);
  });

  it('leaves <html> alone — the palette class is ThemeProvider\'s', () => {
    document.documentElement.className = 'light hc';
    const { unmount } = render(
      <DashboardThemeProvider>
        <Probe />
      </DashboardThemeProvider>
    );
    expect(document.documentElement.className).toBe('light hc');
    expect(document.documentElement.classList.contains('dash-scheme-dark')).toBe(false);
    unmount();
    expect(document.documentElement.className).toBe('light hc');
  });

  it('keeps one referentially stable value across re-renders', () => {
    const { rerender } = render(
      <DashboardThemeProvider>
        <Probe />
      </DashboardThemeProvider>
    );
    rerender(
      <DashboardThemeProvider>
        <Probe />
      </DashboardThemeProvider>
    );
    expect(seen.length).toBe(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it('exposes a complete chrome of token references for recharts consumers', () => {
    for (const key of ['bg', 'axis', 'grid', 'tooltipBg', 'tooltipBorder', 'tooltipText', 'text', 'textMuted', 'textDim', 'border']) {
      expect(CHART_CHROME[key], key).toMatch(/^var\(--vc-[a-z-]+\)$/);
    }
  });
});
