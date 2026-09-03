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
import '../settings/settings-page.css';

// Scrollable checkbox list used for role / patient assignment on the user
// create dialog and the HA identity import dialog.
export function ToggleList({ items, selectedIds, onToggle, getId, renderLabel, isDisabled, empty }) {
  if (!items || items.length === 0) {
    return <p className="cfg-togglelist-empty">{empty}</p>;
  }
  return (
    <div className="cfg-togglelist">
      {items.map(item => {
        const id = getId(item);
        const disabled = isDisabled ? isDisabled(item) : false;
        return (
          <label key={id} className="em-check-row" data-disabled={disabled || undefined}>
            <input
              type="checkbox"
              className="em-check"
              checked={selectedIds.includes(id)}
              onChange={() => onToggle(id)}
              disabled={disabled}
            />
            <span className="em-check-label">{renderLabel(item)}</span>
          </label>
        );
      })}
    </div>
  );
}

export default ToggleList;
