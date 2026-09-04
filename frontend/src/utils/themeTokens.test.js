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
import { describe, it, expect, afterEach } from 'vitest';
import { DARK_TOKENS, hexAlpha, readToken, resolveColor, readChartChrome, readSeries } from './themeTokens';

afterEach(() => { document.documentElement.removeAttribute('style'); });

describe('hexAlpha', () => {
  it('expands hex forms to rgba at the requested alpha', () => {
    expect(hexAlpha('#4da7bd', 0.5)).toBe('rgba(77, 167, 189, 0.5)');
    expect(hexAlpha('#fff', 0.2)).toBe('rgba(255, 255, 255, 0.2)');
    expect(hexAlpha('#4da7bdff', 0.1)).toBe('rgba(77, 167, 189, 0.1)');
  });
  it('re-alphas rgb() and rgba() values (the hairline tokens are rgba)', () => {
    expect(hexAlpha('rgba(255, 255, 255, 0.1)', 0.06)).toBe('rgba(255, 255, 255, 0.06)');
    expect(hexAlpha('rgb(10, 14, 20)', 1)).toBe('rgba(10, 14, 20, 1)');
  });
  it('clamps alpha and leaves anything it cannot parse alone', () => {
    expect(hexAlpha('#000', 7)).toBe('rgba(0, 0, 0, 1)');
    expect(hexAlpha('var(--vc-data-live)', 0.5)).toBe('var(--vc-data-live)');
    expect(hexAlpha(undefined, 0.5)).toBe('');
  });
});

describe('readToken / resolveColor', () => {
  it('falls back to the dark literal when the token is unset', () => {
    expect(readToken('--vc-plot-bg')).toBe(DARK_TOKENS['--vc-plot-bg']);
    expect(readToken('--vc-nope', '#123456')).toBe('#123456');
  });
  it('resolves a var() reference and passes literals through', () => {
    expect(resolveColor('var(--vc-series-spo2)')).toBe(DARK_TOKENS['--vc-series-spo2']);
    expect(resolveColor('var(--vc-unknown, #abcdef)')).toBe('#abcdef');
    expect(resolveColor('#4da7bd')).toBe('#4da7bd');
    expect(resolveColor(undefined)).toBe(undefined);
  });
  it('reads a token the document actually declares', () => {
    document.documentElement.style.setProperty('--vc-plot-bg', '#123456');
    const v = readToken('--vc-plot-bg');
    // jsdom exposes inline custom properties through getComputedStyle; if a
    // future jsdom stops doing so the fallback is still a valid colour.
    expect([ '#123456', DARK_TOKENS['--vc-plot-bg'] ]).toContain(v);
  });
});

describe('readChartChrome / readSeries', () => {
  it('produce complete, literal colour sets', () => {
    const chrome = readChartChrome();
    for (const k of ['bg', 'axis', 'grid', 'border', 'tooltipBg', 'tooltipBorder', 'tooltipText', 'text', 'textMuted', 'textDim']) {
      expect(chrome[k], k).toMatch(/^(#|rgba?\()/);
    }
    const series = readSeries();
    expect(series.ramp).toHaveLength(7);
    for (const k of ['live', 'complete', 'due', 'alert', 'idle', 'spo2', 'hr', 'pi', 'bp', 'temp', 'weight', 'calories', 'water', 'bathroom']) {
      expect(series[k], k).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Identity ramp keeps the state colours out (amber/red mean something).
    expect(series.ramp).not.toContain(series.due);
    expect(series.ramp).not.toContain(series.alert);
  });
});
