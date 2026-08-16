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
// Honest connection status: navigator.onLine + a lightweight poll of the
// public liveness probe. There is no offline write queue (v1), so OFFLINE
// disables saving rather than pretending to sync.
import { useCallback, useEffect, useRef, useState } from 'react';
import config, { apiFetch } from '../../config';

const POLL_MS = 30000;

export default function useConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSuccess, setLastSuccess] = useState(null);
  const timerRef = useRef(null);

  const ping = useCallback(async () => {
    try {
      const resp = await apiFetch(`${config.apiUrl}/api/status/health`);
      if (resp.ok) {
        setLastSuccess(new Date());
        setOnline(true);
        return true;
      }
      return false;
    } catch {
      setOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    const up = () => { setOnline(true); ping(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    ping();
    timerRef.current = setInterval(ping, POLL_MS);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      clearInterval(timerRef.current);
    };
  }, [ping]);

  // A successful save elsewhere counts as proof of connectivity.
  const markSuccess = useCallback(() => {
    setLastSuccess(new Date());
    setOnline(true);
  }, []);

  return { connected: online, lastSuccess, markSuccess };
}
