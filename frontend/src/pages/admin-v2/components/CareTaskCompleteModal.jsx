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
import { useEffect, useState } from 'react';
import config from '../../../config';
import {
  getCurrentLocalDateTime,
  localDateTimeToUTC,
} from '../../../utils/timezone';
import EntityModal, { EmField } from '../../../components/vc/EntityModal';
import '../vc-schedule.css';

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

  const categoryColor = task.category_color || 'var(--vc-series-3)';

  return (
    <EntityModal
      open={open}
      onOpenChange={(o) => { if (!o) onClose?.(); }}
      title={`Log Care Task — ${task.name}`}
    >
      <div className="em-form">
        {/* Category identity on a dot, never a stripe or a coloured pill. */}
        {task.category_name && (
          <span className="sch-group-head">
            <span className="sch-dot" style={{ background: categoryColor }} />
            {task.category_name}
          </span>
        )}

        {error && <div className="em-error">{error}</div>}

        {task.description && (
          <p className="sch-note">{task.description}</p>
        )}

        <EmField label="Completed At" required htmlFor="task-completed-at">
          <input
            id="task-completed-at"
            className="em-input"
            type="datetime-local"
            value={form.completed_at}
            onChange={e => setForm({ ...form, completed_at: e.target.value })}
          />
        </EmField>

        <EmField label="Notes" optional htmlFor="task-notes">
          <textarea
            id="task-notes"
            className="em-input"
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />
        </EmField>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="em-submit"
            onClick={handleSave}
            disabled={saving || !form.completed_at}
          >
            {saving ? 'Saving...' : 'Mark Done'}
          </button>
        </div>
      </div>
    </EntityModal>
  );
};

export default CareTaskCompleteModal;
