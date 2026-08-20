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
// The three directory lists differ in four places: what a row says, what the
// stat strip counts, what can be filtered, and how it sorts. Everything here is
// pure so the shell can stay presentation.

export const TAB_IDS = ['profiles', 'users', 'roles'];

export const TABS = {
  profiles: {
    id: 'profiles',
    label: 'Care profiles',
    path: '/care/configuration/patients',
    searchPlaceholder: 'Search care profiles…',
    addLabel: 'Add care profile',
    noun: ['care profile', 'care profiles'],
    readPermissions: ['patients.read', 'patients.create', 'patients.update', 'patients.delete'],
    createPermission: 'patients.create',
  },
  users: {
    id: 'users',
    label: 'Users',
    path: '/care/configuration/users',
    searchPlaceholder: 'Search by name, username, or email…',
    addLabel: 'Add user',
    noun: ['user', 'users'],
    readPermissions: ['users.read', 'users.create', 'users.update', 'users.delete'],
    createPermission: 'users.create',
  },
  roles: {
    id: 'roles',
    label: 'Roles',
    path: '/care/configuration/users/roles',
    searchPlaceholder: 'Search roles…',
    addLabel: 'Add role',
    noun: ['role', 'roles'],
    readPermissions: ['roles.read', 'roles.create', 'roles.update', 'roles.delete', 'users.read'],
    createPermission: 'roles.create',
  },
};

// Roles live under /users, so the longest match has to win.
export function tabForPath(pathname = '') {
  if (pathname.startsWith('/care/configuration/users/roles')) return 'roles';
  if (pathname.startsWith('/care/configuration/users')) return 'users';
  return 'profiles';
}

const initials = (...parts) =>
  parts.filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 2) || '—';

const DATE_STYLE = { month: 'short', day: 'numeric', year: 'numeric' };

const formatDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', DATE_STYLE);
};

// A date of birth is a calendar date, not an instant. Formatting it through a
// Date parsed from an instant shifts it a day west of UTC — "2010-12-05" would
// read as Dec 4 in New York — so read the calendar parts and build a local date
// from them. Works whether or not the API ever starts sending a zone.
export const formatDateOnly = (value) => {
  if (!value) return null;
  const parts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) return formatDate(value);
  const [, year, month, day] = parts;
  return new Date(Number(year), Number(month) - 1, Number(day))
    .toLocaleDateString('en-US', DATE_STYLE);
};

