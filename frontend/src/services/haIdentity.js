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
// Home Assistant identity mapping (system-admin only endpoints).
import { apiFetch, API_BASE_URL } from '../config';

const base = () => `${API_BASE_URL}/api/auth/ha`;

async function asJsonOrThrow(res, fallback) {
  if (res.ok) return res.status === 204 ? null : res.json();
  let detail = fallback;
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') detail = body.detail;
  } catch { /* non-JSON error body */ }
  const err = new Error(detail);
  err.status = res.status;
  throw err;
}

export async function listHaIdentities() {
  return asJsonOrThrow(await apiFetch(`${base()}/identities`), 'Failed to load Home Assistant identities');
}

// Merged directory: everyone in HA (when running as the add-on) plus
// identities seen on ingress and mapped users. {available, users: [...]}.
export async function getHaDirectory() {
  return asJsonOrThrow(await apiFetch(`${base()}/directory`), 'Failed to load the Home Assistant user directory');
}

// Create a passwordless app user pre-linked to an HA identity.
export async function importHaUser({ ha_user_id, username, full_name, role_ids = [] }) {
  return asJsonOrThrow(
    await apiFetch(`${base()}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ha_user_id, username, full_name, role_ids }),
    }),
    'Failed to import Home Assistant user',
  );
}

export async function linkHaIdentity(haUserId, userId) {
  return asJsonOrThrow(
    await apiFetch(`${base()}/identities/${haUserId}/link`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    }),
    'Failed to link identity',
  );
}

export async function unlinkHaIdentity(haUserId) {
  return asJsonOrThrow(
    await apiFetch(`${base()}/identities/${haUserId}/link`, { method: 'DELETE' }),
    'Failed to unlink identity',
  );
}

export async function forgetHaIdentity(haUserId) {
  return asJsonOrThrow(
    await apiFetch(`${base()}/identities/${haUserId}`, { method: 'DELETE' }),
    'Failed to remove identity',
  );
}
