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
// What the user screens say about a user, derived only from what the API
// returns. Kept pure so the wording and the counting can be tested without
// mounting a page.

export const displayName = (user) => user?.full_name || user?.username || 'User';

export const formatDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const TIME = { hour: 'numeric', minute: '2-digit' };

// "Today, 10:42 AM" for anything inside the last two calendar days, an absolute
// date beyond that. Relative wording only where it is unambiguous.
export const formatDateTime = (value, now = new Date()) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((midnight - new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    / 86400000);
  const time = d.toLocaleTimeString('en-US', TIME);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${time}`;
};

export const roleNames = (user) => (user?.roles || []).map((r) => r.display_name || r.name);

// The line under the name. A system admin's reach comes from the flag, not from
// an assignment, so it is spelled out rather than counted.
export const identityLine = (user, profileNames = []) => {
  const roles = roleNames(user);
  const rolePart = roles.length ? roles.join(', ') : 'No role assigned';
  if (user?.is_system_admin) return `${rolePart} · All care profiles`;
  if (profileNames.length === 0) return `${rolePart} · No care profiles`;
  if (profileNames.length <= 2) return `${rolePart} · ${profileNames.join(', ')}`;
  return `${rolePart} · ${profileNames.slice(0, 2).join(', ')} +${profileNames.length - 2}`;
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const accessCounts = (user, profileIds = []) => {
  const roles = plural((user?.roles || []).length, 'role', 'roles');
  if (user?.is_system_admin) return `${roles} · All care profiles`;
  return `${roles} · ${plural(profileIds.length, 'care profile', 'care profiles')}`;
};

// Each section of the overview describes itself with plain facts. `tone` only
// ever colours a value that genuinely carries a state.
export const accountFacts = (user) => [
  {
    label: 'Email',
    value: user?.email || 'Not added',
    tone: user?.email ? undefined : 'muted',
  },
  { label: 'Username', value: `@${user?.username || ''}` },
  {
    label: 'Status',
    value: user?.is_active ? 'Active' : 'Inactive',
    tone: user?.is_active ? 'success' : 'warning',
  },
];

export const securityFacts = (user) => [
  {
    label: 'PIN sign-in',
    value: user?.has_pin ? 'Enabled' : 'Not set',
    tone: user?.has_pin ? 'success' : 'muted',
  },
  {
    label: 'Password last used',
    value: formatDate(user?.last_full_password_login) || 'Never',
    tone: user?.last_full_password_login ? undefined : 'muted',
  },
  {
    label: 'First-login reset',
    value: user?.force_password_reset ? 'Required' : 'Not required',
    tone: user?.force_password_reset ? 'warning' : 'muted',
  },
];

export const lastSeen = (user, now = new Date()) =>
  formatDateTime(user?.last_login, now) || 'Never signed in';

// Roles arrive with their permissions attached, so the reach of a user's roles
// can be counted without a second read. A system admin's access does not come
// from permission rows at all, which is why it is reported as such.
export const permissionCount = (user) => {
  const names = new Set();
  (user?.roles || []).forEach((role) => {
    (role.permissions || []).forEach((p) => names.add(p.name || p));
  });
  return names.size;
};

// One line each, for the rows of the overview.
export const accountLine = (user) => [user?.email || 'No email', `@${user?.username || ''}`].join(' · ');

export const securityLine = (user) => [
  user?.has_pin ? 'PIN enabled' : 'No PIN',
  formatDate(user?.last_full_password_login)
    ? `password last used ${formatDate(user.last_full_password_login)}`
    : 'password never used',
].join(' · ');

export const profileNamesFor = (patients = [], patientIds = []) => patients
  .filter((p) => patientIds.includes(p.id))
  .map((p) => [p.first_name, p.last_name].filter(Boolean).join(' ') || `Profile ${p.id}`);
