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
    <EntityModal
      open={open}
      onOpenChange={(o) => { if (!o) onClose?.(); }}
      title={`Record Dose — ${medication.name}`}
    >
      <div className="em-form">
        {error && <div className="em-error">{error}</div>}

        {medication.instructions && (
          <p className="sch-note">{medication.instructions}</p>
        )}

        <EmField label="Dose Amount" required htmlFor="dose-amount">
          <span className="sch-dose">
            <input
              id="dose-amount"
              className="em-input"
              type="number"
              step="0.1"
              value={form.dose_amount}
              onChange={e => setForm({ ...form, dose_amount: e.target.value })}
              placeholder="Amount given"
            />
            <span className="sch-dose-unit">
              {form.dose_unit || medication.quantity_unit || 'units'}
            </span>
          </span>
        </EmField>

        <EmField label="Given At" required htmlFor="dose-given-at">
          <input
            id="dose-given-at"
            className="em-input"
            type="datetime-local"
            value={form.given_at}
            onChange={e => setForm({ ...form, given_at: e.target.value })}
          />
        </EmField>

        <EmField label="Notes" optional htmlFor="dose-notes">
          <textarea
            id="dose-notes"
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
            disabled={saving || !form.dose_amount}
          >
            {saving ? 'Saving...' : 'Record Administration'}
          </button>
        </div>
      </div>
    </EntityModal>
  );
};

export default MedicationDoseModal;
