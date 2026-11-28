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
import { parseScheduleTimestamp } from '../../utils/timezone';

export const durationUnits = { minutes: 1, hours: 60, days: 1440 };

export function displayUnit(minutes) {
  if (minutes != null && minutes >= 1440 && minutes % 1440 === 0) return 'days';
  if (minutes != null && (minutes < 60 || minutes % 15 !== 0)) return 'minutes';
  return 'hours';
}

export function formatMissedWindow(minutes) {
  const unit = displayUnit(minutes);
  const amount = minutes / durationUnits[unit];
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
}

export function validMissedWindow(minutes) {
  return minutes == null || (Number.isSafeInteger(minutes) && minutes > 0 && minutes <= 2147483647);
}

export function reminderDateLabel(value) {
  return parseScheduleTimestamp(value)?.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}
