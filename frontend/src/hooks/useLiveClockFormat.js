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
import { useMemo, useState } from 'react';

const STORAGE_KEY = 'shh_live_clock_format';

export default function useLiveClockFormat() {
  const [hour12, setHour12] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '12h'; }
    catch { return false; }
  });

  // The board ticks every second. Reuse the browser's local-time formatters
  // until the user changes format. h23 renders midnight as 00:00.
  const formatTime = useMemo(() => {
    const hourCycle = hour12 ? 'h12' : 'h23';
    const minutes = new Intl.DateTimeFormat(undefined, { hourCycle, timeStyle: 'short' });
    const seconds = new Intl.DateTimeFormat(undefined, { hourCycle, timeStyle: 'medium' });
    return (time, withSeconds = false) => (withSeconds ? seconds : minutes).format(time);
  }, [hour12]);

  const toggle = () => {
    setHour12(!hour12);
    try { localStorage.setItem(STORAGE_KEY, hour12 ? '24h' : '12h'); }
    catch { /* Embedded browsers can disable storage. */ }
  };

  return { hour12, toggle, formatTime };
}
