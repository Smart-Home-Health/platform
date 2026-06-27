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
import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// Scrollable checkbox list used for role / patient assignment on the user
// create dialog and the user detail page.
export function ToggleList({ items, selectedIds, onToggle, getId, renderLabel, isDisabled, empty }) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-background/40 p-3 text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-background/40 p-2">
      {items.map(item => {
        const id = getId(item);
        const disabled = isDisabled ? isDisabled(item) : false;
        return (
          <label
            key={id}
            className={cn(
              'flex items-start gap-2 rounded px-2 py-1.5',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-accent'
            )}
          >
            <Checkbox
              className="mt-0.5"
              checked={selectedIds.includes(id)}
              onCheckedChange={() => onToggle(id)}
              disabled={disabled}
            />
            <span className="text-sm text-foreground">{renderLabel(item)}</span>
          </label>
        );
      })}
    </div>
  );
}

export default ToggleList;
