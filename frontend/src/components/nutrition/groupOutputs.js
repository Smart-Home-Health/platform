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
// One physical bathroom event is stored as one row per output type. This is
// THE place that puts those rows back together.
//
// It used to be four places, each re-guessing the association from a
// three-minute time window with slightly different rules — one compared
// against the group's first row, another against its last, and all of them
// only ever grouped diapers. The same event could therefore render merged in
// one view and split in another, and a restroom visit that produced both urine
// and stool always showed up as two entries. Rows now carry an
// event_group_id and this reads it.
import { LOCATION_LABELS } from './outputVocab';

/**
 * Group output rows into events, newest first.
 *
 * @returns {Array<{key: string, members: Array, time: string, isMerged: boolean}>}
 */
export function groupOutputEvents(outputs = []) {
  const groups = new Map();

  for (const output of outputs) {
    // Rows written before event_group_id existed stand alone.
    const key = output.event_group_id || `row-${output.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(output);
  }

  return [...groups.entries()]
    .map(([key, members]) => {
      const sorted = [...members].sort(
        (a, b) => new Date(a.occurred_at) - new Date(b.occurred_at),
      );
      return {
        key,
        members: sorted,
        time: sorted[0].occurred_at,
        isMerged: sorted.length > 1,
      };
    })
    .sort((a, b) => new Date(b.time) - new Date(a.time));
}

/** Location of an event, from the column or the legacy booleans. */
export function eventLocation(output) {
  if (!output) return 'restroom';
  if (output.location) return output.location;
  if (output.is_catheter) return 'catheter';
  if (output.is_diaper) return 'diaper';
  if (output.is_accident) return 'accident';
  return 'restroom';
}

/** Display label for an event: "Mixed diaper (urine + stool)", "Restroom". */
export function eventLabel(event) {
  const location = eventLocation(event.members[0]);
  const label = LOCATION_LABELS[location] || 'Output';
  if (!event.isMerged) {
    const type = event.members[0].output_type;
    return `${label} · ${type === 'bowel' ? 'Stool' : type.charAt(0).toUpperCase() + type.slice(1)}`;
  }
  const types = event.members
    .map((m) => (m.output_type === 'bowel' ? 'stool' : m.output_type))
    .join(' + ');
  return `Mixed ${label.toLowerCase()} (${types})`;
}

/** Concern flags set anywhere in the event. */
export function eventConcerns(event) {
  const flags = [];
  const any = (field) => event.members.some((m) => m[field]);
  if (any('has_blood')) flags.push('Blood');
  if (any('has_mucus')) flags.push('Mucus');
  if (any('pain_reported')) flags.push('Pain');
  if (any('straining')) flags.push('Straining');
  return flags;
}
