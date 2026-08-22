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
// History view of the live Equipment panel: the most recent scheduled
// changes for the patient, optionally narrowed to one supply. One line per
// change, hairline-separated inside a single box.
import { EmSelect } from '../vc/EntityModal';
import { formatChangedAt } from './equipmentStatus';
import '../schedule/schedule-panel.css';
import './equipment-panel.css';

export default function EquipmentHistory({ items, rows, loading, error, filter, onFilter }) {
  return (
    <div>
      <div className="eq-filter">
        <label className="eq-filter-label" htmlFor="eq-hist-filter">Show</label>
        <EmSelect id="eq-hist-filter" value={filter} onChange={(e) => onFilter(e.target.value)}>
          <option value="">All supplies</option>
          {items.map((it) => (
            <option key={it.id} value={String(it.id)}>{it.name}</option>
          ))}
        </EmSelect>
      </div>

      {error ? (
        <div className="em-error">{error}</div>
      ) : loading ? (
        <div className="ld-dose-empty">Loading history…</div>
      ) : !rows.length ? (
        <div className="ld-dose-empty">No changes recorded</div>
      ) : (
        <ul className="eq-hist">
          {rows.map((row) => (
            <li key={row.id} className="eq-hist-row">
              <span className="eq-hist-name">{row.equipment_name}</span>
              <span className="eq-hist-when">{formatChangedAt(row.changed_at)}</span>
              {(row.changed_by_name || row.notes) && (
                <span className="eq-hist-meta">
                  {row.changed_by_name}
                  {row.changed_by_name && row.notes ? ' · ' : ''}
                  {row.notes}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
