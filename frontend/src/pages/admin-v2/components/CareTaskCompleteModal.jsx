import React, { useEffect, useState } from 'react';
import config from '../../../config';
import { XIcon } from '../../../components/Icons';
import {
  getCurrentLocalDateTime,
  localDateTimeToUTC,
} from '../../../utils/timezone';

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

  if (!open || !task) return null;

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
    <div className="admin-v2-modal-overlay" onClick={onClose}>
      <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="admin-v2-modal-header">
          <h2>
            Log Care Task — {task.name}
            {task.category_name && (
              <span
                style={{
                  marginLeft: '0.5rem',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: categoryColor + '20',
                  color: categoryColor,
                  border: `1px solid ${categoryColor}40`,
                  verticalAlign: 'middle',
                }}
              >
                {task.category_name}
              </span>
            )}
          </h2>
          <button className="admin-v2-modal-close" onClick={onClose}>
            <XIcon size={20} />
          </button>
        </div>
        <div className="admin-v2-modal-body">
          {error && <div className="admin-v2-error-banner" style={{ marginBottom: '1rem' }}>{error}</div>}
          {task.description && (
            <div style={{
              background: '#21262d', borderRadius: 6, padding: '0.75rem 1rem', marginBottom: '1rem',
              color: '#8b949e', fontSize: '0.85rem',
            }}>
              {task.description}
            </div>
          )}
          <div className="admin-v2-form-group">
            <label>Completed At *</label>
            <input
              type="datetime-local"
              value={form.completed_at}
              onChange={e => setForm({ ...form, completed_at: e.target.value })}
            />
          </div>
          <div className="admin-v2-form-group">
            <label>Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
        </div>
        <div className="admin-v2-modal-footer">
          <button type="button" className="admin-v2-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="admin-v2-btn admin-v2-btn-primary"
            onClick={handleSave}
            disabled={saving || !form.completed_at}
          >
            {saving ? 'Saving...' : 'Mark Done'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CareTaskCompleteModal;
