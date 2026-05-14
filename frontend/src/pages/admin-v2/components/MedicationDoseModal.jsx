import React, { useEffect, useState } from 'react';
import config from '../../../config';
import { XIcon } from '../../../components/Icons';
import {
  getCurrentLocalDateTime,
  localDateTimeToUTC,
} from '../../../utils/timezone';

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

  if (!open || !medication) return null;

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
    <div className="admin-v2-modal-overlay" onClick={onClose}>
      <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="admin-v2-modal-header">
          <h2>Record Dose — {medication.name}</h2>
          <button className="admin-v2-modal-close" onClick={onClose}>
            <XIcon size={20} />
          </button>
        </div>
        <div className="admin-v2-modal-body">
          {error && <div className="admin-v2-error-banner" style={{ marginBottom: '1rem' }}>{error}</div>}
          {medication.instructions && (
            <div style={{
              background: '#21262d', borderRadius: 6, padding: '0.75rem 1rem', marginBottom: '1rem',
              color: '#8b949e', fontSize: '0.85rem',
            }}>
              {medication.instructions}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="admin-v2-form-group">
              <label>Dose Amount *</label>
              <input
                type="number"
                step="0.1"
                value={form.dose_amount}
                onChange={e => setForm({ ...form, dose_amount: e.target.value })}
                placeholder="Amount given"
              />
            </div>
            <div className="admin-v2-form-group">
              <label>Unit</label>
              <input
                type="text"
                value={form.dose_unit}
                onChange={e => setForm({ ...form, dose_unit: e.target.value })}
                placeholder="mg, ml, tablets..."
              />
            </div>
          </div>
          <div className="admin-v2-form-group">
            <label>Given At *</label>
            <input
              type="datetime-local"
              value={form.given_at}
              onChange={e => setForm({ ...form, given_at: e.target.value })}
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
            disabled={saving || !form.dose_amount}
          >
            {saving ? 'Saving...' : 'Record Administration'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MedicationDoseModal;
