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
// Loads one user and, on request, the extra reads a section needs. Sub-pages
// ask only for what they render, so opening Security does not fetch every care
// profile in the account.
import { useCallback, useEffect, useState } from 'react';
import config, { apiFetch } from '../../../config';
import { useAuth } from '../../../contexts/AuthContext';
import { listHaIdentities } from '../../../services/haIdentity';

const jsonOr = async (res, fallback) => (res.ok ? res.json() : fallback);

// FastAPI returns `detail` as a string for our own errors and as a list of
// objects for validation failures; stringifying the list renders "[object
// Object]".
export const detailText = (detail, fallback) => {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => d?.msg || d?.message).filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  return fallback;
};

const send = async (url, options, fallback) => {
  const res = await apiFetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(detailText(body.detail, fallback));
  return body;
};

export const updateUser = (userId, payload) => send(
  `${config.apiUrl}/api/users/${userId}`,
  { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
  'Could not save these changes.',
);

// Roles are granted one call at a time, so only the difference is sent.
export async function saveUserAccess(userId, { roleIds, currentRoleIds, patientIds }) {
  for (const roleId of roleIds.filter((id) => !currentRoleIds.includes(id))) {
    await send(`${config.apiUrl}/api/users/${userId}/roles/${roleId}`, { method: 'POST' },
      'Could not add that role.');
  }
  for (const roleId of currentRoleIds.filter((id) => !roleIds.includes(id))) {
    await send(`${config.apiUrl}/api/users/${userId}/roles/${roleId}`, { method: 'DELETE' },
      'Could not remove that role.');
  }
  await send(
    `${config.apiUrl}/api/users/${userId}/patients`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_ids: patientIds }),
    },
    'Could not save the care profile assignments.',
  );
}

export const resetUserPassword = (userId, newPassword, requireChange) => send(
  `${config.apiUrl}/api/users/${userId}/reset-password`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_password: newPassword, require_change: requireChange }),
  },
  'Could not reset the password.',
);

export const forceFirstLogin = (userId) => send(
  `${config.apiUrl}/api/users/${userId}/force-password-reset`, { method: 'POST' },
  'Could not require a first-login reset.',
);

export const deleteUser = (userId) => send(
  `${config.apiUrl}/api/users/${userId}`, { method: 'DELETE' }, 'Could not delete this user.',
);

export default function useUserRecord(userId, {
  access = false, activity = 0, haLink = false,
} = {}) {
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [patients, setPatients] = useState([]);
  const [patientIds, setPatientIds] = useState([]);
  const [entries, setEntries] = useState(null);
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId || !currentUser) return;
    setLoading(true);
    setError('');
    try {
      // The profiles list is read on every screen: the assignments come back as
      // bare ids, and a name is what the page needs to show. A viewer without
      // profile access simply gets none, and the wording falls back to counts.
      const requests = [
        apiFetch(`${config.apiUrl}/api/users/${userId}`),
        apiFetch(`${config.apiUrl}/api/users/${userId}/patients`),
        apiFetch(`${config.apiUrl}/api/patients`),
      ];
      if (access) requests.push(apiFetch(`${config.apiUrl}/api/users/roles`));

      const [userRes, assignedRes, patientsRes, rolesRes] = await Promise.all(requests);
      if (!userRes.ok) throw new Error('Could not load this user.');
      setUser(await userRes.json());
      setPatientIds((await jsonOr(assignedRes, {})).patient_ids || []);
      setPatients(await jsonOr(patientsRes, []));
      if (access) setRoles(await jsonOr(rolesRes, []));
      if (activity) {
        const res = await apiFetch(`${config.apiUrl}/api/users/${userId}/activity?limit=${activity}`);
        // A viewer without users.read gets a 403 here; an empty log and no
        // permission are different things, so null means "not shown".
        setEntries(res.ok ? await res.json() : null);
      }
      if (haLink && currentUser?.is_system_admin) {
        try {
          const identities = await listHaIdentities();
          setLink(identities.find((i) => i.mapped_user?.id === parseInt(userId, 10)) || null);
        } catch { setLink(null); }
      }
    } catch (e) {
      setError(e.message || 'Could not load this user.');
    } finally {
      setLoading(false);
    }
  }, [userId, currentUser, access, activity, haLink]);

  useEffect(() => { load(); }, [load]);

  return {
    currentUser,
    user,
    roles,
    patients,
    patientIds,
    activity: entries,
    haLink: link,
    setHaLink: setLink,
    loading,
    error,
    setError,
    reload: load,
  };
}
