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

/* Wording per section for the shared schedule panel. The structure is
 * identical for medications and care tasks — only the nouns and the primary
 * verb change, so the layout has one implementation and two vocabularies. */

export const DOSE_LABELS = {
  one: 'medication', many: 'medications',
  nameColumn: 'Medication', metaColumn: 'Dose',
  primary: 'Record dose', bulk: 'Record all',
  notePlaceholder: 'Anything worth recording with this dose',
};

export const TASK_LABELS = {
  one: 'task', many: 'tasks',
  nameColumn: 'Task', metaColumn: 'Category',
  primary: 'Mark done', bulk: 'Complete all',
  notePlaceholder: 'Anything worth recording with this task',
};

export const NUTRITION_LABELS = {
  one: 'item', many: 'items',
  nameColumn: 'Item', metaColumn: 'Amount',
  primary: 'Mark taken', bulk: 'Mark all taken',
  notePlaceholder: 'Anything worth recording with this item',
};
