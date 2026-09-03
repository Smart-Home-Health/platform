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
// Status helpers for supplies, kept out of the component files so fast
// refresh stays happy and the modal/test can share them.

/** A scheduled item whose computed due date is today or earlier. */
export function isDue(item) {
  if (!item?.scheduled_replacement || !item.due_date) return false;
  return new Date(item.due_date) <= new Date();
}

/** "Aug 22, 2:14 PM" in the viewer's locale; dash when missing. */
export function formatChangedAt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
