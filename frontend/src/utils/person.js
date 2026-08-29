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
// How a person is named and abbreviated, in one place. Every avatar site used
// to carry its own copy of this and they disagreed about what two letters to
// show; now initials are only the last-resort fallback (no id, no seed), and
// they are the first and last word so "Mary Ann Smith" is MS, not MA.

/** Best display name for a string or any person-shaped object
 * ({full_name}|{first_name,last_name}|{name}|{username}). */
export function displayName(input) {
  if (!input) return '';
  if (typeof input === 'string') return input.trim();
  if (input.full_name) return String(input.full_name).trim();
  if (input.first_name || input.last_name) {
    return [input.first_name, input.last_name].filter(Boolean).join(' ').trim();
  }
  return String(input.name || input.username || '').trim();
}

/** Up to two uppercase letters (first word + last word), '' when nameless. */
export function initialsOf(input) {
  const parts = displayName(input).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const letters = parts.length === 1
    ? parts[0].slice(0, 1)
    : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}

/** The seed the generated avatar is drawn from: the stored override if an
 * administrator shuffled it, else a stable "<kind>:<id>". Null when there is
 * nothing stable to hash — the caller falls back to initials. */
export function avatarSeed(kind, id, seed) {
  if (seed) return String(seed);
  if (id === null || id === undefined || id === '') return null;
  return `${kind}:${id}`;
}
