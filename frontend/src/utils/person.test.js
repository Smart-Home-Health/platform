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
import { describe, it, expect } from 'vitest';
import { avatarSeed, displayName, initialsOf } from './person';

describe('displayName', () => {
  it('reads every person shape the API returns', () => {
    expect(displayName('  Jane Doe ')).toBe('Jane Doe');
    expect(displayName({ full_name: 'Jane Doe', username: 'jd' })).toBe('Jane Doe');
    expect(displayName({ first_name: 'Jane', last_name: 'Doe' })).toBe('Jane Doe');
    expect(displayName({ first_name: 'Cher' })).toBe('Cher');
    expect(displayName({ name: 'Jane Doe' })).toBe('Jane Doe');
    expect(displayName({ username: 'jd' })).toBe('jd');
    expect(displayName(null)).toBe('');
  });
});

describe('initialsOf', () => {
  it('takes first and last word, uppercased', () => {
    expect(initialsOf('jane doe')).toBe('JD');
    expect(initialsOf('Mary Ann Smith')).toBe('MS');
    expect(initialsOf({ first_name: 'Pat', last_name: 'Ient' })).toBe('PI');
  });
  it('handles single names, double spaces and nothing', () => {
    expect(initialsOf('Cher')).toBe('C');
    expect(initialsOf('  jane   doe ')).toBe('JD');
    expect(initialsOf('')).toBe('');
    expect(initialsOf(undefined)).toBe('');
    expect(initialsOf({ first_name: '', last_name: '' })).toBe('');
  });
});

describe('avatarSeed', () => {
  it('prefers the stored override, else kind:id, else null', () => {
    expect(avatarSeed('user', 7, 'abc-uuid')).toBe('abc-uuid');
    expect(avatarSeed('user', 7, null)).toBe('user:7');
    expect(avatarSeed('patient', 0)).toBe('patient:0');
    expect(avatarSeed('user', null)).toBeNull();
    expect(avatarSeed('user', undefined, '')).toBeNull();
  });
});
