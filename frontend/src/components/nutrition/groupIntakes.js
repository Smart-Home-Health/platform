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
// One feed is stored as one intake row per item (formula + juices +
// smoothies, an applied preset's components). This is THE place that puts
// those rows back together for display — the same event_group_id contract as
// groupOutputs.js.
import { FLUID_ITEM_TYPES } from './intakeVocab';

const toMl = (amount, unit) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  const u = String(unit || 'ml').toLowerCase();
  if (u === 'oz' || u === 'ounces') return n * 29.5735;
  if (u === 'cup' || u === 'cups') return n * 236.588;
  if (u === 'liter' || u === 'liters' || u === 'l') return n * 1000;
  if (u === 'ml') return n;
  return 0;
};

/**
 * Group intake rows into logged events, newest first.
 *
 * @returns {Array<{key: string, members: Array, time: string, isMerged: boolean,
 *                  totalCalories: number, totalFluidMl: number}>}
 */
export function groupIntakeEvents(intakes = []) {
  const groups = new Map();

  for (const intake of intakes) {
    // Rows written before event_group_id existed stand alone.
    const key = intake.event_group_id || `row-${intake.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(intake);
  }

  return [...groups.entries()]
    .map(([key, members]) => {
      const sorted = [...members].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
      const totalCalories = sorted.reduce(
        (sum, m) => sum + (Number.isFinite(Number(m.calories)) ? Number(m.calories) : 0), 0,
      );
      const totalFluidMl = sorted.reduce(
        (sum, m) => sum + (FLUID_ITEM_TYPES.has(m.item_type) ? toMl(m.amount, m.amount_unit) : 0), 0,
      );
      return {
        key,
        members: sorted,
        time: sorted[0].consumed_at,
        isMerged: sorted.length > 1,
        totalCalories,
        totalFluidMl,
      };
    })
    .sort((a, b) => new Date(b.time) - new Date(a.time));
}

/** Display label for an event: the item name, or "Feed (3 items)". */
export function intakeEventLabel(event) {
  if (!event.isMerged) return event.members[0].item_name;
  return `Feed (${event.members.length} items)`;
}
