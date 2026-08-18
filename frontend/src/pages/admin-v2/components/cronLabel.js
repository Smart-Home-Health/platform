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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatTime = (hour, minute) => {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, '0')} ${suffix}`;
};

export function describeCron(expression) {
  if (!expression) return 'Not scheduled';
  const parts = String(expression).trim().split(/\s+/);
  if (parts.length < 5) return expression;

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  // Times of day, when they are plain values.
  let times = null;
  if (!hour.includes('*') && !minute.includes('*')) {
    const hours = hour.split(',');
    const minutes = minute.split(',');
    const stamps = hours
      .map((h) => formatTime(h, minutes.length === hours.length ? minutes[hours.indexOf(h)] : minutes[0]))
      .filter(Boolean);
    if (stamps.length) times = stamps.join(', ');
  }

  let cadence = 'Daily';
  if (dayOfWeek !== '*') {
    const days = dayOfWeek.split(',')
      .map((d) => DAY_NAMES[Number(d) % 7])
      .filter(Boolean);
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
