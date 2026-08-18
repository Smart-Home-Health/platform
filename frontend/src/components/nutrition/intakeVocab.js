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
// Frontend half of the intake vocabulary. Mirrors backend/nutrition_vocab.py.

export const INTAKE_TYPES = [
  { value: 'liquid', label: 'Liquid' },
  { value: 'food', label: 'Food' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'tube_feed', label: 'Tube feed' },
];

export const INTAKE_TYPE_LABELS = Object.fromEntries(
  INTAKE_TYPES.map((t) => [t.value, t.label]),
);

// Units offered per type. The first entry is the default when switching type.
export const UNITS_FOR_TYPE = {
  liquid: ['ml', 'oz', 'cups', 'liters'],
  food: ['grams', 'oz', 'servings', 'pieces'],
  supplement: ['servings', 'scoops', 'pieces', 'ml', 'grams'],
  tube_feed: ['ml', 'oz'],
};

// Intake types that count toward fluid totals. 'hydration' is a legacy value
// from before schedule types were normalized.
export const FLUID_ITEM_TYPES = new Set(['liquid', 'tube_feed', 'hydration']);

/**
 * Nutrition figures for `amount` of a saved item, from its per-unit profile.
 * Returns form-shaped strings so it can be spread straight into setState.
 */
export function scaleNutrition(item, amount) {
  const scale = (perUnit) => {
    if (perUnit == null || !amount) return '';
    const total = Number(perUnit) * Number(amount);
    if (!Number.isFinite(total)) return '';
    // Trim float noise without forcing decimals onto whole numbers.
    return String(Number(total.toFixed(2)));
  };
  return {
    calories: scale(item.calories_per_unit),
    protein: scale(item.protein_per_unit),
    carbs: scale(item.carbs_per_unit),
    fat: scale(item.fat_per_unit),
    fiber: scale(item.fiber_per_unit),
    sodium: scale(item.sodium_per_unit),
  };
}

/**
 * One-line description of the entry being composed, for the preview row.
 */
export function describeIntake(form) {
  const name = (form.itemName || '').trim();
  if (!name) return { title: '', detail: '' };

  const amount = String(form.amount ?? '').trim();
  const parts = [];
  if (amount) parts.push(`${amount} ${form.amountUnit || ''}`.trim());
  if (form.mealType) {
    parts.push(form.mealType.charAt(0).toUpperCase() + form.mealType.slice(1));
  }
  if (form.itemType === 'tube_feed') {
    if (form.feedRoute) parts.push(form.feedRoute);
    if (String(form.rateMlPerHr ?? '').trim()) parts.push(`${form.rateMlPerHr} mL/hr`);
    else if (String(form.durationMinutes ?? '').trim()) parts.push(`${form.durationMinutes} min`);
  }
  if (String(form.calories ?? '').trim()) parts.push(`${form.calories} kcal`);

  return { title: name, detail: parts.join(' · ') };
}
