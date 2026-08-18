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
// Section records -> picker rows. The picker itself knows neither shape.
import { describe, it, expect } from 'vitest';
import { medicationRows, careTaskRows } from './prnRows';

describe('medicationRows', () => {
  it('describes strength and stock, and hands back the original record', () => {
    const med = { id: 7, name: 'Tylenol', concentration: '625mg', quantity: 129, quantity_unit: 'tablets' };
    const [row] = medicationRows([med]);
    expect(row).toMatchObject({ id: 7, name: 'Tylenol', meta: '625mg', note: '129 tablets on hand', tone: null });
    expect(row.record).toBe(med);
  });

  it('flags low stock so the picker can colour it', () => {
    const [row] = medicationRows([{
      id: 1, name: 'Ondansetron', quantity: 2, quantity_unit: 'ml',
      low_stock_threshold: 5, low_stock_threshold_type: 'quantity',
    }]);
    expect(row.tone).toBe('low');
  });
});

describe('careTaskRows', () => {
  it('describes the category and the task itself, with no invented stock', () => {
    const task = { id: 3, name: 'Nebulizer', category_name: 'Treatments', description: 'After breakfast' };
    const [row] = careTaskRows([task]);
    expect(row).toMatchObject({ id: 3, name: 'Nebulizer', meta: 'Treatments', note: 'After breakfast' });
    // No stock concept for a task, so nothing may claim one.
    expect(row.tone).toBeUndefined();
    expect(row.record).toBe(task);
  });

  it('leaves the lines empty rather than filling them in', () => {
    const [row] = careTaskRows([{ id: 4, name: 'Reposition' }]);
    expect(row.meta).toBeNull();
    expect(row.note).toBeNull();
  });
});
