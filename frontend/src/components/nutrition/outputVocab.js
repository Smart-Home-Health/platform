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
// Frontend half of the output vocabulary. Mirrors backend/nutrition_vocab.py —
// keep the two in step; the backend is the authority on what gets stored.

export const LOCATIONS = [
  { value: 'restroom', label: 'Restroom' },
  { value: 'diaper', label: 'Diaper' },
  { value: 'catheter', label: 'Catheter' },
  { value: 'accident', label: 'Accident' },
];

export const LOCATION_LABELS = Object.fromEntries(
  LOCATIONS.map((l) => [l.value, l.label]),
);

// Bristol stool scale 1-7.
export const BRISTOL_LABELS = {
  1: 'Separate hard lumps',
  2: 'Lumpy / sausage',
  3: 'Cracked sausage',
  4: 'Smooth / soft',
  5: 'Soft blobs',
  6: 'Mushy / ragged',
  7: 'Watery',
};

// Legacy free-text consistency -> Bristol number, for rows written before the
// scale existed. 'diarrhea' has no distinct number and folds into 7.
const CONSISTENCY_TO_BRISTOL = {
  pellets: 1,
  constipated: 2,
  solid: 4,
  soft: 5,
  loose: 6,
  watery: 7,
  diarrhea: 7,
};

export function bristolFor(consistency) {
  if (!consistency) return null;
  return CONSISTENCY_TO_BRISTOL[String(consistency).toLowerCase()] ?? null;
}

const titleCase = (value) => (value
  ? String(value).charAt(0).toUpperCase() + String(value).slice(1).replace(/_/g, ' ')
  : '');

/**
 * One-line description of the event being composed, for the sheet's preview
 * row. Purely descriptive — it restates what was entered and nothing more.
 */
export function describeEvent(form) {
  const kinds = [];
  if (form.hasUrine) kinds.push('Urine');
  if (form.hasStool) kinds.push('Stool');

  const title = [
    LOCATION_LABELS[form.location] || 'Output',
    kinds.join(' + '),
  ].filter(Boolean).join(' · ');

  const parts = [];
  if (form.hasUrine) {
    if (form.location === 'diaper' && form.wetness) parts.push(titleCase(form.wetness));
    if (form.clarity) parts.push(titleCase(form.clarity));
    const amount = String(form.urineAmount || '').trim();
    if (amount) parts.push(`${amount} ${form.urineAmountUnit || 'mL'}`);
  }
  if (form.hasStool) {
    if (form.stoolAmount) parts.push(titleCase(form.stoolAmount));
    if (form.bristol) parts.push(`Bristol ${form.bristol}`);
    if (form.color) parts.push(titleCase(form.color));
  }

  const concerns = [];
  if (form.has_blood) concerns.push('Blood');
  if (form.has_mucus) concerns.push('Mucus');
  if (form.pain_reported) concerns.push('Pain');
  if (form.straining) concerns.push('Straining');
  if (concerns.length) parts.push(concerns.join(' / '));

  return { title, detail: parts.join(' · ') };
}
