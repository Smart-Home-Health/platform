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
// Row helpers for the multi-item feed editor. A "row" is the editor's
// camelCase working shape for one item of a feed; these build rows from the
// places items come from (saved library items, OpenFoodFacts suggestions,
// schedule components, free text) and turn them back into API payloads.
import { nutritionService } from '../../services/nutrition';
import { FLUID_ITEM_TYPES } from './intakeVocab';

export const FACT_FIELDS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sodium'];
export const PER_UNIT_KEYS = {
  calories: 'calories_per_unit',
  protein: 'protein_per_unit',
  carbs: 'carbs_per_unit',
  fat: 'fat_per_unit',
  fiber: 'fiber_per_unit',
  sodium: 'sodium_per_unit',
};

export const numberOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export const factString = (value) => {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return String(Number(Number(value).toFixed(2)));
};

/** Totals for `amount` of a row that carries per-unit facts. */
export const scaledFacts = (perUnit, amount) => {
  const out = {};
  const n = Number(amount);
  for (const field of FACT_FIELDS) {
    const per = perUnit?.[PER_UNIT_KEYS[field]];
    out[field] = (per == null || !n) ? '' : factString(Number(per) * n);
  }
  return out;
};

export const toMl = (amount, unit) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  const u = String(unit || 'ml').toLowerCase();
  if (u === 'oz' || u === 'ounces') return n * 29.5735;
  if (u === 'cup' || u === 'cups') return n * 236.588;
  if (u === 'liter' || u === 'liters' || u === 'l') return n * 1000;
  if (u === 'ml') return n;
  return 0;
};

/** What a scheduled feed is meant to deliver — the meal-builder's target.
 *
 * Computed from the feed's component mix (calories from the scaled facts,
 * fluid by the unit), falling back to the legacy single default. This is the
 * spreadsheet's "525" cell: the total the mix being poured has to reach.
 */
export function feedTarget(feed) {
  if (!feed) return null;
  let calories = 0;
  let fluidMl = 0;
  if (feed.components?.length) {
    for (const comp of feed.components) {
      calories += Number(comp.calories) || 0;
      if (!comp.item_type || FLUID_ITEM_TYPES.has(comp.item_type)) {
        fluidMl += toMl(comp.amount, comp.amount_unit);
      }
    }
  } else {
    calories = Number(feed.default_calories) || 0;
    fluidMl = toMl(feed.default_amount, feed.default_amount_unit);
  }
  if (!calories && !fluidMl) return null;
  return { calories, fluidMl };
}

/** Running totals of the rows being built, matched against feedTarget. */
export function rowsTotals(rows = []) {
  let calories = 0;
  let fluidMl = 0;
  for (const row of rows) {
    calories += numberOrNull(row.calories) || 0;
    if (FLUID_ITEM_TYPES.has(row.itemType)) {
      fluidMl += toMl(numberOrNull(row.amount), row.amountUnit);
    }
  }
  return { calories, fluidMl };
}

let rowSeq = 0;
const nextKey = () => `item-${Date.now()}-${rowSeq += 1}`;

export function makeItemRow(patch = {}) {
  return {
    key: nextKey(),
    itemId: null,
    itemName: '',
    itemType: 'liquid',
    amount: '',
    amountUnit: 'ml',
    feedRoute: '',
    rateMlPerHr: '',
    durationMinutes: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: '',
    sodium: '',
    perUnit: null,
    saveAsItem: false,
    barcode: null,
    // Schedule mix only: the post-feed flush, given after the meal.
    isFlush: false,
    ...patch,
  };
}

/** Row from a saved library item, facts scaled to its default amount. */
export function rowFromSavedItem(item) {
  const amount = item.default_amount ?? '';
  const perUnit = Object.fromEntries(
    Object.values(PER_UNIT_KEYS).map((k) => [k, item[k] ?? null]),
  );
  return makeItemRow({
    itemId: item.id,
    itemName: item.name,
    itemType: item.item_type || 'liquid',
    amount: amount === '' ? '' : String(amount),
    amountUnit: item.default_amount_unit || 'ml',
    perUnit,
    ...scaledFacts(perUnit, amount),
  });
}

/** Row from an OpenFoodFacts suggestion; flagged to save into the library. */
export function rowFromSuggestion(suggestion) {
  const amount = suggestion.default_amount ?? '';
  const perUnit = Object.fromEntries(
    Object.values(PER_UNIT_KEYS).map((k) => [k, suggestion[k] ?? null]),
  );
  return makeItemRow({
    itemName: suggestion.name,
    itemType: suggestion.item_type || 'liquid',
    amount: amount === '' ? '' : String(amount),
    amountUnit: suggestion.default_amount_unit || 'ml',
    perUnit,
    saveAsItem: true,
    barcode: suggestion.barcode || null,
    ...scaledFacts(perUnit, amount),
  });
}

/** Row from a schedule component (the daily feed's prefill dicts, which carry
 *  already-scaled totals). Per-unit facts are derived so amount tweaks rescale. */
