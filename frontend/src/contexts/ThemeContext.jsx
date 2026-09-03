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
// Appearance: theme (light / dark / system) and contrast (normal / high) are
// two independent per-user choices. Together they pick one of the four
// palettes in styles/vc-tokens.css by setting classes on <html>: `light` for
// the light palettes, `hc` for the high-contrast ones. No class means dark —
// the default — so an install with no saved choice never has anything written
// to <html> and renders exactly as before.
//
// Storage: localStorage gives an instant result on this device and lets the
// no-flash boot script in index.html apply the choice before React mounts.
// The backend (User.preferences, PATCH /api/auth/preferences) is the per-user
// source of truth and follows the user across devices; a saved choice is
// adopted on sign-in. On the wall unit's quick-entry board there is no user,
// so the choice stays device-local.
//
// `prefers-contrast` is deliberately not auto-honoured: nobody's app should
// change on upgrade, and the picker is one tap away in every sidebar.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiFetch, API_BASE_URL } from '../config';

export const THEMES = ['light', 'dark', 'system'];
export const CONTRASTS = ['normal', 'high'];
const THEME_KEY = 'theme';
const CONTRAST_KEY = 'contrast';
const DEFAULT_THEME = 'dark';
const DEFAULT_CONTRAST = 'normal';

// Address-bar / PWA chrome colour per palette — the --vc-bg-base of each.
// Mirrored by the boot script in index.html; keep the two in step.
export const THEME_COLOR = {
  dark: '#0a0e14',
  light: '#e6e1d8',
  'dark-hc': '#000000',
  'light-hc': '#ffffff',
};

const ThemeContext = createContext(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};

const getStored = (key, valid) => {
  try {
    const v = localStorage.getItem(key);
    return valid.includes(v) ? v : null;
  } catch {
    return null;
  }
};
const store = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* private mode / quota — the choice still applies for this session */ }
};

const mediaQuery = () =>
  (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
const systemPrefersDark = () => !!mediaQuery()?.matches;

export const resolveTheme = (theme, systemDark = systemPrefersDark()) =>
  theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
export const paletteOf = (theme, contrast, systemDark) =>
  `${resolveTheme(theme, systemDark)}${contrast === 'high' ? '-hc' : ''}`;

// Write the palette to <html> and the address-bar colour. Idempotent; with the
// dark/normal defaults it removes both classes, which is a no-op on a fresh
// document.
export function applyPalette(palette) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.classList.toggle('light', palette.startsWith('light'));
  el.classList.toggle('hc', palette.endsWith('-hc'));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[palette] || THEME_COLOR.dark);
}

export const ThemeProvider = ({ children }) => {
  const { user } = useAuth();
  const [theme, setThemeState] = useState(() => getStored(THEME_KEY, THEMES) || DEFAULT_THEME);
  const [contrast, setContrastState] = useState(() => getStored(CONTRAST_KEY, CONTRASTS) || DEFAULT_CONTRAST);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  const resolvedTheme = resolveTheme(theme, systemDark);
  const palette = paletteOf(theme, contrast, systemDark);

  // Layout effect so anything reading computed tokens in a passive effect
  // (chart chrome) sees the new palette on the same commit.
  useLayoutEffect(() => {
    applyPalette(palette);
  }, [palette]);

  // "System" follows live OS appearance changes.
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const mq = mediaQuery();
    if (!mq) return undefined;
    const handler = (e) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Adopt the signed-in user's saved choices. A stored value from before the
  // light theme was retired counts too — that is the point.
  useEffect(() => {
    const prefs = user?.preferences;
    if (!prefs) return;
    if (THEMES.includes(prefs.theme)) {
      setThemeState(prefs.theme);
      store(THEME_KEY, prefs.theme);
    }
    if (CONTRASTS.includes(prefs.contrast)) {
      setContrastState(prefs.contrast);
      store(CONTRAST_KEY, prefs.contrast);
    }
  }, [user]);

  // Persist per-user, best effort — localStorage already gave the instant
  // result, and the backend shallow-merges so only the changed key is sent.
  const userId = user?.id;
  const persist = useCallback((patch) => {
    if (!userId) return;
    apiFetch(`${API_BASE_URL}/api/auth/preferences`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: patch }),
    }).catch(() => { /* offline / transient — the device keeps the choice */ });
  }, [userId]);

  const setTheme = useCallback((value) => {
    if (!THEMES.includes(value)) return;
    setThemeState(value);
    store(THEME_KEY, value);
    persist({ theme: value });
  }, [persist]);

  const setContrast = useCallback((value) => {
    if (!CONTRASTS.includes(value)) return;
    setContrastState(value);
    store(CONTRAST_KEY, value);
    persist({ contrast: value });
  }, [persist]);

  const value = useMemo(
    () => ({ theme, contrast, resolvedTheme, palette, setTheme, setContrast, savesToProfile: !!userId }),
    [theme, contrast, resolvedTheme, palette, setTheme, setContrast, userId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
