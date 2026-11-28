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
import { slotLabel } from './scheduleRollup';

const at = (h, m) => new Date(2026, 7, 17, h, m).toISOString();

describe('slotLabel', () => {
  it('is the zero-padded local clock time', () => {
    expect(slotLabel(at(8, 0))).toBe('08:00');
    expect(slotLabel(at(16, 5))).toBe('16:05');
  });

  it('is empty for an unparseable time', () => {
    expect(slotLabel('not a date')).toBe('');
    expect(slotLabel(null)).toBe('');
  });
});
