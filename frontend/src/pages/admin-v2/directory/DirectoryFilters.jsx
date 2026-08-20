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
// The filter sheet behind the toolbar button. Edits a draft so closing without
// applying leaves the list alone.
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { DEFAULT_FILTERS, STALE_LOGIN_DAYS, TABS } from './directoryTabs';

export default function DirectoryFilters({
  tab, filters, roles = [], open, onOpenChange, onApply,
}) {
  const [draft, setDraft] = useState(filters);

  useEffect(() => { if (open) setDraft(filters); }, [open, filters]);

  const apply = (e) => {
    e.preventDefault();
    onApply(draft);
    onOpenChange(false);
  };

  const noun = TABS[tab].noun[1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Filter {noun}</DialogTitle>
          <DialogDescription>Narrow the list without losing your search.</DialogDescription>
        </DialogHeader>

        <form onSubmit={apply} className="flex flex-col gap-4">
          <Field label="Status">
            <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {tab === 'users' && (
            <>
              <Field label="Role">
                <Select value={String(draft.role)} onValueChange={(v) => setDraft({ ...draft, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={String(role.id)}>
                        {role.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <label className="flex w-fit cursor-pointer items-center gap-2">
                <Checkbox
                  checked={draft.stale}
                  onCheckedChange={(v) => setDraft({ ...draft, stale: v === true })}
                />
                <span className="text-sm text-foreground">
                  No sign-in in {STALE_LOGIN_DAYS} days
                </span>
              </label>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary"
                    onClick={() => setDraft({ ...DEFAULT_FILTERS, status: 'all' })}>
              Reset
            </Button>
            <Button type="submit">Apply</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
