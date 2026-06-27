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

function readFlag() {
  return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
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
      window.localStorage.removeItem(STORAGE_KEY);
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