// Days, not hours: this is "when did we last see them", not a clock.
export function relativeDay(value, now = new Date()) {
  if (!value) return null;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.floor((now - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(value);
}

export const STALE_LOGIN_DAYS = 30;

export const isStaleLogin = (lastLogin, now = new Date()) => {
  if (!lastLogin) return true;
  const then = new Date(lastLogin);
  if (Number.isNaN(then.getTime())) return true;
  return (now - then) / 86400000 >= STALE_LOGIN_DAYS;
};

/**
 * Care-profile rows. "Needs review" is only ever about a fact that is actually
 * missing — a profile with no date of birth. A blank care area is optional and
 * says so without being flagged.
 */
export function profileRows(patients = []) {
  return patients.map((p) => {
    const dob = formatDateOnly(p.date_of_birth);
    const area = p.care_area || null;
    const status = !p.is_active
      ? { label: 'Inactive', tone: 'muted' }
      : dob
        ? { label: 'Active', tone: 'success' }
        : { label: 'Needs review', tone: 'warning' };
    return {
      id: p.id,
      key: `profile-${p.id}`,
      initials: initials(p.first_name, p.last_name),
      title: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Care profile',
      meta: [
        dob ? `DOB ${dob}` : 'DOB not added',
        dob ? (area || 'No care area') : 'Setup incomplete',
      ].join(' · '),
      status,
      active: Boolean(p.is_active),
      to: `/care/configuration/patients/${p.id}`,
      search: [p.first_name, p.last_name, p.medical_record_number, p.care_area],
      sortName: `${p.last_name || ''} ${p.first_name || ''}`.trim().toLowerCase(),
      addedAt: p.created_at || null,
      raw: p,
    };
  });
}

export function userRows(users = [], now = new Date()) {
  return users.map((u) => {
    const seen = relativeDay(u.last_login, now);
    return {
      id: u.id,
      key: `user-${u.id}`,
      initials: initials(...(u.full_name || u.username || '').split(' ')),
      title: u.full_name || u.username,
      meta: [`@${u.username}`, seen ? `Last seen ${seen}` : 'Never signed in'].join(' · '),
      status: u.is_active
        ? { label: 'Active', tone: 'success' }
        : { label: 'Inactive', tone: 'muted' },
      badge: u.is_system_admin ? 'Admin' : null,
      active: Boolean(u.is_active),
      to: `/care/configuration/users/${u.id}`,
      search: [u.full_name, u.username, u.email],
      sortName: (u.full_name || u.username || '').toLowerCase(),
      lastLogin: u.last_login || null,
      roleIds: (u.roles || []).map((r) => r.id),
      stale: isStaleLogin(u.last_login, now),
      raw: u,
    };
  });
}

// The assigned-user count comes from the users list the shell already loaded;
// without permission to read users there is no count to show, so the row says
// nothing rather than "0 users".
export function roleRows(roles = [], users = null) {
  const counts = users
    ? users.reduce((acc, u) => {
      (u.roles || []).forEach((r) => { acc[r.id] = (acc[r.id] || 0) + 1; });
      return acc;
    }, {})
    : null;
  return roles.map((r) => {
    const permissions = r.permissions?.length || 0;
    const assigned = counts ? (counts[r.id] || 0) : null;
    const parts = [];
    if (assigned !== null) parts.push(`${assigned} ${assigned === 1 ? 'user' : 'users'}`);
    parts.push(`${permissions} ${permissions === 1 ? 'permission' : 'permissions'}`);
    return {
      id: r.id,
      key: `role-${r.id}`,
      initials: null,
      title: r.display_name || r.name,
      meta: parts.join(' · '),
      status: r.is_active === false
        ? { label: 'Inactive', tone: 'muted' }
        : { label: 'Active', tone: 'success' },
      active: r.is_active !== false,
      to: `/care/configuration/users/roles/${r.id}`,
      search: [r.display_name, r.name, r.description],
      sortName: (r.display_name || r.name || '').toLowerCase(),
      permissionCount: permissions,
      assignedCount: assigned,
      raw: r,
    };
  });
}

export function statsFor(tab, { rows, permissionCount = 0 }) {
  const active = rows.filter((r) => r.active).length;
  if (tab === 'users') {
    return [
      { label: 'Total', value: rows.length },
      { label: 'Active', value: active, tone: active ? 'success' : undefined },
      { label: 'Admins', value: rows.filter((r) => r.badge === 'Admin').length },
    ];
  }
  if (tab === 'roles') {
    return [
      { label: 'Total', value: rows.length },
      { label: 'Active', value: active, tone: active ? 'success' : undefined },
      { label: 'Permissions', value: permissionCount },
    ];
  }
  const inactive = rows.length - active;
  return [
    { label: 'Total', value: rows.length },
    { label: 'Active', value: active, tone: active ? 'success' : undefined },
    { label: 'Inactive', value: inactive, tone: inactive ? 'warning' : undefined },
  ];
}

export const SORTS = {
  profiles: [
    { id: 'name', label: 'Name A–Z' },
    { id: 'name_desc', label: 'Name Z–A' },
    { id: 'added', label: 'Recently added' },
  ],
  users: [
    { id: 'name', label: 'Name A–Z' },
    { id: 'name_desc', label: 'Name Z–A' },
    { id: 'seen', label: 'Last seen' },
  ],
  roles: [
    { id: 'name', label: 'Name A–Z' },
    { id: 'name_desc', label: 'Name Z–A' },
    { id: 'permissions', label: 'Most permissions' },
  ],
};

const byDateDesc = (key) => (a, b) => {
  const av = a[key] ? new Date(a[key]).getTime() : -Infinity;
  const bv = b[key] ? new Date(b[key]).getTime() : -Infinity;
  return bv - av;
};

export function sortRows(rows, sort) {
  const out = [...rows];
  switch (sort) {
    case 'name_desc': return out.sort((a, b) => b.sortName.localeCompare(a.sortName));
    case 'added': return out.sort(byDateDesc('addedAt'));
    case 'seen': return out.sort(byDateDesc('lastLogin'));
    case 'permissions': return out.sort((a, b) => b.permissionCount - a.permissionCount);
    default: return out.sort((a, b) => a.sortName.localeCompare(b.sortName));
  }
}

// Filters are per tab; `status` is shared. Anything not 'all' shows as a chip.
export const DEFAULT_FILTERS = { status: 'active', role: 'all', stale: false };

export function filterRows(rows, { search = '', filters = DEFAULT_FILTERS, tab = 'profiles' }) {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (query) {
      const hit = (row.search || []).filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));
      if (!hit) return false;
    }
    if (filters.status === 'active' && !row.active) return false;
    if (filters.status === 'inactive' && row.active) return false;
    if (tab === 'users') {
      if (filters.role !== 'all' && !row.roleIds.includes(Number(filters.role))) return false;
      if (filters.stale && !row.stale) return false;
    }
    return true;
  });
}

// The chips under the search box: one per filter that is not at its default.
export function activeFilterChips(filters, { tab, roles = [] }) {
  const chips = [];
  if (filters.status !== 'all') {
    chips.push({
      id: 'status',
      label: filters.status === 'active' ? 'Active' : 'Inactive',
      reset: { status: 'all' },
    });
  }
  if (tab === 'users' && filters.role !== 'all') {
    const role = roles.find((r) => String(r.id) === String(filters.role));
    chips.push({
      id: 'role',
      label: role ? role.display_name : 'Role',
      reset: { role: 'all' },
    });
  }
  if (tab === 'users' && filters.stale) {
    chips.push({
      id: 'stale',
      label: `No login in ${STALE_LOGIN_DAYS} days`,
      reset: { stale: false },
    });
  }
  return chips;
}
