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
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getSetting } from '../services/settings';
import { apiFetch, API_BASE_URL } from '../config';

/**
 * Idle auto-lock for the admin UI.
 *
 * After 5 minutes of inactivity while fully authenticated, drop server-side
 * full auth (clear session_token, keep the 24h account_token) and send the
 * user to the configured lock target — user-select by default, or the live
 * dashboard when `idle_lock_target` is set to 'live'.
 *
 * Re-uses the activity pattern from PinChallengeContext (ref-based deadline,
 * rollforward on mouse/touch/key, 30s tick). Self-gates: only arms while
 * authLevel === 'full' and not already on an auth/live route, so it never
 * fights the live dashboard's PIN challenge or locks an already-locked session.
 */

const IDLE_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;

// Routes where the idle lock should NOT run.
const EXEMPT_PREFIXES = ['/live', '/login', '/select-user', '/first-login'];

export function IdleLockProvider({ children }) {
  const { authLevel, checkSession } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const lastActivityRef = useRef(Date.now());
  const lockingRef = useRef(false);
  const lockTargetRef = useRef('select-user');

  const isExempt = EXEMPT_PREFIXES.some((p) => location.pathname.startsWith(p));
  const armed = authLevel === 'full' && !isExempt;

  // Load the configured lock target once we're fully authed (settings need auth).
  useEffect(() => {
    if (authLevel !== 'full') return;
    let cancelled = false;
    getSetting('idle_lock_target', 'select-user').then((value) => {
      if (!cancelled && (value === 'live' || value === 'select-user')) {
        lockTargetRef.current = value;
      }
    });
    return () => { cancelled = true; };
  }, [authLevel]);

  const lock = useCallback(async () => {
    if (lockingRef.current) return;
    lockingRef.current = true;
    try {
      await apiFetch(`${API_BASE_URL}/api/auth/lock`, { method: 'POST' });
      await checkSession();
      navigate(lockTargetRef.current === 'live' ? '/live' : '/select-user', { replace: true });
    } catch (err) {
      console.error('Idle lock failed:', err);
    } finally {
      lockingRef.current = false;
    }
  }, [checkSession, navigate]);

  // Reset the idle deadline whenever we (re)arm — e.g. fresh login or moving
  // back into an admin route — so we never lock immediately on entry.
  useEffect(() => {
    if (armed) lastActivityRef.current = Date.now();
  }, [armed, location.pathname]);

  // Roll the deadline forward on activity, but only while armed.
  useEffect(() => {
    if (!armed) return;
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    document.addEventListener('mousedown', onActivity, { passive: true });
    document.addEventListener('touchstart', onActivity, { passive: true });
    document.addEventListener('keydown', onActivity);
    return () => {
      document.removeEventListener('mousedown', onActivity);
      document.removeEventListener('touchstart', onActivity);
      document.removeEventListener('keydown', onActivity);
    };
  }, [armed]);

  // Tick: fire the lock once the idle window has elapsed.
  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_MS) {
        lock();
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [armed, lock]);

  return children;
}
