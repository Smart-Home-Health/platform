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
// Shared helper for the HTTPS setup UI (wizard + Security page).
export function canonicalHttpsUrl(domain, publicPort) {
  if (!domain) return null;
  const port = Number(publicPort) === 443 ? '' : `:${publicPort}`;
  return `https://${domain}${port}`;
}

// A ready-to-use DuckDNS name (their rule: A-Z, 0-9, '-'). Ambiguous
// characters are left out so the name survives being read off a screen.
export function generateSubdomain() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  const rand = new Uint32Array(6);
  (globalThis.crypto || {}).getRandomValues?.(rand);
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[(rand[i] ?? Math.floor(Math.random() * chars.length)) % chars.length];
  }
  return `shh-${suffix}`;
}
