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
import { diaryTimeFormat } from './diaryTime';

export function diaryReport(patient, diary, entries, zone) {
  const dateTime = diaryTimeFormat(zone);
  const clock = diaryTimeFormat(zone, false);
  // The offset distinguishes the two occurrences of an hour when clocks fall back.
  const localHour = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', timeZoneName: 'shortOffset',
  });
  const end = diary.ends_at ? dateTime.format(new Date(diary.ends_at)) : 'Ongoing';
  const rows = new Map();
  let previousHour;
  for (const entry of entries) {
    // Match the displayed precision, keeping the two occurrences of a repeated local hour distinct.
    const instant = Date.parse(entry.at);
    const second = Math.floor(instant / 1000);
    const key = `${second}-${entry.source}`;
    if (!rows.has(key)) {
      const hour = localHour.format(instant);
      const showDate = hour !== previousHour;
      const time = (showDate ? dateTime : clock).format(instant);
      rows.set(key, { key, at: entry.at, time, showDate, items: [] });
      previousHour = hour;
    }
    const row = rows.get(key);
    const showLabel = !entry.is_custom && (entry.source === 'observation' || entry.label !== row.items.at(-1)?.entry.label);
    row.items.push({ entry, showLabel, followUp: entry.question && `${entry.question} ${entry.answer || 'Not recorded'}` });
  }
  return {
    title: diary.name,
    patient: [patient.first_name, patient.last_name].filter(Boolean).join(' '),
    period: `${dateTime.format(new Date(diary.starts_at))} – ${end} · ${zone}`,
    rows: Array.from(rows.values()),
  };
}
