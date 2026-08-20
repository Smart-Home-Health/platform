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
// What each row of the user overview says about a user. Mirrors
// careProfileSections.js: a status, a blurb and a couple of facts per section,
// all derived from what the API returned — nothing here is guessed at.
import {
  accessCounts, accountLine, formatDate, permissionCount, securityLine,
} from './userDetail';
import { describeActivity } from './userActivity';

export const accountSection = (user) => ({
  status: user?.is_active
    ? { label: 'Active', tone: 'success' }
    : { label: 'Inactive', tone: 'muted' },
  facts: [
    accountLine(user),
    `Added ${formatDate(user?.created_at) || 'at an unrecorded time'}`,
  ],
});

export const accessSection = (user, profileNames = [], profileIds = []) => {
  const roles = (user?.roles || []).map((r) => r.display_name || r.name);
  const permissions = permissionCount(user);
  const reach = user?.is_system_admin
    ? 'Every care profile'
    : (profileNames.join(', ') || 'No care profiles assigned');
  return {
    status: roles.length
      ? { label: accessCounts(user, profileIds).split(' · ')[0], tone: 'success' }
      : { label: 'No role', tone: 'warning' },
    facts: [
      roles.length ? roles.join(', ') : 'No role assigned',
      reach,
      user?.is_system_admin
        ? 'System administrator — every permission'
        : `${permissions} ${permissions === 1 ? 'permission' : 'permissions'} through those roles`,
    ],
  };
};

export const securitySection = (user) => {
  let status = { label: 'PIN enabled', tone: 'success' };
  if (user?.force_password_reset) status = { label: 'Reset required', tone: 'warning' };
  else if (!user?.has_pin) status = { label: 'Password only', tone: 'muted' };
  return {
    status,
    facts: [
      securityLine(user),
      user?.force_password_reset
        ? 'Must choose a new password at the next sign-in'
        : 'No first-login reset pending',
    ],
  };
};

// `entries` is null when the viewer may not read the account log — an empty log
// and a forbidden one are different things and must not read the same.
export const activitySection = (entries, now = new Date()) => {
  if (entries === null || entries === undefined) {
    return {
      status: { label: 'Not shown', tone: 'muted' },
      facts: ['You do not have permission to read this account log'],
    };
  }
  if (entries.length === 0) {
    return {
      status: { label: 'Empty', tone: 'muted' },
      facts: ['Nothing recorded for this account yet'],
    };
  }
  const rows = entries.slice(0, 2).map((e) => describeActivity(e, now));
  return {
    // The facts carry the timestamps; the status says only how recent the
    // newest of them is. "Jul 28" without its year would be a worse label than
    // no label, so anything older than yesterday keeps its full date.
    status: {
      label: /^(Today|Yesterday)/.test(rows[0].when)
        ? rows[0].when.split(',')[0]
        : formatDate(entries[0].timestamp),
      tone: 'muted',
    },
    facts: rows.map((row) => `${row.label} · ${row.when}`),
  };
};

// The three numbers above the rows. Each one is a count of something the API
// actually returned, not a score.
export const userStats = (user, profileIds = []) => [
  { label: (user?.roles || []).length === 1 ? 'Role' : 'Roles', value: (user?.roles || []).length },
  {
    label: 'Care profiles',
    value: user?.is_system_admin ? 'All' : profileIds.length,
  },
  { label: 'Permissions', value: user?.is_system_admin ? 'All' : permissionCount(user) },
];
