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
// sessionStorage checkpoint helpers for in-progress imports.
import { describe, it, expect, beforeEach } from 'vitest';
import { sessionGet, sessionSet, sessionClear } from './sessionState';

beforeEach(() => sessionStorage.clear());

describe('sessionState', () => {
  it('round-trips JSON values under the shh: prefix', () => {
    sessionSet('scan:7', { barcodes: ['/IEA450020'], pagesUploaded: 2 });
    expect(sessionGet('scan:7')).toEqual({ barcodes: ['/IEA450020'], pagesUploaded: 2 });
    expect(sessionStorage.getItem('shh:scan:7')).toBeTruthy();
  });

  it('treats null/undefined as removal', () => {
    sessionSet('drafts:7', [{ item_number: 'x' }]);
    sessionSet('drafts:7', null);
    expect(sessionGet('drafts:7')).toBeNull();
  });

  it('sessionClear removes multiple keys at once', () => {
    sessionSet('a:1', 1);
    sessionSet('b:1', 2);
    sessionClear('a:1', 'b:1');
    expect(sessionGet('a:1')).toBeNull();
    expect(sessionGet('b:1')).toBeNull();
  });

  it('returns null for corrupt entries instead of throwing', () => {
    sessionStorage.setItem('shh:bad', '{not json');
    expect(sessionGet('bad')).toBeNull();
  });
});
