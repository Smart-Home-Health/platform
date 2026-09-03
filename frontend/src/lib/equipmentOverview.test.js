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
import {
  daysUntil, dueState, isDue, stockState, isLowStock, isBelowMinimum,
  readinessByCategory, belowMinimumCount, attentionItems, upcomingChanges,
  overviewCounts,
} from './equipmentOverview';

const TODAY = new Date('2026-08-19T14:30:00');

const scheduled = (dueDate, over = {}) => ({
  id: 1, name: 'Trach tube', scheduled_replacement: true, due_date: dueDate, ...over,
});

const supply = (over = {}) => ({
  id: 2, name: 'Catheter', scheduled_replacement: false, tracking_level: 'item',
  quantity: 10, reorder_point: 3, par_level: 12, ...over,
});

describe('daysUntil', () => {
  it('counts calendar days, not elapsed hours', () => {
    // 14:30 today to 00:00 tomorrow is under 24h but is still one day away.
    expect(daysUntil('2026-08-20T00:00:00', TODAY)).toBe(1);
    expect(daysUntil('2026-08-19T23:00:00', TODAY)).toBe(0);
  });

  it('goes negative for the past', () => {
    expect(daysUntil('2026-08-17T00:00:00', TODAY)).toBe(-2);
  });

  it('tolerates missing and unparseable dates', () => {
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil('not a date', TODAY)).toBeNull();
  });
});

describe('dueState', () => {
  it('separates overdue from due today, and counts both as due', () => {
    expect(dueState(scheduled('2026-08-17'), TODAY)).toBe('overdue');
    expect(dueState(scheduled('2026-08-19'), TODAY)).toBe('due');
    expect(isDue(scheduled('2026-08-17'), TODAY)).toBe(true);
    expect(isDue(scheduled('2026-08-19'), TODAY)).toBe(true);
  });

  it('does not count a lookahead as due', () => {
    // 'soon' is a UI affordance; the server's rule is due_date <= today.
    expect(dueState(scheduled('2026-08-23'), TODAY)).toBe('soon');
    expect(isDue(scheduled('2026-08-23'), TODAY)).toBe(false);
  });

  it('says nothing about an item that is not on a schedule', () => {
    expect(dueState(supply(), TODAY)).toBe('none');
    expect(dueState(scheduled(null), TODAY)).toBe('none');
  });
});

describe('stockState', () => {
  it('reports out, reorder, low and ok against the levels set', () => {
    expect(stockState(supply({ quantity: 0 }))).toBe('out');
    expect(stockState(supply({ quantity: 3 }))).toBe('reorder');   // at the reorder point
    expect(stockState(supply({ quantity: 8 }))).toBe('low');       // under par
    expect(stockState(supply({ quantity: 12 }))).toBe('ok');       // at par
  });

  it('does not claim ok for a supply with no levels set', () => {
    // Reporting 'ok' would be a judgement nobody made.
    expect(stockState(supply({ reorder_point: null, par_level: null }))).toBe('none');
  });

  it('still calls an untracked supply out when it is at zero', () => {
    expect(stockState(supply({ reorder_point: null, par_level: null, quantity: 0 }))).toBe('out');
  });

  it('ignores items not stock-tracked at all', () => {
    expect(stockState(supply({ tracking_level: 'none', quantity: 0 }))).toBe('none');
  });

  it('separates below-minimum from merely low', () => {
    expect(isBelowMinimum(supply({ quantity: 3 }))).toBe(true);
    expect(isBelowMinimum(supply({ quantity: 8 }))).toBe(false);
    expect(isLowStock(supply({ quantity: 8 }))).toBe(true);
  });
});

