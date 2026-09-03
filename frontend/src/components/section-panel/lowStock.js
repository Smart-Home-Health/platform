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

/**
 * Is this medication running low on hand?
 *
 * Low stock is a real per-medication setting, not a guess: `low_stock_threshold`
 * is NULL when the medication opts out of alerting entirely, and
 * `low_stock_threshold_type` says how to read it — 'quantity' is the raw
 * on-hand amount, 'days' is days of supply projected from the medication's
 * schedules.
 *
 * Only 'quantity' can be judged from a medication record alone. 'days' needs a
 * schedule projection the client does not have, and a PRN medication has no
 * schedule to project from, so it is reported as not-low rather than guessed
 * at — a wrong amber on a controlled medication is worse than no amber.
 */
export function isLowStock(med) {
  if (!med || med.low_stock_threshold == null) return false;
  if ((med.low_stock_threshold_type || 'quantity') !== 'quantity') return false;
  // An unknown quantity is not a zero quantity: `Number(null)` is 0, which
  // would read as "none left" and flag a medication nobody has counted.
  if (med.quantity == null) return false;
  const qty = Number(med.quantity);
  const threshold = Number(med.low_stock_threshold);
  if (!Number.isFinite(qty) || !Number.isFinite(threshold)) return false;
  return qty <= threshold;
}
