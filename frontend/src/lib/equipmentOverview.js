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
// What the Equipment overview claims, derived in one place.
//
// The page states several numbers that have to agree with the pages they link
// to -- what is due, what is short, how ready a category is -- so the rules
// live here with tests rather than inline in the panels.
//
// Due dates are the server's: get_equipment_list already returns due_date as
// last_changed + useful_days, and get_equipment_due_count calls an item due
// when that date is today or past. This matches both rather than inventing a
// third rule.

/** Local midnight, so "due today" means the calendar day, not 24 hours.
 *
 * A bare 'YYYY-MM-DD' is parsed by the platform as UTC midnight, which lands
 * on the previous day everywhere west of Greenwich -- enough on its own to
 * report a change due today as overdue. Those are read as local dates; values
 * that carry a time are left to the normal parser.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const startOfDay = (date) => {
  if (typeof date === 'string' && DATE_ONLY.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from today to a date: negative is in the past. */
export function daysUntil(dateish, today = new Date()) {
  if (!dateish) return null;
  const then = startOfDay(dateish);
  if (Number.isNaN(then.getTime())) return null;
  return Math.round((then - startOfDay(today)) / DAY_MS);
}

/**
 * Where a scheduled change stands.
 *
 * 'overdue' and 'due' are both counted as due by the server's own rule
 * (due_date <= today); they are separated here only so the UI can say which.
 * 'soon' is a UI-side lookahead and is deliberately NOT counted as due.
 */
export function dueState(item, today = new Date(), soonDays = 7) {
  if (!item?.scheduled_replacement || !item.due_date) return 'none';
  const days = daysUntil(item.due_date, today);
  if (days === null) return 'none';
  if (days < 0) return 'overdue';
  if (days === 0) return 'due';
  if (days <= soonDays) return 'soon';
  return 'ok';
}

export const isDue = (item, today = new Date()) => ['overdue', 'due'].includes(dueState(item, today));

/**
 * Where a supply's stock stands against the levels set for it.
 *
 * An item with no reorder point and no par level is not tracked for stock at
 * all, and reports 'none' rather than a reassuring 'ok' it has not earned.
 */
export function stockState(item) {
  if (!item) return 'none';
  if ((item.tracking_level || 'item') === 'none') return 'none';
  // No quantity at all is unknown, not empty: only a recorded 0 means out.
  if (item.quantity == null) return 'none';
  const qty = item.quantity;
  const reorder = item.reorder_point;
  const par = item.par_level;
  if (reorder == null && par == null) return qty === 0 ? 'out' : 'none';
  if (qty === 0) return 'out';
  if (reorder != null && qty <= reorder) return 'reorder';
  if (par != null && qty < par) return 'low';
  return 'ok';
}

export const isLowStock = (item) => ['out', 'reorder', 'low'].includes(stockState(item));
export const isBelowMinimum = (item) => ['out', 'reorder'].includes(stockState(item));

/**
 * Readiness per category, as the share of that category's tracked supplies
 * sitting at or above par.
 *
 * Deliberately a count, not a sum of quantities: a category mixes boxes of
 * catheters with millilitres of saline, and adding those together would
 * produce a percentage that means nothing. "How many of these supplies are
 * stocked to plan" is a question the units survive.
 *
 * Supplies with no levels set are excluded from both halves of the ratio —
 * counting them as ready would inflate the bar for items nobody has told the
 * system how to stock.
 */
export function readinessByCategory(equipment = []) {
  const groups = new Map();
  for (const item of equipment) {
    if (stockState(item) === 'none') continue;
    const key = item.category || 'Uncategorised';
    if (!groups.has(key)) groups.set(key, { category: key, total: 0, ready: 0, belowMinimum: 0 });
    const g = groups.get(key);
    g.total += 1;
    if (stockState(item) === 'ok') g.ready += 1;
    if (isBelowMinimum(item)) g.belowMinimum += 1;
  }
  return [...groups.values()]
    .map((g) => ({ ...g, percent: g.total ? Math.round((g.ready / g.total) * 100) : 0 }))
    .sort((a, b) => a.percent - b.percent || a.category.localeCompare(b.category));
}

/** How many supplies are at or below their reorder point, across every category. */
export const belowMinimumCount = (equipment = []) => equipment.filter(isBelowMinimum).length;

/**
 * The things that want a person, worst first.
 *
 * Two independent reasons — a change is due, or stock has run short — and an
 * item can carry both, in which case it appears once with the more urgent
 * reason leading.
 */
const RANK = { overdue: 0, out: 1, due: 2, reorder: 3, low: 4, soon: 5 };

export function attentionItems(equipment = [], today = new Date()) {
  const rows = [];
  for (const item of equipment) {
    const due = dueState(item, today);
    const stock = stockState(item);
    const reasons = [];
    if (['overdue', 'due', 'soon'].includes(due)) reasons.push(due);
    if (['out', 'reorder', 'low'].includes(stock)) reasons.push(stock);
    if (reasons.length === 0) continue;
    reasons.sort((a, b) => RANK[a] - RANK[b]);
    rows.push({ item, reasons, lead: reasons[0], rank: RANK[reasons[0]] });
  }
  return rows.sort((a, b) => a.rank - b.rank
    || String(a.item.name || '').localeCompare(String(b.item.name || '')));
}

/**
 * Scheduled changes ahead, grouped by the day they fall due.
 *
 * Anything already overdue is folded into today rather than given a heading
 * in the past — the question the panel answers is what to do next, and an
 * overdue change is due now.
 */
export function upcomingChanges(equipment = [], today = new Date(), horizonDays = 30) {
  const byDay = new Map();
  for (const item of equipment) {
    if (!item.scheduled_replacement || !item.due_date) continue;
    const days = daysUntil(item.due_date, today);
    if (days === null || days > horizonDays) continue;
    const key = days < 0 ? 0 : days;
    if (!byDay.has(key)) byDay.set(key, { inDays: key, items: [] });
    byDay.get(key).items.push(item);
  }
  return [...byDay.values()]
    .sort((a, b) => a.inDays - b.inDays)
    .map((group) => ({
      ...group,
      date: new Date(startOfDay(today).getTime() + group.inDays * DAY_MS),
      isToday: group.inDays === 0,
      items: group.items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    }));
}

/** The four numbers across the top. */
export function overviewCounts(equipment = [], shipments = [], today = new Date()) {
  return {
    tracked: equipment.length,
    dueNow: equipment.filter((item) => isDue(item, today)).length,
    lowStock: equipment.filter(isLowStock).length,
    incoming: shipments.length,
  };
}
