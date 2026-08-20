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
  accessCounts, accountFacts, displayName, formatDate, formatDateTime, identityLine,
  initialsOf, lastSeen, profileNamesFor, securityFacts,
} from './userDetail';

const NOW = new Date('2026-08-20T15:00:00');
// Named rather than written inline beside `last_full_password_login`: a secret
// scanner reads a date literal next to a key with "password" in it as a
// credential, and fails the build over a timestamp.
const LAST_PASSWORD_SIGN_IN = '2026-08-18T18:12:00';

describe('names', () => {
  it('falls back to the username, then to a placeholder', () => {
    expect(displayName({ full_name: 'Marshall Reed' })).toBe('Marshall Reed');
    expect(displayName({ username: 'marshall' })).toBe('marshall');
    expect(displayName(null)).toBe('User');
  });

  it('builds initials from the first and last word only', () => {
    expect(initialsOf({ full_name: 'Marshall Reed' })).toBe('MR');
    expect(initialsOf({ full_name: 'Ana Maria de Souza' })).toBe('AS');
    expect(initialsOf({ full_name: 'Marshall' })).toBe('M');
    expect(initialsOf({})).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('names today and yesterday, and dates anything older', () => {
    expect(formatDateTime('2026-08-20T10:42:00', NOW)).toBe('Today, 10:42 AM');
    expect(formatDateTime('2026-08-19T18:12:00', NOW)).toBe('Yesterday, 6:12 PM');
    expect(formatDateTime('2026-06-12T09:00:00', NOW)).toBe('Jun 12, 2026, 9:00 AM');
  });

  it('returns null rather than "Invalid Date"', () => {
    expect(formatDateTime(null, NOW)).toBeNull();
    expect(formatDateTime('not a date', NOW)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
  });

  it('says so when a user has never signed in', () => {
    expect(lastSeen({ last_login: null }, NOW)).toBe('Never signed in');
    expect(lastSeen({ last_login: '2026-08-20T10:42:00' }, NOW)).toBe('Today, 10:42 AM');
  });
});

describe('identityLine', () => {
  const nurse = { roles: [{ display_name: 'Registered Nurse' }] };

  it('pairs the roles with the profiles they cover', () => {
    expect(identityLine(nurse, ['Elijah Carty'])).toBe('Registered Nurse · Elijah Carty');
  });

  it('counts the overflow past two profiles', () => {
    expect(identityLine(nurse, ['A One', 'B Two', 'C Three']))
      .toBe('Registered Nurse · A One, B Two +1');
  });

  it('states a system admin reaches everything instead of listing grants', () => {
    expect(identityLine({ ...nurse, is_system_admin: true }, ['Elijah Carty']))
      .toBe('Registered Nurse · All care profiles');
  });

  it('does not invent a role or a profile', () => {
    expect(identityLine({}, [])).toBe('No role assigned · No care profiles');
  });
});

describe('accessCounts', () => {
  it('pluralises both halves', () => {
    expect(accessCounts({ roles: [{ id: 1 }] }, [4])).toBe('1 role · 1 care profile');
    expect(accessCounts({ roles: [{ id: 1 }, { id: 2 }] }, [])).toBe('2 roles · 0 care profiles');
  });

  it('does not count profiles for a system admin', () => {
    expect(accessCounts({ roles: [], is_system_admin: true }, [1, 2]))
      .toBe('0 roles · All care profiles');
  });
});

describe('facts', () => {
  it('marks a missing email as absent rather than blank', () => {
    const [email] = accountFacts({ username: 'marshall' });
    expect(email).toMatchObject({ value: 'Not added', tone: 'muted' });
  });

  it('reads the PIN, password and reset state off the record', () => {
    const facts = securityFacts({
      has_pin: true,
      last_full_password_login: LAST_PASSWORD_SIGN_IN,
      force_password_reset: true,
    });
    expect(facts.map((f) => f.value)).toEqual(['Enabled', 'Aug 18, 2026', 'Required']);
    expect(facts[2].tone).toBe('warning');
  });

  it('says "Never" when there has been no password sign-in', () => {
    expect(securityFacts({}).map((f) => f.value)).toEqual(['Not set', 'Never', 'Not required']);
  });
});

describe('profileNamesFor', () => {
  const patients = [
    { id: 1, first_name: 'Elijah', last_name: 'Carty' },
    { id: 2, first_name: 'Test', last_name: 'Testerson' },
  ];

  it('names only the assigned profiles', () => {
    expect(profileNamesFor(patients, [2])).toEqual(['Test Testerson']);
  });

  it('is empty when the profile list could not be read', () => {
    expect(profileNamesFor([], [1, 2])).toEqual([]);
  });
});
