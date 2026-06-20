/*
 * Smart Home Health Hub
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
import React from 'react';
import { cn } from '@/lib/utils';

// Category-grouped permission toggle pills, shared by the role create dialog and
// the role detail page.
export function PermissionSelector({ permissionsByCategory, selectedIds, onToggle }) {
  const categories = Object.entries(permissionsByCategory);
  if (categories.length === 0) {
    return <p className="text-sm text-muted-foreground">No permissions available</p>;
  }
  return (
    <div className="flex max-h-64 flex-col gap-4 overflow-y-auto rounded-md border border-border bg-background/40 p-3">
      {categories.map(([category, perms]) => (
        <div key={category} className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</h4>
          <div className="flex flex-wrap gap-2">
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
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    isSelected
                      ? 'border-ring bg-ring/20 text-foreground'
                      : 'border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
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
