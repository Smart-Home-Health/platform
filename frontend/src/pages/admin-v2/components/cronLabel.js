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
// Turn a cron expression into something a caregiver can read. Only the forms
// this app's schedule builder produces are handled; anything else falls back
// to the raw expression rather than guessing at it.
//
// Stored crons are UTC (the builders convert on save), so the wall-clock
// hour — and for weekly schedules the day names, when the conversion crosses
// midnight — are converted back to local here. Rendering the raw expression
// showed a 6:00 AM breakfast as "10:00 AM".
import { utcCronToLocalDaysAndTime } from '../../../utils/timezone';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatTime = (hour, minute) => {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, '0')} ${suffix}`;
};

const utcToLocalParts = (hour, minute) => {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return { hour: d.getHours(), minute: d.getMinutes() };
};

export function describeCron(expression) {
  if (!expression) return 'Not scheduled';
  const parts = String(expression).trim().split(/\s+/);
  if (parts.length < 5) return expression;

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  const plainTime = !hour.includes('*') && !minute.includes('*');
  const hours = plainTime ? hour.split(',') : [];
  const minutes = plainTime ? minute.split(',') : [];

  // Times of day, when they are plain values — shown in local time.
  let times = null;
  if (plainTime) {
    const stamps = hours
      .map((h, i) => {
        const local = utcToLocalParts(h, minutes.length === hours.length ? minutes[i] : minutes[0]);
        return local && formatTime(local.hour, local.minute);
      })
      .filter(Boolean);
    if (stamps.length) times = stamps.join(', ');
  }

  let cadence = 'Daily';
  if (dayOfWeek !== '*') {
    // The stored days are UTC days; shift them with the time so a Mon 01:00
    // UTC schedule reads as the Sunday evening it really is.
    let dayNums = dayOfWeek.split(',').map((d) => Number(d) % 7);
    if (plainTime && hours.length === 1) {
      dayNums = utcCronToLocalDaysAndTime(Number(hours[0]), Number(minutes[0]), dayNums).days;
    }
    const days = dayNums.map((d) => DAY_NAMES[d]).filter(Boolean);
    if (days.length === 7) cadence = 'Daily';
    else if (days.length) cadence = days.join(', ');
  } else if (dayOfMonth !== '*') {
    cadence = `Day ${dayOfMonth} monthly`;
  }

  if (!times) {
    // An interval rather than a wall-clock time.
    if (hour.startsWith('*/')) return `${cadence} · every ${hour.slice(2)}h`;
    if (minute.startsWith('*/')) return `${cadence} · every ${minute.slice(2)} min`;
    return cadence;
  }
  return `${cadence} · ${times}`;
}

export default describeCron;
