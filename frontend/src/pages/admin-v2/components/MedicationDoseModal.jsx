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
import React, { useEffect, useState } from 'react';
import config from '../../../config';
import {
  getCurrentLocalDateTime,
  localDateTimeToUTC,
} from '../../../utils/timezone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';

const emptyForm = () => ({
  dose_amount: '',
  dose_unit: '',
  given_at: '',
  notes: '',
});

/**
 * Shared "administer medication" modal used by the schedule's PRN flow and
 * the meds overview's Dose button. Submits an ad-hoc administration (no
 * schedule_id), with the user-supplied "Given At" plumbed through as
 * administered_at.
 *
 * Props:
 *   open            — boolean
 *   onClose         — () => void
 *   onSaved         — () => void
 *   patient         — { id }
 *   medication      — { id, name, instructions, quantity_unit, schedules?: [...] }
 *   defaultDateTime — datetime-local string to seed given_at on a fresh open
 */
const MedicationDoseModal = ({ open, onClose, onSaved, patient, medication, defaultDateTime }) => {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !medication) return;
    // Pre-fill dose from the med's first schedule when present — PRN meds
    // often have no scheduled dose and the caregiver supplies one.
    const firstSchedule = medication.schedules?.[0];
    setError(null);
    setForm({
      dose_amount: firstSchedule?.dose_amount?.toString() || '',
      dose_unit: firstSchedule?.dose_unit || medication.quantity_unit || '',
      given_at: defaultDateTime || getCurrentLocalDateTime(),
      notes: '',
    });
  }, [open, medication, defaultDateTime]);

  if (!medication) return null;

  const handleSave = async () => {
    if (!patient) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiUrl}/api/medications/${medication.id}/administer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id: patient.id,
          dose_amount: parseFloat(form.dose_amount) || 0,
          notes: form.notes || null,
          administered_at: localDateTimeToUTC(form.given_at),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to record administration');
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Record Dose — {medication.name}</DialogTitle>
        </DialogHeader>

        {error && <Alert variant="destructive">{error}</Alert>}

        {medication.instructions && (
          <div className="rounded-md bg-secondary px-4 py-3 text-sm text-muted-foreground">
            {medication.instructions}
          </div>
        )}

        <Field label="Dose Amount" required>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              value={form.dose_amount}
              onChange={e => setForm({ ...form, dose_amount: e.target.value })}
              placeholder="Amount given"
              className="flex-1"
            />
            <span className="shrink-0 text-sm text-muted-foreground">
              {form.dose_unit || medication.quantity_unit || 'units'}
            </span>
          </div>
        </Field>

        <Field label="Given At" required>
          <Input
            type="datetime-local"
            value={form.given_at}
            onChange={e => setForm({ ...form, given_at: e.target.value })}
          />
        </Field>

        <Field label="Notes (optional)">
          <Textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />
        </Field>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !form.dose_amount}
          >
            {saving ? 'Saving...' : 'Record Administration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MedicationDoseModal;
