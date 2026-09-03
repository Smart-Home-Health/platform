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
// The in-app keyboard defaults ON for the live dashboard (wall units have no
// physical keyboard and kiosk Chrome no OS one), while an explicit ?vkb=0
// wins and persists.
import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useVirtualKeyboard } from './useVirtualKeyboard';

const setPath = (path, search = '') => {
  window.history.pushState({}, '', `${path}${search}`);
};

beforeEach(() => {
  window.localStorage.clear();
  setPath('/');
});

describe('useVirtualKeyboard', () => {
  it('defaults off away from the live dashboard', () => {
    setPath('/care/nutrition');
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.showVKB).toBe(false);
  });

  it('defaults on for the live dashboard when nothing is stored', () => {
    setPath('/live');
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.showVKB).toBe(true);
  });

  it('a stored refusal beats the live-dashboard default', () => {
    window.localStorage.setItem('vkb', '0');
    setPath('/live');
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.showVKB).toBe(false);
  });

  it('?vkb=0 persists the refusal instead of clearing it', () => {
    setPath('/live', '?vkb=0');
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.showVKB).toBe(false);
    // Clearing the key would re-enable via the route default on next load.
    expect(window.localStorage.getItem('vkb')).toBe('0');
  });

  it('?vkb=1 still forces it on anywhere', () => {
    setPath('/care/vitals', '?vkb=1');
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.showVKB).toBe(true);
    expect(window.localStorage.getItem('vkb')).toBe('1');
  });

  it('suppresses the live default on a phone with its own keyboard', () => {
    // iOS pops the native keyboard on focus; the route default would stack
    // ours on top of it.
    vi.stubGlobal('navigator', {
      ...window.navigator,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      maxTouchPoints: 5,
    });
    setPath('/live');
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.showVKB).toBe(false);
    vi.unstubAllGlobals();
  });

  it('treats a masquerading iPad (Mac UA + touch) as native-keyboard', () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      maxTouchPoints: 5,
    });
    setPath('/live');
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.showVKB).toBe(false);
    vi.unstubAllGlobals();
  });

  it('keeps the live default on the kiosk (Linux Chrome, no OS keyboard)', () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      maxTouchPoints: 5,
    });
    setPath('/live');
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.showVKB).toBe(true);
    vi.unstubAllGlobals();
  });

  it('an explicit ?vkb=1 beats the native-keyboard suppression', () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      maxTouchPoints: 5,
    });
    setPath('/live', '?vkb=1');
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.showVKB).toBe(true);
    vi.unstubAllGlobals();
  });
});
