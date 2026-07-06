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
// Tiny sessionStorage JSON helpers for in-progress workflow state.
//
// Mobile browsers discard background tabs freely — switching to Photos
// mid-import and back reloads the SPA and wipes React state. sessionStorage
// survives those reloads (it lives for the tab's session), so checkpointing
// here lets a half-finished import pick up where it left off. It does NOT
// survive closing the tab, which is the right scope: abandoned sessions
// don't haunt tomorrow's work.

const PREFIX = 'shh:';

export function sessionGet(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private mode / quota / corrupt entry — behave as unset
  }
}

/** Set a value; null/undefined removes the entry. */
export function sessionSet(key, value) {
  try {
    if (value === null || value === undefined) {
      sessionStorage.removeItem(PREFIX + key);
    } else {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    }
  } catch {
    // Storage full or unavailable: the feature degrades to pre-persistence
    // behavior instead of breaking the flow.
  }
}

export function sessionClear(...keys) {
  for (const key of keys) sessionSet(key, null);
}
