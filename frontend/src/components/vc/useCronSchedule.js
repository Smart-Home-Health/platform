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
// Repeat pattern, days and time for a schedule, converted to and from the UTC
// cron the API stores.
//
// This had been written out three times — the nutrition schedule form, the
// care-task schedule dialog, and the orphaned CareTaskScheduleView — each with
// its own copy of the midnight-crossing day shift that makes weekly schedules
// correct. One copy now.
import { useCallback, useMemo, useState } from 'react';
import {
  localTimeToUTC, localTimeAndDaysToUTC, utcCronToLocalDaysAndTime,
} from '../../utils/timezone';

export const DAYS = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export const REPEAT_MODES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const pad = (n) => String(n).padStart(2, '0');

/** The stored UTC hour/minute as a local HH:MM string. */
const utcToLocalTime = (hour, minute) => {
  const d = new Date();
  d.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Human summary of the current selection, for a preview line. */
export function describeSelection({ mode, days, dayOfMonth, time }) {
  const [h, m] = String(time || '').split(':');
  const hour = Number(h);
  const stamp = Number.isFinite(hour)
    ? `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
    : time;

  if (mode === 'weekly') {
    const named = DAYS.filter((d) => days.includes(d.value)).map((d) => d.label);
    if (!named.length) return 'No days selected';
    const label = named.length === 7 ? 'Daily' : named.join(', ');
    return `${label} · ${stamp}`;
  }
  if (mode === 'monthly') return `Day ${dayOfMonth} monthly · ${stamp}`;
  return `Daily · ${stamp}`;
}

/**
 * Schedule timing state, seeded from an existing cron expression.
 *
 * @param {string|null} cronExpression stored UTC cron, or null for a new one
 * @param {boolean} open reseed whenever the form reopens
 */
export function useCronSchedule(cronExpression, open) {
  const [mode, setMode] = useState('daily');
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [time, setTime] = useState('08:00');

  const reset = useCallback((cron) => {
    if (!cron) {
      setMode('daily'); setDays([1, 2, 3, 4, 5]); setDayOfMonth(1); setTime('08:00');
      return;
    }
    const parts = String(cron).trim().split(/\s+/);
    if (parts.length < 5) return;
    const [minute, hour, dom, , dow] = parts;

    if (dom !== '*') {
      setMode('monthly');
      setDayOfMonth(parseInt(dom, 10) || 1);
      setTime(utcToLocalTime(hour, minute));
    } else if (dow !== '*') {
      // Days and time convert together: shifting the time across midnight
      // moves which day the schedule lands on.
      const utcDays = dow.split(',').map((d) => parseInt(d, 10));
      const local = utcCronToLocalDaysAndTime(parseInt(hour, 10), parseInt(minute, 10), utcDays);
      setMode('weekly');
      setDays(local.days);
      setTime(local.time);
    } else {
      setMode('daily');
      setTime(utcToLocalTime(hour, minute));
    }
  }, []);

  /** The UTC cron for the current selection, or null if it is incomplete. */
  const build = useCallback(() => {
    if (mode === 'weekly') {
      if (!days.length) return null;
      const utc = localTimeAndDaysToUTC(time, days);
      return `${utc.minute} ${utc.hour} * * ${utc.days.join(',')}`;
    }
    const utc = localTimeToUTC(time);
    if (mode === 'monthly') return `${utc.minute} ${utc.hour} ${dayOfMonth} * *`;
    return `${utc.minute} ${utc.hour} * * *`;
  }, [mode, days, dayOfMonth, time]);

  const summary = useMemo(
    () => describeSelection({ mode, days, dayOfMonth, time }),
    [mode, days, dayOfMonth, time],
  );

  const valid = mode !== 'weekly' || days.length > 0;

  return {
    mode, setMode, days, setDays, dayOfMonth, setDayOfMonth, time, setTime,
    reset, build, summary, valid,
    // Seeded on open so a reopened form never shows the last one's timing.
    seed: () => { if (open) reset(cronExpression); },
  };
}

export default useCronSchedule;
