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
// One shell renders three different lists, so the claims worth pinning are the
// ones a reader takes at face value: a status badge means what it says, a role
// row does not invent an assigned-user count it was never given, and the roles
// route is not mistaken for the users route it sits under.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS, activeFilterChips, filterRows, isStaleLogin, profileRows,
  relativeDay, roleRows, sortRows, statsFor, tabForPath, userRows,
} from './directoryTabs';

const NOW = new Date('2026-08-20T12:00:00Z');

const patient = (over = {}) => ({
  id: 1, first_name: 'Elijah', last_name: 'Carty', date_of_birth: '2010-12-05T00:00:00Z',
  care_area: "Elijah's Room", is_active: true, created_at: '2026-03-31T00:00:00Z', ...over,
});

const user = (over = {}) => ({
  id: 1, username: 'jcarty', full_name: 'John Carty', email: 'j@example.com',
  is_active: true, is_system_admin: false, last_login: '2026-08-19T00:00:00Z',
  roles: [{ id: 2, display_name: 'Nurse' }], ...over,
});

describe('tabForPath', () => {
  it('reads roles as its own tab even though it lives under users', () => {
    expect(tabForPath('/care/configuration/users/roles')).toBe('roles');
    expect(tabForPath('/care/configuration/users/roles/3')).toBe('roles');
    expect(tabForPath('/care/configuration/users')).toBe('users');
    expect(tabForPath('/care/configuration/users/7')).toBe('users');
    expect(tabForPath('/care/configuration/patients')).toBe('profiles');
  });
});

describe('profileRows', () => {
  it('flags a profile only for a fact that is actually missing', () => {
    const [row] = profileRows([patient()]);
    expect(row.status.label).toBe('Active');
    expect(row.meta).toBe("DOB Dec 5, 2010 · Elijah's Room");

    const [noDob] = profileRows([patient({ date_of_birth: null })]);
    expect(noDob.status.label).toBe('Needs review');
    expect(noDob.meta).toBe('DOB not added · Setup incomplete');
  });

  it('reads a date of birth as a calendar date, whatever the API sends', () => {
    // Naive (what the API sends today) and zoned must both read Dec 5 in a
    // timezone west of UTC — a birth date is not an instant.
    expect(profileRows([patient({ date_of_birth: '2010-12-05T00:00:00' })])[0].meta)
      .toContain('DOB Dec 5, 2010');
    expect(profileRows([patient({ date_of_birth: '2010-12-05T00:00:00Z' })])[0].meta)
      .toContain('DOB Dec 5, 2010');
  });

  it('treats a blank care area as optional, not a problem', () => {
    const [row] = profileRows([patient({ care_area: null })]);
    expect(row.status.label).toBe('Active');
    expect(row.meta).toBe('DOB Dec 5, 2010 · No care area');
  });

  it('says inactive rather than needs-review for a deactivated profile', () => {
    const [row] = profileRows([patient({ is_active: false, date_of_birth: null })]);
    expect(row.status.label).toBe('Inactive');
  });
});

describe('userRows', () => {
  it('reports when someone was last seen, and when they never were', () => {
    expect(userRows([user()], NOW)[0].meta).toBe('@jcarty · Last seen yesterday');
    expect(userRows([user({ last_login: null })], NOW)[0].meta)
      .toBe('@jcarty · Never signed in');
  });

  it('marks system admins', () => {
    expect(userRows([user({ is_system_admin: true })], NOW)[0].badge).toBe('Admin');
    expect(userRows([user()], NOW)[0].badge).toBe(null);
  });
});

describe('relativeDay / isStaleLogin', () => {
  it('counts in days and falls back to a date past a month', () => {
    expect(relativeDay('2026-08-20T01:00:00Z', NOW)).toBe('today');
    expect(relativeDay('2026-08-15T12:00:00Z', NOW)).toBe('5 days ago');
    expect(relativeDay('2026-01-02T12:00:00Z', NOW)).toBe('Jan 2, 2026');
  });

  it('treats never-logged-in as stale', () => {
    expect(isStaleLogin(null, NOW)).toBe(true);
    expect(isStaleLogin('2026-08-19T12:00:00Z', NOW)).toBe(false);
    expect(isStaleLogin('2026-06-01T12:00:00Z', NOW)).toBe(true);
  });
});