export function rowFromScheduleComponent(component) {
  const amount = Number(component.amount) || 0;
  const perUnit = {};
  for (const field of FACT_FIELDS) {
    const totalKey = field === 'calories' ? 'calories'
      : field === 'sodium' ? 'sodium_mg' : `${field}_grams`;
    const total = component[totalKey];
    perUnit[PER_UNIT_KEYS[field]] = (total != null && amount > 0) ? Number(total) / amount : null;
  }
  return makeItemRow({
    itemId: component.item_id ?? null,
    itemName: component.item_name || '',
    itemType: component.item_type || 'liquid',
    amount: component.amount != null ? String(component.amount) : '',
    amountUnit: component.amount_unit || 'ml',
    feedRoute: component.feed_route || '',
    rateMlPerHr: component.rate_ml_per_hr != null ? String(component.rate_ml_per_hr) : '',
    durationMinutes: component.duration_minutes != null ? String(component.duration_minutes) : '',
    perUnit,
    ...scaledFacts(perUnit, amount),
  });
}

/** Row from a NutritionScheduleComponentResponse (per-unit facts inline). */
export function rowFromComponentResponse(component) {
  const perUnit = Object.fromEntries(
    Object.values(PER_UNIT_KEYS).map((k) => [k, component[k] ?? null]),
  );
  return makeItemRow({
    isFlush: !!component.is_flush,
    itemId: component.item_id,
    itemName: component.item_name || '',
    itemType: component.item_type || 'liquid',
    amount: component.amount != null ? String(component.amount) : '',
    amountUnit: component.amount_unit || 'ml',
    feedRoute: component.feed_route || '',
    rateMlPerHr: component.rate_ml_per_hr != null ? String(component.rate_ml_per_hr) : '',
    durationMinutes: component.duration_minutes != null ? String(component.duration_minutes) : '',
    perUnit,
    ...scaledFacts(perUnit, component.amount),
  });
}

// Mirrors backend SCHEDULE_TYPE_TO_ITEM_TYPE for the legacy single-row prefill.
const SCHEDULE_ITEM_TYPE = {
  meal: 'food',
  snack: 'food',
  hydration: 'liquid',
  supplement: 'supplement',
  tube_feed: 'tube_feed',
};

/** Editor rows for a daily-board schedule row: the component mix when the
 *  schedule has one, else its legacy single default. THE prefill for every
 *  completion form — the admin dialog, the dashboard pane, and the Log
 *  Intake feed link all seed from here so they cannot drift. */
export function rowsFromScheduleRow(row) {
  if (row.components?.length) return row.components.map(rowFromScheduleComponent);
  // A dynamic water spot prefills today's suggestion (what is left of the
  // fluid goal), not its nominal default — including a suggested 0.
  const amount = (row.fluid_dynamic && row.suggested_amount != null)
    ? row.suggested_amount
    : row.default_amount;
  if (row.default_item || amount != null) {
    return [makeItemRow({
      itemName: row.default_item || row.name || '',
      itemType: SCHEDULE_ITEM_TYPE[row.schedule_type] || 'liquid',
      amount: amount != null ? String(amount) : '',
      amountUnit: row.default_amount_unit || 'ml',
      calories: row.default_calories != null ? String(row.default_calories) : '',
    })];
  }
  return [];
}

export function rowIsValid(row) {
  return !!String(row.itemName || '').trim() && numberOrNull(row.amount) !== null;
}

/** A row as the API's intake item shape. */
export function rowToItemPayload(row) {
  return {
    item_id: row.itemId ?? null,
    item_name: String(row.itemName || '').trim(),
    item_type: row.itemType,
    amount: numberOrNull(row.amount),
    amount_unit: row.amountUnit,
    // Delivery detail is not gated on the tube_feed type: for a tube-fed
    // patient the whole mix runs through the pump, and items are not always
    // typed tube_feed — the rate is what times the post-feed flush.
    feed_route: row.feedRoute || null,
    rate_ml_per_hr: numberOrNull(row.rateMlPerHr),
    duration_minutes: numberOrNull(row.durationMinutes),
    calories: numberOrNull(row.calories),
    protein_grams: numberOrNull(row.protein),
    carbs_grams: numberOrNull(row.carbs),
    fat_grams: numberOrNull(row.fat),
    fiber_grams: numberOrNull(row.fiber),
    sodium_mg: numberOrNull(row.sodium),
  };
}

/** A row as a schedule/preset component payload. */
export function rowToComponentPayload(row, sortOrder) {
  return {
    is_flush: !!row.isFlush,
    item_id: row.itemId,
    amount: numberOrNull(row.amount),
    amount_unit: row.amountUnit,
    feed_route: row.feedRoute || null,
    rate_ml_per_hr: numberOrNull(row.rateMlPerHr),
    duration_minutes: numberOrNull(row.durationMinutes),
    sort_order: sortOrder,
  };
}

/** Persist rows flagged save-as-item into the library (best effort). */
export async function saveRowsAsItems(rows, patientId) {
  for (const row of rows) {
    if (!row.saveAsItem || row.itemId) continue;
    const amount = numberOrNull(row.amount) || 1;
    const per = (value) => {
      const total = numberOrNull(value);
      return total === null ? null : Number((total / amount).toFixed(4));
    };
    try {
      await nutritionService.createItem({
        patient_id: patientId,
        name: String(row.itemName || '').trim(),
        item_type: row.itemType,
        default_amount: amount,
        default_amount_unit: row.amountUnit,
        calories_per_unit: per(row.calories),
        protein_per_unit: per(row.protein),
        carbs_per_unit: per(row.carbs),
        fat_per_unit: per(row.fat),
        fiber_per_unit: per(row.fiber),
        sodium_per_unit: per(row.sodium),
        ...(row.barcode ? { barcode: row.barcode } : {}),
      });
    } catch {
      // A duplicate name is not worth losing the logged intake over.
    }
  }
}
