/*
 * Smart Home Health Hub
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
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { apiFetch, API_BASE_URL } from '../config';

const STORAGE_KEY = 'theme';            // "light" | "dark" | "system"
const VALID = ['light', 'dark', 'system'];

const ThemeContext = createContext();

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};

const getStored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(v) ? v : null;
  } catch {
    return null;
  }
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

// Resolve a stored choice ("system") to a concrete "light"/"dark".
const resolve = (theme) => (theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme);

// Apply the resolved theme class to <html> and sync the address-bar color.
// Mirrors the inline boot script in index.html (which runs before React mounts).
const applyTheme = (theme) => {
  const resolved = resolve(theme);
  const el = document.documentElement;
  el.classList.remove('light', 'dark');
  el.classList.add(resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#161b22' : '#ffffff');
};

export const ThemeProvider = ({ children }) => {
  const { user } = useAuth();
  const [theme, setThemeState] = useState(() => getStored() || 'system');

  // Apply whenever the choice changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // While in "system" mode, follow live OS appearance changes.
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Backend is the per-user source of truth: adopt the user's saved choice on login.
  useEffect(() => {
    const pref = user?.preferences?.theme;
    if (pref && VALID.includes(pref)) {
      setThemeState(pref);
      try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* ignore */ }
    }
  }, [user]);

  const setTheme = useCallback((value) => {
    if (!VALID.includes(value)) return;
    setThemeState(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
    // Persist per-user (best-effort; localStorage already gave an instant result).
    if (user?.id) {
      apiFetch(`${API_BASE_URL}/api/auth/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: { theme: value } }),
      }).catch(() => { /* offline / transient — localStorage still holds the choice */ });
    }
  }, [user]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme: resolve(theme) }}>
      {children}
    </ThemeContext.Provider>
  );
};
