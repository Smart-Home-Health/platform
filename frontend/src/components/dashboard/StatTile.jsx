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
 * is null (hidden) or { avg, min, max } preformatted strings.
 *
 * On phones the tile is also the chart. `chart` is the trace to show when
 * flipped; passing `onFlip` makes the tile a button. The value does not go
 * away when the trace appears — it sits behind it, oversized, in the tile's
 * own accent at low alpha. Grey was the first instinct, but a greyed number
 * reads as stale or disabled, which is the opposite of what a live reading
 * is; keeping the accent says "this metric, right now" while still yielding
 * the foreground to the line. */
export default function StatTile({ label, source, value, unit, accent, stats, chart, flipped, onFlip }) {
  const body = (
    <>
      <div className="ld-tile-head">
        <span className="ld-tile-label">{label}</span>
        <span className="ld-tile-tick" aria-hidden="true" />
      </div>
      {source && <div className="ld-tile-source">{source}</div>}
      {flipped && chart ? (
        <div className="ld-tile-plot">
          <div className="ld-tile-ghost" aria-hidden="true">
            <span className="ld-tile-ghost-value">{value ?? '--'}</span>
            <span className="ld-tile-ghost-unit">{unit}</span>
          </div>
          <div className="ld-tile-trace">{chart}</div>
        </div>
      ) : (
        <div className="ld-tile-value-row">
          <span className="ld-tile-value">{value ?? '--'}</span>
          <span className="ld-tile-unit">{unit}</span>
        </div>
      )}
      {stats && (
        <div className="ld-tile-stats">
          <span><em>Avg</em>{stats.avg}</span>
          <span><em>Min</em>{stats.min}</span>
          <span><em>Max</em>{stats.max}</span>
        </div>
      )}
    </>
  );

  if (!onFlip) {
    return <div className="ld-tile" style={{ '--ld-accent': accent }}>{body}</div>;
  }

  return (
    <button
      type="button"
      className={`ld-tile ld-tile-flip${flipped ? ' flipped' : ''}`}
      style={{ '--ld-accent': accent }}
      onClick={onFlip}
      aria-pressed={!!flipped}
      aria-label={`${label}: ${flipped ? 'hide' : 'show'} trend`}
    >
      {body}
    </button>
  );
}