describe('readinessByCategory', () => {
  const items = [
    supply({ id: 1, category: 'Airway', quantity: 12 }),   // ok
    supply({ id: 2, category: 'Airway', quantity: 2 }),    // reorder
    supply({ id: 3, category: 'Airway', quantity: 8 }),    // low
    supply({ id: 4, category: 'Nutrition', quantity: 12 }), // ok
  ];

  it('is the share of a category stocked to plan', () => {
    const byName = Object.fromEntries(readinessByCategory(items).map((g) => [g.category, g]));
    expect(byName.Airway.percent).toBe(33);      // 1 of 3
    expect(byName.Nutrition.percent).toBe(100);  // 1 of 1
  });

  it('counts supplies rather than summing quantities across units', () => {
    // Boxes and millilitres do not add up; a count survives the mixed units.
    const mixed = [
      supply({ id: 1, category: 'Airway', quantity: 1000, unit_of_measure: 'ml', par_level: 1 }),
      supply({ id: 2, category: 'Airway', quantity: 0, unit_of_measure: 'BX' }),
    ];
    expect(readinessByCategory(mixed)[0].percent).toBe(50);
  });

  it('excludes supplies with no levels set from both halves', () => {
    const withUntracked = [...items, supply({ id: 9, category: 'Airway', reorder_point: null, par_level: null })];
    const airway = readinessByCategory(withUntracked).find((g) => g.category === 'Airway');
    expect(airway.total).toBe(3);
  });

  it('reports each category below minimum, and the total', () => {
    const airway = readinessByCategory(items).find((g) => g.category === 'Airway');
    expect(airway.belowMinimum).toBe(1);
    expect(belowMinimumCount(items)).toBe(1);
  });

  it('leads with the least ready category', () => {
    expect(readinessByCategory(items)[0].category).toBe('Airway');
  });

  it('groups uncategorised supplies rather than dropping them', () => {
    expect(readinessByCategory([supply({ category: null })])[0].category).toBe('Uncategorised');
  });
});

describe('attentionItems', () => {
  it('lists the worst first', () => {
    const rows = attentionItems([
      supply({ id: 1, name: 'Low one', quantity: 8 }),
      scheduled('2026-08-17', { id: 2, name: 'Overdue one' }),
      supply({ id: 3, name: 'Out one', quantity: 0 }),
    ], TODAY);
    expect(rows.map((r) => r.lead)).toEqual(['overdue', 'out', 'low']);
  });

  it('shows an item once when it is both due and short, most urgent first', () => {
    const both = { ...supply({ quantity: 0, id: 5, name: 'Both' }), scheduled_replacement: true, due_date: '2026-08-19' };
    const rows = attentionItems([both], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].reasons).toEqual(['out', 'due']);
  });

  it('leaves healthy items out', () => {
    expect(attentionItems([supply({ quantity: 12 }), scheduled('2026-12-01')], TODAY)).toEqual([]);
  });
});

describe('upcomingChanges', () => {
  it('groups by the day a change falls due', () => {
    const groups = upcomingChanges([
      scheduled('2026-08-26', { id: 1, name: 'Nebuliser kit' }),
      scheduled('2026-08-19', { id: 2, name: 'Vent tube' }),
      scheduled('2026-08-19', { id: 3, name: 'Humidification chamber' }),
    ], TODAY);
    expect(groups.map((g) => g.inDays)).toEqual([0, 7]);
    expect(groups[0].items.map((i) => i.name)).toEqual(['Humidification chamber', 'Vent tube']);
    expect(groups[0].isToday).toBe(true);
  });

  it('folds an overdue change into today rather than heading a past date', () => {
    const groups = upcomingChanges([scheduled('2026-08-10', { name: 'Late' })], TODAY);
    expect(groups[0].inDays).toBe(0);
    expect(groups[0].isToday).toBe(true);
  });

  it('stops at the horizon', () => {
    expect(upcomingChanges([scheduled('2026-12-01')], TODAY)).toEqual([]);
  });

  it('ignores items with no schedule', () => {
    expect(upcomingChanges([supply()], TODAY)).toEqual([]);
  });
});

describe('overviewCounts', () => {
  it('counts what the four tiles claim', () => {
    const equipment = [
      scheduled('2026-08-17', { id: 1 }),
      scheduled('2026-08-19', { id: 2 }),
      supply({ id: 3, quantity: 0 }),
      supply({ id: 4, quantity: 12 }),
    ];
    const counts = overviewCounts(equipment, [{ id: 1 }], TODAY);
    expect(counts).toEqual({ tracked: 4, dueNow: 2, lowStock: 1, incoming: 1 });
  });

  it('is all zeroes for an empty catalogue rather than throwing', () => {
    expect(overviewCounts()).toEqual({ tracked: 0, dueNow: 0, lowStock: 0, incoming: 0 });
  });
});

describe('missing data is not a claim', () => {
  it('does not call a supply out just because no quantity was recorded', () => {
    // Every real row has a quantity, but a partial payload should not
    // manufacture an out-of-stock warning nobody reported.
    expect(stockState(supply({ quantity: undefined, reorder_point: null, par_level: null })))
      .toBe('none');
    expect(stockState(supply({ quantity: null }))).toBe('none');
  });

  it('reads a bare YYYY-MM-DD as a local date, not UTC midnight', () => {
    // Parsed as UTC this lands on the 18th anywhere west of Greenwich, and a
    // change due today would report as overdue.
    expect(dueState(scheduled('2026-08-19'), TODAY)).toBe('due');
    expect(daysUntil('2026-08-19', TODAY)).toBe(0);
  });
});
