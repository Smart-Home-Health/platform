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
// Care profile → Care context. The room this person is cared for in, and the
// free-text notes the rest of the app surfaces alongside their record.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CareAreaField, NotesField } from '../../../components/PatientFormFields';
import { CfgSection, CfgGroup } from '../settings/CfgSection';
import CareProfileSection from './CareProfileSection';
import { STATUS_META, careContextSummary } from './careProfileSections';
import useCareProfile, { updateCareProfile } from './useCareProfile';

export default function AdminV2CareProfileContext() {
  const { patientId } = useParams();
  const { patient, setPatient, loading, error, setError } = useCareProfile(patientId);
  const [form, setForm] = useState({ care_area: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!patient) return;
    setForm({ care_area: patient.care_area || '', notes: patient.notes || '' });
  }, [patient]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      // Empty strings are sent on purpose: they are how a room or a note gets
      // cleared. (Nulls would be dropped by the API's partial-update filter.)
      setPatient(await updateCareProfile(patientId, {
        care_area: form.care_area.trim(),
        notes: form.notes,
      }));
      setNotice('Care context saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const status = STATUS_META[careContextSummary(patient).status];

  return (
    <CareProfileSection
      patientId={patientId}
      patient={patient}
      title="Care context"
      description="Optional. Notes and home-care preferences used across the app."
      status={status}
      loading={loading}
      error={error}
      notice={notice}
    >
      <CfgSection
        title="Room and notes"
        actions={
          <button type="submit" form="cp-ctx-form" className="em-submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save care context'}
          </button>
        }
      >
        <CfgGroup>
          <form id="cp-ctx-form" className="cfg-form" onSubmit={save}>
            <CareAreaField formData={form} setFormData={setForm} idPrefix="cp-ctx" />
            <NotesField
              formData={form}
              setFormData={setForm}
              idPrefix="cp-ctx"
              rows={6}
              hint="Shown with this profile across the app — routines, preferences, anything a caregiver arriving today would want to know."
            />
          </form>
        </CfgGroup>
      </CfgSection>
    </CareProfileSection>
  );
}
