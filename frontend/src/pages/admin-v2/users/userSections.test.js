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
import { describe, expect, it } from 'vitest';
import {
  accessSection, accountSection, activitySection, securitySection, userStats,
} from './userSections';

const NOW = new Date('2026-08-20T15:00:00');
const nurse = {
  username: 'marshall',
  is_active: true,
  created_at: '2026-06-12T10:00:00',
  roles: [{
    display_name: 'Registered Nurse',
    permissions: [{ name: 'vitals.read' }, { name: 'vitals.create' }],
  }],
};

describe('accountSection', () => {
  it('says an email is missing rather than leaving a gap', () => {
    expect(accountSection(nurse).facts[0]).toBe('No email · @marshall');
  });

  it('carries the active state as the row status', () => {
    expect(accountSection({ ...nurse, is_active: false }).status)
      .toEqual({ label: 'Inactive', tone: 'muted' });
  });
});

describe('accessSection', () => {
  it('counts the permissions the roles actually carry', () => {
    const section = accessSection(nurse, ['Elijah Carty'], [2]);
    expect(section.facts).toEqual([
      'Registered Nurse',
      'Elijah Carty',
      '2 permissions through those roles',
    ]);
    expect(section.status).toEqual({ label: '1 role', tone: 'success' });
  });

  it('does not count permissions or profiles for a system admin', () => {
    const section = accessSection({ ...nurse, is_system_admin: true }, [], []);
    expect(section.facts[1]).toBe('Every care profile');
    expect(section.facts[2]).toBe('System administrator — every permission');
  });

  it('flags a user with no role at all', () => {
    expect(accessSection({ roles: [] }, [], []).status)
      .toEqual({ label: 'No role', tone: 'warning' });
  });
});

describe('securitySection', () => {
  it('leads with a pending reset over anything else', () => {
    expect(securitySection({ has_pin: true, force_password_reset: true }).status)
      .toEqual({ label: 'Reset required', tone: 'warning' });
  });

  it('distinguishes a PIN from password-only', () => {
    expect(securitySection({ has_pin: true }).status.label).toBe('PIN enabled');
    expect(securitySection({}).status.label).toBe('Password only');
  });

  it('reports when a password has never been used', () => {
    expect(securitySection({}).facts[0]).toBe('No PIN · password never used');
  });
});

describe('activitySection', () => {
  it('previews the two most recent entries', () => {
    const section = activitySection([
      { id: 1, action: 'login.success', timestamp: '2026-08-20T10:42:00' },
      { id: 2, action: 'logout', timestamp: '2026-08-19T18:00:00' },
      { id: 3, action: 'login.success', timestamp: '2026-08-18T09:00:00' },
    ], NOW);
    expect(section.facts).toEqual([
      'Signed in with a password · Today, 10:42 AM',
      'Signed out · Yesterday, 6:00 PM',
    ]);
    expect(section.status.label).toBe('Today');
  });

  it('keeps the year on a status older than yesterday', () => {
    expect(activitySection([
      { id: 1, action: 'login.success', timestamp: '2026-07-28T14:23:00' },
    ], NOW).status.label).toBe('Jul 28, 2026');
  });

  it('separates an empty log from one it may not read', () => {
    expect(activitySection([], NOW).status.label).toBe('Empty');
    expect(activitySection(null, NOW).status.label).toBe('Not shown');
    expect(activitySection(null, NOW).facts[0]).toMatch(/permission/);
  });
});

describe('userStats', () => {
  it('counts roles, profiles and permissions', () => {
    expect(userStats(nurse, [2, 3]).map((s) => s.value)).toEqual([1, 2, 2]);
    expect(userStats(nurse, [2, 3])[0].label).toBe('Role');
  });

  it('says "All" instead of a number where the number would be a lie', () => {
    expect(userStats({ ...nurse, is_system_admin: true }, []).map((s) => s.value))
      .toEqual([1, 'All', 'All']);
  });
});
