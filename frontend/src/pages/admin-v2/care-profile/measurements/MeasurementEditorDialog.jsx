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
// Editor for one measurement's expected range. Blood pressure gets a pair of
// rows (systolic / diastolic) because that is where its bounds live; every
// other vital is a single pair of numbers.
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { numOrNull, rowPayload, saveRanges } from './rangeApi';

const text = (v) => (v === null || v === undefined ? '' : String(v));

export default function MeasurementEditorDialog({ patientId, row, open, onOpenChange, onSaved }) {
  const [bounds, setBounds] = useState({});
  const [required, setRequired] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Editable rows: the components for blood pressure, the vital itself
  // otherwise. Re-seeded whenever a different measurement is opened.
  const editable = row ? (row.components.length ? row.components : [row.parent]) : [];

  useEffect(() => {
    if (!row || !open) return;
    const rows = row.components.length ? row.components : [row.parent];
    const next = {};
    rows.forEach((r) => {
      next[r.field_key || ''] = {
        min: text(r.expected_min),
        max: text(r.expected_max),
      };
    });
    setBounds(next);
    setRequired(Boolean(row.required));
    setNote(row.parent.note || '');
    setError('');
  }, [row, open]);

  const setBound = (fieldKey, which, value) => {
    setBounds((prev) => ({ ...prev, [fieldKey]: { ...prev[fieldKey], [which]: value } }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const edited = (fieldKey) => bounds[fieldKey || ''] || { min: '', max: '' };
      const payload = [];

      if (row.components.length) {
        // The parent row carries the required flag; the components carry bounds.
        payload.push(rowPayload(row.parent, { required, note: note.trim() || null }));
        row.components.forEach((c) => {
          payload.push(rowPayload(c, {
            expected_min: numOrNull(edited(c.field_key).min),
            expected_max: numOrNull(edited(c.field_key).max),
            required: false,
          }));
        });
      } else {
        payload.push(rowPayload(row.parent, {
          expected_min: numOrNull(edited('').min),
          expected_max: numOrNull(edited('').max),
          required,
          note: note.trim() || null,
        }));
      }

      await saveRanges(patientId, payload);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{row.label}</DialogTitle>
          <DialogDescription>
            Readings outside the expected range are flagged on capture and asked about
            before they are saved. Leave a field blank for no bound.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="flex flex-col gap-4">
          {error && <Alert variant="destructive" role="alert">{error}</Alert>}

          {editable.map((r) => {
            const fieldKey = r.field_key || '';
            const id = `meas-${row.key}-${fieldKey || 'value'}`;
            const value = bounds[fieldKey] || { min: '', max: '' };
            return (
              <div key={id} className="flex flex-col gap-2">
                {row.components.length > 0 && (
                  <h4 className="text-sm font-semibold text-foreground">{r.label || fieldKey}</h4>
                )}
                <FormRow>
                  <Field label={`Expected min${row.unit ? ` (${row.unit})` : ''}`} htmlFor={`${id}-min`}>
                    <Input
                      id={`${id}-min`}
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={value.min}
                      onChange={(e) => setBound(fieldKey, 'min', e.target.value)}
                    />
                  </Field>
                  <Field label={`Expected max${row.unit ? ` (${row.unit})` : ''}`} htmlFor={`${id}-max`}>
                    <Input
                      id={`${id}-max`}
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={value.max}
                      onChange={(e) => setBound(fieldKey, 'max', e.target.value)}
                    />
                  </Field>
                </FormRow>
              </div>
            );
          })}

          <label className="flex w-fit cursor-pointer items-center gap-2">
            <Checkbox checked={required} onCheckedChange={(v) => setRequired(v === true)} />
            <span className="text-sm text-foreground">Required to complete an encounter</span>
          </label>

          <Field label="Note (optional)" htmlFor={`meas-${row.key}-note`}>
            <Textarea
              id={`meas-${row.key}-note`}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why these bounds — who asked for them, when they were reviewed…"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save measurement'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
