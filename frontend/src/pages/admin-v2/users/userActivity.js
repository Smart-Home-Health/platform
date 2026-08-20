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
// Wording for the rows of GET /api/users/{id}/activity.
//
// The API hands back the audit action verbatim. Only actions written with this
// user as their subject can appear, so this map covers the sign-in path and the
// administrative actions that name a user. An action with no entry keeps its
// raw name rather than being guessed at — a wrong label on a security log is
// worse than an unfamiliar one.
import { formatDateTime } from './userDetail';

export const ACTIVITY_LABELS = {
  'login.success': { label: 'Signed in with a password', tone: 'success' },
  'login.failed': { label: 'Password sign-in failed', tone: 'danger' },
  'pin_auth.success': { label: 'Signed in with a PIN', tone: 'success' },
  'pin_auth.failed': { label: 'PIN sign-in failed', tone: 'danger' },
  'pin_auth.rejected': { label: 'PIN refused — a password was required', tone: 'warning' },
  'user.select.success': { label: 'Signed in from the user picker', tone: 'success' },
  'user.select.failed': { label: 'Sign-in from the user picker failed', tone: 'danger' },
  'ha.auto_login.success': { label: 'Signed in from Home Assistant', tone: 'success' },
  logout: { label: 'Signed out', tone: 'muted' },
  'auth.rate_limited': { label: 'Blocked after too many attempts', tone: 'warning' },
  'account.login.success': { label: 'Opened the household account', tone: 'success' },
  'account.login.failed': { label: 'Household account password rejected', tone: 'danger' },
  'account.access.success': { label: 'Opened the household account', tone: 'success' },
  'account.access.failed': { label: 'Household account password rejected', tone: 'danger' },
  'account.unlock.success': { label: 'Unlocked full access with the account password', tone: 'success' },
  'account.unlock.failed': { label: 'Unlock refused — wrong account password', tone: 'danger' },
  'ha.account_access': { label: 'Opened the account from Home Assistant', tone: 'muted' },
  'first_run.setup': { label: 'Set this system up', tone: 'muted' },
  'user.created': { label: 'Account created', tone: 'muted' },
  'user.updated': { label: 'Account details updated', tone: 'muted' },
  'user.password_reset.completed': { label: 'Chose a new password', tone: 'success' },
  'user.password_reset.admin_set': { label: 'Password reset', tone: 'warning' },
  'user.password_reset.forced': { label: 'First-login password reset required', tone: 'warning' },
  'user.password_reset.failed': { label: 'Password reset failed', tone: 'danger' },
  'role.assigned': { label: 'Role assigned', tone: 'muted' },
  'role.removed': { label: 'Role removed', tone: 'muted' },
  'ha.identity.link': { label: 'Home Assistant sign-in linked', tone: 'muted' },
  'ha.identity.unlink': { label: 'Home Assistant sign-in unlinked', tone: 'muted' },
};

export function describeActivity(entry, now = new Date()) {
  const known = ACTIVITY_LABELS[entry?.action];
  const detail = [
    entry?.actor_name ? `by ${entry.actor_name}` : null,
    entry?.ip_address || null,
  ].filter(Boolean).join(' · ');
  return {
    id: entry?.id,
    label: known?.label || entry?.action || 'Unrecognised event',
    known: Boolean(known),
    tone: known?.tone || 'muted',
    when: formatDateTime(entry?.timestamp, now) || '—',
    detail,
  };
}

export const describeActivityList = (entries = [], now = new Date()) =>
  entries.map((entry) => describeActivity(entry, now));
