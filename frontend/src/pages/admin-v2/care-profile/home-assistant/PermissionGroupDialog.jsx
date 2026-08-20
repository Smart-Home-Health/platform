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
// One group of MQTT sections, each with its direction. Get is Home Assistant
// reading from us, Set is Home Assistant writing back, Both is both ways.
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { MQTT_SECTIONS, permOptionsForSection, permSelectClass } from '../../mqttConstants';

const labelOf = (id) => MQTT_SECTIONS.find((s) => s.id === id)?.label || id;

export default function PermissionGroupDialog({
  group, sections, open, onOpenChange, onSave, saving, error,
}) {
  const [values, setValues] = useState({});

  useEffect(() => {
    if (!group || !open) return;
    setValues(Object.fromEntries(
      group.sections.map((id) => [id, sections[id] || 'off'])));
  }, [group, sections, open]);

  if (!group) return null;

  const submit = (e) => {
    e.preventDefault();
    onSave({ ...sections, ...values });
  };

  const setAll = (value) => setValues(Object.fromEntries(
    group.sections.map((id) => [
      id,
      // A read-only section cannot be given a write direction.
      permOptionsForSection(id).some((o) => o.value === value) ? value : 'get',
    ])));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{group.label}</DialogTitle>
          <DialogDescription>
            Get is Home Assistant reading this from the hub. Set is Home Assistant
            writing it back. Off is never published.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive" role="alert">{error}</Alert>}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setAll('get')}>
              All read-only
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAll('off')}>
              All off
            </Button>
          </div>

          <div className="divide-y divide-border/60 rounded-lg border border-border">
            {group.sections.map((id) => (
              <div key={id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-foreground">{labelOf(id)}</span>
                <select
                  className={`${permSelectClass} max-w-[8rem]`}
                  aria-label={`${labelOf(id)} permission`}
                  value={values[id] || 'off'}
                  onChange={(e) => setValues((prev) => ({ ...prev, [id]: e.target.value }))}
                >
                  {permOptionsForSection(id).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save permissions'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
