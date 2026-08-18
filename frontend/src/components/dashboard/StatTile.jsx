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

/* One live-vital tile: label, source caption, big value, AVG/MIN/MAX row.
 * `accent` is a literal color (vc state tokens at the call site). `stats`
 * is null (hidden) or { avg, min, max } preformatted strings. */
export default function StatTile({ label, source, value, unit, accent, stats }) {
  return (
    <div className="ld-tile" style={{ '--ld-accent': accent }}>
      <div className="ld-tile-head">
        <span className="ld-tile-label">{label}</span>
        <span className="ld-tile-tick" aria-hidden="true" />
      </div>
      {source && <div className="ld-tile-source">{source}</div>}
      <div className="ld-tile-value-row">
        <span className="ld-tile-value">{value ?? '--'}</span>
        <span className="ld-tile-unit">{unit}</span>
      </div>
      {stats && (
        <div className="ld-tile-stats">
          <span><em>Avg</em>{stats.avg}</span>
          <span><em>Min</em>{stats.min}</span>
          <span><em>Max</em>{stats.max}</span>
        </div>
      )}
    </div>
  );
}
