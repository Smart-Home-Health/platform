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
import { renderHook, waitFor, act } from '@testing-library/react';
import { useThemeTokens } from './useThemeTokens';

afterEach(() => { document.documentElement.className = ''; });

describe('useThemeTokens', () => {
  it('returns resolved chrome and series, memoised between renders', () => {
    const { result, rerender } = renderHook(() => useThemeTokens());
    const first = result.current;
    expect(first.chrome.bg).toMatch(/^#/);
    expect(first.series.ramp).toHaveLength(7);
    rerender();
    expect(result.current).toBe(first);
  });

  it('bumps the version when the palette class on <html> changes', async () => {
    const { result } = renderHook(() => useThemeTokens());
    const before = result.current;
    act(() => { document.documentElement.classList.add('light'); });
    await waitFor(() => expect(result.current.version).toBe(before.version + 1));
    expect(result.current).not.toBe(before);
  });
});
