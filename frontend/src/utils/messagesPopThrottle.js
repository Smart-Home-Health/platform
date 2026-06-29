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
// Throttle state for the automatic messages pop-up (MessagesAutoPop).
// Lives in sessionStorage keyed by user id so it survives route changes
// (Layout remounts per route) but not a new tab.

const POP_KEY_PREFIX = 'messages_popped_at:';

export function getMessagesPopKey(userId) {
  return `${POP_KEY_PREFIX}${userId}`;
}

/** Forget pop timestamps so the next login pops again (called on logout/user switch). */
export function clearMessagesPopThrottle() {
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith(POP_KEY_PREFIX)) sessionStorage.removeItem(key);
  }
}
