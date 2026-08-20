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
// Which readings an encounter needs before it counts as complete. The flag
// lives on each measurement's vital-level row; this is the one place to see
// them side by side.
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { rowPayload, saveRanges } from './rangeApi';

export default function CompletionRulesDialog({
  patientId, rows, open, onOpenChange, onSaved,
}) {
  const [required, setRequired] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRequired(Object.fromEntries(rows.map((r) => [r.key, r.required])));
    setError('');
  }, [rows, open]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Only the measurements whose flag actually moved.
      const changed = rows.filter((r) => Boolean(required[r.key]) !== r.required);
      if (changed.length) {
        await saveRanges(patientId, changed.map((r) =>
          rowPayload(r.parent, { required: Boolean(required[r.key]) })));
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const count = Object.values(required).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Completion rules</DialogTitle>
          <DialogDescription>
            A capture encounter is complete once every required reading is in. Anything
            unticked can still be recorded — it just is not waited for.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="flex flex-col gap-4">
          {error && <Alert variant="destructive" role="alert">{error}</Alert>}

          <div className="divide-y divide-border/60 rounded-lg border border-border">
            {rows.map((r) => (
              <label
                key={r.key}
                className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.summary}</span>
                </span>
                <Checkbox
                  checked={Boolean(required[r.key])}
                  onCheckedChange={(v) => setRequired((prev) => ({ ...prev, [r.key]: v === true }))}
                />
              </label>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            {count === 0
              ? 'No readings required — an encounter can be saved with any of them.'
              : `${count} ${count === 1 ? 'reading' : 'readings'} required per encounter.`}
          </p>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save rules'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