describe('roleRows', () => {
  it('counts assigned users from the user list when it has one', () => {
    const rows = roleRows(
      [{ id: 2, display_name: 'Nurse', permissions: [1, 2, 3], is_active: true }],
      [user(), user({ id: 2, roles: [{ id: 2 }] }), user({ id: 3, roles: [] })],
    );
    expect(rows[0].meta).toBe('2 users · 3 permissions');
  });

  it('says nothing about users when it was given no user list', () => {
    const rows = roleRows([{ id: 2, display_name: 'Nurse', permissions: [1] }], null);
    expect(rows[0].meta).toBe('1 permission');
    expect(rows[0].assignedCount).toBe(null);
  });
});

describe('statsFor', () => {
  it('counts what each tab is actually about', () => {
    const profiles = profileRows([patient(), patient({ id: 2, is_active: false })]);
    expect(statsFor('profiles', { rows: profiles }).map((s) => [s.label, s.value]))
      .toEqual([['Total', 2], ['Active', 1], ['Inactive', 1]]);

    const users = userRows([user(), user({ id: 2, is_system_admin: true })], NOW);
    expect(statsFor('users', { rows: users }).map((s) => [s.label, s.value]))
      .toEqual([['Total', 2], ['Active', 2], ['Admins', 1]]);

    const roles = roleRows([{ id: 1, display_name: 'Nurse', permissions: [1] }], null);
    expect(statsFor('roles', { rows: roles, permissionCount: 42 }).map((s) => [s.label, s.value]))
      .toEqual([['Total', 1], ['Active', 1], ['Permissions', 42]]);
  });
});

describe('filterRows', () => {
  const rows = userRows([
    user({ id: 1, full_name: 'John Carty', last_login: '2026-08-19T00:00:00Z' }),
    user({ id: 2, full_name: 'Marshall', username: 'marshall', is_active: false,
           roles: [{ id: 5 }], last_login: null }),
  ], NOW);

  it('searches every field a row exposed', () => {
    expect(filterRows(rows, { search: 'marsh', filters: { ...DEFAULT_FILTERS, status: 'all' }, tab: 'users' }))
      .toHaveLength(1);
    expect(filterRows(rows, { search: 'nobody', filters: { ...DEFAULT_FILTERS, status: 'all' }, tab: 'users' }))
      .toHaveLength(0);
  });

  it('defaults to active only', () => {
    expect(filterRows(rows, { filters: DEFAULT_FILTERS, tab: 'users' }).map((r) => r.id)).toEqual([1]);
    expect(filterRows(rows, { filters: { ...DEFAULT_FILTERS, status: 'inactive' }, tab: 'users' })
      .map((r) => r.id)).toEqual([2]);
  });

  it('applies the user-only filters only on the users tab', () => {
    const stale = { ...DEFAULT_FILTERS, status: 'all', stale: true };
    expect(filterRows(rows, { filters: stale, tab: 'users' }).map((r) => r.id)).toEqual([2]);
    // The same filter object on another tab must not silently drop rows.
    expect(filterRows(rows, { filters: stale, tab: 'profiles' })).toHaveLength(2);
  });
});

describe('activeFilterChips', () => {
  it('shows a chip per filter that is not at its default, and names the role', () => {
    const chips = activeFilterChips(
      { status: 'inactive', role: '5', stale: true },
      { tab: 'users', roles: [{ id: 5, display_name: 'Registered Nurse' }] },
    );
    expect(chips.map((c) => c.label)).toEqual(['Inactive', 'Registered Nurse', 'No login in 30 days']);
  });

  it('shows nothing when everything is at "all"', () => {
    expect(activeFilterChips({ status: 'all', role: 'all', stale: false }, { tab: 'users' }))
      .toEqual([]);
  });
});

describe('sortRows', () => {
  it('sorts by name, and by the tab-specific key', () => {
    const rows = userRows([
      user({ id: 1, full_name: 'Zoe', last_login: '2026-08-01T00:00:00Z' }),
      user({ id: 2, full_name: 'Adam', last_login: '2026-08-19T00:00:00Z' }),
      user({ id: 3, full_name: 'Mia', last_login: null }),
    ], NOW);
    expect(sortRows(rows, 'name').map((r) => r.title)).toEqual(['Adam', 'Mia', 'Zoe']);
    expect(sortRows(rows, 'name_desc').map((r) => r.title)).toEqual(['Zoe', 'Mia', 'Adam']);
    // Never-signed-in sorts last rather than first.
    expect(sortRows(rows, 'seen').map((r) => r.title)).toEqual(['Adam', 'Zoe', 'Mia']);
  });
});
