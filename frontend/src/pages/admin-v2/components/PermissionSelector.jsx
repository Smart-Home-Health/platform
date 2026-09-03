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

// Category-grouped permission toggle pills, shared by the role create dialog and
// the role detail page. vc-native so it matches whichever surface hosts it —
// previously Tailwind utilities, which resolved to the legacy palette outside
// a `.tw` island.
export function PermissionSelector({ permissionsByCategory, selectedIds, onToggle }) {
  const categories = Object.entries(permissionsByCategory);
  if (categories.length === 0) {
    return <p className="cfg-empty">No permissions available</p>;
  }
  return (
    <div className="cfg-perms">
      {categories.map(([category, perms]) => (
        <div key={category} className="cfg-perm-group">
          <h4 className="cfg-perm-cat">{category}</h4>
          <div className="cfg-perm-row">
            {perms.map(perm => {
              const isSelected = selectedIds.includes(perm.id);
              const action = perm.name.includes('.') ? perm.name.split('.').pop() : perm.name;
              const displayAction = action.charAt(0).toUpperCase() + action.slice(1);
              return (
                <button
                  key={perm.id}
                  type="button"
                  onClick={() => onToggle(perm.id)}
                  title={perm.display_name}
                  aria-pressed={isSelected}
                  className={`cfg-perm${isSelected ? ' on' : ''}`}
                >
                  {displayAction}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default PermissionSelector;
