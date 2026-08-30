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
// Add a care profile. Moved out of the old Patients page unchanged in
// behaviour — the directory shell owns the list, each tab owns its own form.
import { useState } from 'react';
import config, { apiFetch } from '../../../config';
import PatientFormFields from '../../../components/PatientFormFields';
import EntityModal from '../../../components/vc/EntityModal';

const emptyForm = {
  first_name: '', last_name: '', date_of_birth: '',
  medical_record_number: '', notes: '', is_active: true, care_area: '',
};

export default function CreateCareProfileDialog({ open, onOpenChange, onCreated }) {
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const close = () => { onOpenChange(false); setFormData(emptyForm); setError(null); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        is_active: formData.is_active,
      };
      if (formData.date_of_birth) payload.date_of_birth = formData.date_of_birth;
      if (formData.medical_record_number) payload.medical_record_number = formData.medical_record_number;
      if (formData.notes) payload.notes = formData.notes;
      if (formData.care_area) payload.care_area = formData.care_area;
      const res = await apiFetch(`${config.apiUrl}/api/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail
          : 'Could not create this care profile.');
      }
      close();
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityModal open={open} onOpenChange={(o) => { if (!o) close(); }} title="Add care profile" wide>
      <form onSubmit={submit} className="em-form">
        {error && <div className="em-error" role="alert">{error}</div>}
        <PatientFormFields formData={formData} setFormData={setFormData} />
        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={close}>Cancel</button>
          <button type="submit" className="em-submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create profile'}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
