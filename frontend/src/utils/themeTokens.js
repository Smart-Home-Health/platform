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
// Chart colours for canvas renderers.
//
// SVG charts (recharts) and inline styles can take a token reference
// directly — `stroke="var(--vc-series-spo2)"` follows the palette on <html>
// with no JavaScript involved. Canvas renderers (chart.js) cannot: they need
// a literal colour string, so this module resolves tokens with
// getComputedStyle at draw time. Pair it with hooks/useThemeTokens so the
// chart is rebuilt when the palette changes.
//
// The token sheet keeps every value literal (hex / rgba, never color-mix) for
// exactly this reason — see styles/vc-tokens.css.

/* Dark-palette literals, used only when a token cannot be read (jsdom, or a
 * render before the sheet is attached). Mirrors the dark block of
 * vc-tokens.css. */
export const DARK_TOKENS = {
  '--vc-plot-bg': '#0f1620',
  '--vc-bg-sheet': '#161e29',
  '--vc-line-hairline': 'rgba(255, 255, 255, 0.1)',
  '--vc-line-strong': 'rgba(255, 255, 255, 0.2)',
  '--vc-text-primary': '#e8edf3',
  '--vc-text-secondary': '#9aa8b8',
  '--vc-text-tertiary': '#7c8c9d',
  '--vc-data-live': '#4da7bd',
  '--vc-state-complete': '#3fbf6a',
  '--vc-state-due': '#f0a52e',
  '--vc-state-alert': '#f0563c',
  '--vc-state-idle': '#7c8c9d',
  '--vc-series-1': '#4da7bd',
  '--vc-series-2': '#3fbf6a',
  '--vc-series-3': '#9b8cf0',
  '--vc-series-4': '#4dc3b3',
  '--vc-series-5': '#7f9fd4',
  '--vc-series-6': '#d98cc4',
  '--vc-series-7': '#a8c94a',
  '--vc-series-spo2': '#4da7bd',
  '--vc-series-hr': '#3fbf6a',
  '--vc-series-pi': '#f0a52e',
  '--vc-series-bp': '#9b8cf0',
  '--vc-series-temp': '#a8c94a',
  '--vc-series-weight': '#7f9fd4',
  '--vc-series-calories': '#a8c94a',
  '--vc-series-water': '#4dc3b3',
  '--vc-series-bathroom': '#d98cc4',
};

/** The computed value of a custom property, or the fallback (the dark literal
 * by default) when it is unset or there is no DOM. */
export function readToken(name, fallback = DARK_TOKENS[name], el) {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const target = el || document.documentElement;
  const v = getComputedStyle(target).getPropertyValue(name).trim();
  return v || fallback;
}

/** A colour that may be a `var(--token)` reference, resolved to a literal. */
export function resolveColor(color, el) {
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)$/.exec(String(color || '').trim());
  if (!m) return color;
  return readToken(m[1], m[2]?.trim() || DARK_TOKENS[m[1]] || color, el);
}

/** `color` at `alpha`, as an rgba() string canvas can parse. Accepts #rgb,
 * #rrggbb, #rrggbbaa, rgb() and rgba(); anything else is returned untouched. */
export function hexAlpha(color, alpha) {
  const s = String(color || '').trim();
  const a = Math.max(0, Math.min(1, Number(alpha)));
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(s);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${a})`;
  return s;
}

/** Chart chrome (plot background, axes, grid, tooltip) for canvas charts. */
export function readChartChrome(el) {
  const t = (n) => readToken(n, undefined, el);
  return {
    bg: t('--vc-plot-bg'),
    axis: t('--vc-text-tertiary'),
    grid: t('--vc-line-hairline'),
    border: t('--vc-line-hairline'),
    tooltipBg: t('--vc-bg-sheet'),
    tooltipBorder: t('--vc-line-strong'),
    tooltipText: t('--vc-text-primary'),
    text: t('--vc-text-primary'),
    textMuted: t('--vc-text-secondary'),
    textDim: t('--vc-text-tertiary'),
  };
}

/** Series colours for canvas charts: the categorical ramp, the state roles and
 * the per-vital aliases, all resolved to literals. */
export function readSeries(el) {
  const t = (n) => readToken(n, undefined, el);
  return {
    ramp: [1, 2, 3, 4, 5, 6, 7].map((i) => t(`--vc-series-${i}`)),
    live: t('--vc-data-live'),
    complete: t('--vc-state-complete'),
    due: t('--vc-state-due'),
    alert: t('--vc-state-alert'),
    idle: t('--vc-state-idle'),
    spo2: t('--vc-series-spo2'),
    hr: t('--vc-series-hr'),
    pi: t('--vc-series-pi'),
    bp: t('--vc-series-bp'),
    temp: t('--vc-series-temp'),
    weight: t('--vc-series-weight'),
    calories: t('--vc-series-calories'),
    water: t('--vc-series-water'),
    bathroom: t('--vc-series-bathroom'),
  };
}
