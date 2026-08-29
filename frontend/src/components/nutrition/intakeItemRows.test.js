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
// The feed target is the caregiver's spreadsheet, formalized: what the
// scheduled mix is meant to deliver, against the running total of what is
// actually being poured.
import { describe, it, expect, vi } from 'vitest';
import { feedTarget, makeItemRow, rowsTotals } from './intakeItemRows';

vi.mock('../../services/nutrition', () => ({ nutritionService: {} }));

describe('feedTarget', () => {
  it('sums the component mix — calories from facts, fluid by the unit', () => {
    const target = feedTarget({
      components: [
        { item_type: 'tube_feed', amount: 240, amount_unit: 'ml', calories: 360 },
        { item_type: 'liquid', amount: 4, amount_unit: 'oz', calories: 84 },
        { item_type: 'food', amount: 100, amount_unit: 'grams', calories: 60 },
      ],
    });
    expect(target.calories).toBe(504);
    // 240 mL + 4 oz; grams of food add no fluid.
    expect(target.fluidMl).toBeCloseTo(240 + 4 * 29.5735);
  });

  it('falls back to the legacy single default', () => {
    const target = feedTarget({
      components: [],
      default_amount: 525, default_amount_unit: 'ml', default_calories: 525,
    });
    expect(target).toEqual({ calories: 525, fluidMl: 525 });
  });

  it('is null when the feed defines nothing to aim for', () => {
    expect(feedTarget(null)).toBeNull();
    expect(feedTarget({ components: [] })).toBeNull();
  });
});

describe('is_flush round-trip', () => {
  it('reads the flag from a component and writes it back to the payload', async () => {
    const { rowFromComponentResponse, rowToComponentPayload } = await import('./intakeItemRows');
    const row = rowFromComponentResponse({
      item_id: 12, item_name: 'Water', item_type: 'liquid',
      amount: 60, amount_unit: 'ml', is_flush: true,
    });
    expect(row.isFlush).toBe(true);
    expect(rowToComponentPayload(row, 1).is_flush).toBe(true);
    // Rows built any other way default to not-a-flush.
    expect(rowToComponentPayload(makeItemRow({ itemName: 'Juice' }), 0).is_flush).toBe(false);
  });
});

describe('rowsTotals', () => {
  it('tracks what the mix being built delivers', () => {
    const totals = rowsTotals([
      makeItemRow({ itemType: 'tube_feed', amount: '118', amountUnit: 'ml', calories: '118' }),
      makeItemRow({ itemType: 'liquid', amount: '117', amountUnit: 'ml', calories: '62.4' }),
      makeItemRow({ itemType: 'food', amount: '50', amountUnit: 'grams', calories: '30' }),
    ]);
    expect(totals.calories).toBeCloseTo(210.4);
    expect(totals.fluidMl).toBe(235); // food in grams adds calories, not fluid
  });
});
