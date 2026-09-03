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
// Days-of-supply bar for a medication entity card. Only renders when the
// backend could actually project a rate (days-type threshold + an active
// schedule) — as-needed meds and quantity-threshold meds fall back to the
// plain "on hand" detail row instead, since there's nothing to project.
const CAP_DAYS = 30; // fill percentage flattens out beyond a month of supply

const MedStockBar = ({ daysLeft, low }) => {
  if (daysLeft == null) return null;
  const pct = Math.max(4, Math.min(100, (daysLeft / CAP_DAYS) * 100));

  return (
    <div className="med-stock">
      <div className={`med-stock-label ${low ? 'low' : 'ok'}`}>
        <span>{daysLeft < 1 ? '<1 day left' : `~${daysLeft.toFixed(1)} days left`}</span>
        <span className="med-stock-status">{low ? 'Low stock' : 'Stock OK'}</span>
      </div>
      <div className="med-stock-bar">
        <div className={`med-stock-fill ${low ? 'low' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default MedStockBar;
