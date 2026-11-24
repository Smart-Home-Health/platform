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
import { stamp } from './diaryTime';

const sources = { medication: 'Medication log', nutrition: 'Nutrition log', care_task: 'Care task log', observation: 'Observation' };

export function diaryReport(patient, diary, entries, zone) {
  const end = diary.ends_at ? stamp(diary.ends_at, zone) : 'Ongoing';
  const rows = new Map();
  for (const entry of entries) {
    // Match the displayed precision, keeping the two occurrences of a repeated local hour distinct.
    const second = Math.floor(Date.parse(entry.at) / 1000);
    const key = `${second}-${entry.source}`;
    if (!rows.has(key)) {
      rows.set(key, { key, at: entry.at, time: stamp(entry.at, zone), source: sources[entry.source], items: [] });
    }
    const { items } = rows.get(key);
    const showLabel = entry.source === 'observation' || entry.label !== items.at(-1)?.entry.label;
    items.push({ entry, showLabel, followUp: entry.question && `${entry.question} ${entry.answer || 'Not recorded'}` });
  }
  return {
    title: diary.name,
    patient: [patient.first_name, patient.last_name].filter(Boolean).join(' '),
    period: `${stamp(diary.starts_at, zone)} – ${end} · ${zone}`,
    rows: Array.from(rows.values()),
  };
}
