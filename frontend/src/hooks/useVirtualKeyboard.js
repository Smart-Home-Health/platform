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
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vkb';

// The live dashboard runs on wall-mounted touchscreens with no physical
// keyboard (kiosk Chrome has no OS on-screen keyboard on Linux), so the
// in-app keyboard defaults ON there. Checked at mount only — the wall unit
// boots straight into /live; client-side navigation into /live picks the
// default up on the next reload. ?vkb=0 still wins, persistently.
const onLiveDashboard = () => {
  const base = (typeof window !== 'undefined' && window.__BASE_PATH__) || '';
  return typeof window !== 'undefined'
    && window.location.pathname.startsWith(`${base}/live`);
};

function readFlag() {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return onLiveDashboard();
}

export function useVirtualKeyboard() {
  const [showVKB, setShowVKB] = useState(readFlag);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vkbParam = params.get('vkb');

    if (vkbParam === '1') {
      window.localStorage.setItem(STORAGE_KEY, '1');
      setShowVKB(true);
    } else if (vkbParam === '0') {
      // Store the refusal rather than clearing: clearing would re-enable the
      // /live route default on the next load.
      window.localStorage.setItem(STORAGE_KEY, '0');
      setShowVKB(false);
    }

    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setShowVKB(readFlag());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { showVKB };
}
