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
// Standard toolbar for entity-card pages: count tabs, search, optional
// filter select, Add. The mockup's single row cramps the search on phones,
// so this wraps to two rows there: counts + Add first, search + filter on
// their own full-width line.
import { PlusIcon, SearchIcon } from '../Icons';
import './entity-card.css';

export default function EntityToolbar({
  counts = [],       // [{ key, label, count }]
  activeCount,       // key of the selected count tab
  onCountChange,
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search…',
  filter,            // { value, onChange, options: [{value,label}], label } — or an array of these
  onAdd,
  addLabel = 'Add',
}) {
  return (
    <div className="ec-toolbar">
      <div className="ec-toolbar-row">
        {counts.length > 0 && (
          <div className="ec-counts" role="tablist">
            {counts.map((c) => (
              <button key={c.key} type="button" role="tab"
                      aria-selected={activeCount === c.key}
                      className={`ec-count ${activeCount === c.key ? 'selected' : ''}`}
                      onClick={() => onCountChange(c.key)}>
                {c.label} <span className="ec-count-num">{c.count}</span>
              </button>
            ))}
          </div>
        )}
        {onAdd && (
          <button type="button" className="ec-add" onClick={onAdd}>
            <PlusIcon size={16} /> {addLabel}
          </button>
        )}
      </div>
      <div className="ec-toolbar-row">
        <div className="ec-search">
          <SearchIcon size={16} />
          <input type="text" placeholder={searchPlaceholder} value={search}
                 onChange={(e) => onSearchChange(e.target.value)} />
        </div>
        {(Array.isArray(filter) ? filter : filter ? [filter] : []).map((f) => (
          <label key={f.label} className="ec-filter">
            <span className="ec-filter-label">{f.label}</span>
            <select value={f.value} onChange={(e) => f.onChange(e.target.value)}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
