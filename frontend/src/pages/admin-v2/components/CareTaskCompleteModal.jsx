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
  completed_at: '',
  notes: '',
});

/**
 * Shared "log care task" modal for the schedule's PRN flow. Submits an
 * ad-hoc completion (no schedule_id) against /api/care-tasks/{id}/complete
 * with the user-supplied "Completed At" plumbed through as completed_at.
 *
 * Props:
 *   open            — boolean
 *   onClose         — () => void
 *   onSaved         — () => void
 *   patient         — { id }
 *   task            — { id, name, description, category_name, category_color }
 *   defaultDateTime — datetime-local string to seed completed_at on a fresh open
 */
const CareTaskCompleteModal = ({ open, onClose, onSaved, patient, task, defaultDateTime }) => {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !task) return;
    setError(null);
    setForm({
      completed_at: defaultDateTime || getCurrentLocalDateTime(),
      notes: '',
    });
  }, [open, task, defaultDateTime]);

  if (!task) return null;

  const handleSave = async () => {
    if (!patient) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiUrl}/api/care-tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id: patient.id,
          completed_at: form.completed_at ? localDateTimeToUTC(form.completed_at) : null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to record completion');
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const categoryColor = task.category_color || '#a371f7';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            Log Care Task — {task.name}
            {task.category_name && (
              <span
                className="ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-xs font-semibold"
                style={{
                  backgroundColor: categoryColor + '20',
                  color: categoryColor,
                  border: `1px solid ${categoryColor}40`,
                }}
              >
                {task.category_name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {error && <Alert variant="destructive">{error}</Alert>}

        {task.description && (
          <div className="rounded-md bg-secondary px-4 py-3 text-sm text-muted-foreground">
            {task.description}
          </div>
        )}

        <Field label="Completed At" required>
          <Input
            type="datetime-local"
            value={form.completed_at}
            onChange={e => setForm({ ...form, completed_at: e.target.value })}
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
            disabled={saving || !form.completed_at}
          >
            {saving ? 'Saving...' : 'Mark Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CareTaskCompleteModal;
