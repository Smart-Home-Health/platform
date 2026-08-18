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
// The amber "on hand" signal in the PRN picker. It has to be conservative: a
// wrong amber on a controlled medication is worse than no amber.
import { describe, it, expect } from 'vitest';
import { isLowStock } from './lowStock';

const med = (over = {}) => ({
  quantity: 10, quantity_unit: 'tablets',
  low_stock_threshold: null, low_stock_threshold_type: 'quantity', ...over,
});

describe('isLowStock', () => {
  it('is off when the medication opts out of alerting', () => {
    // NULL threshold is the opt-out, not "zero".
    expect(isLowStock(med({ quantity: 0, low_stock_threshold: null }))).toBe(false);
  });

  it('fires at or below the threshold', () => {
    expect(isLowStock(med({ quantity: 3, low_stock_threshold: 5 }))).toBe(true);
    expect(isLowStock(med({ quantity: 5, low_stock_threshold: 5 }))).toBe(true);
    expect(isLowStock(med({ quantity: 6, low_stock_threshold: 5 }))).toBe(false);
  });

  it('will not guess at a days-of-supply threshold', () => {
    // 'days' projects over the medication's schedules, which the client does
    // not have — and a PRN medication has none to project from.
    expect(isLowStock(med({
      quantity: 1, low_stock_threshold: 30, low_stock_threshold_type: 'days',
    }))).toBe(false);
  });

  it('treats a missing type as quantity, which is the column default', () => {
    expect(isLowStock(med({
      quantity: 1, low_stock_threshold: 5, low_stock_threshold_type: undefined,
    }))).toBe(true);
  });

  it('stays quiet on unusable numbers rather than showing a false alarm', () => {
    expect(isLowStock(med({ quantity: null, low_stock_threshold: 5 }))).toBe(false);
    expect(isLowStock(med({ quantity: 'many', low_stock_threshold: 5 }))).toBe(false);
    expect(isLowStock(undefined)).toBe(false);
  });
});
