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
// Care profile → Edit profile. Identity only: who this is. Room and notes
// live under Care context, and the active switch under Advanced on the hub.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IdentityFields } from '../../../components/PatientFormFields';
import { CfgSection, CfgGroup } from '../settings/CfgSection';
import CareProfileSection from './CareProfileSection';
import useCareProfile, { updateCareProfile } from './useCareProfile';

const emptyForm = {
  first_name: '', last_name: '', date_of_birth: '', medical_record_number: '',
};

export default function AdminV2CareProfileEdit() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { patient, setPatient, loading, error, setError } = useCareProfile(patientId);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!patient) return;
    setForm({
      first_name: patient.first_name || '',
      last_name: patient.last_name || '',
      date_of_birth: patient.date_of_birth ? patient.date_of_birth.split('T')[0] : '',
      medical_record_number: patient.medical_record_number || '',
    });
  }, [patient]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
      };
      if (form.date_of_birth) payload.date_of_birth = form.date_of_birth;
      if (form.medical_record_number) payload.medical_record_number = form.medical_record_number;
      setPatient(await updateCareProfile(patientId, payload));
      setNotice('Profile saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <CareProfileSection
      patientId={patientId}
      patient={patient}
      title="Edit profile"
      description="Names and record details. Everything else about this profile is set in its own section."
      loading={loading}
      error={error}
      notice={notice}
    >
      <CfgSection
        title="Identity"
        actions={
          <>
            <button
              type="button"
              className="em-cancel"
              onClick={() => navigate(`/care/configuration/patients/${patientId}`)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="cp-edit-form"
              className="em-submit"
              disabled={saving || !form.first_name.trim()}
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </>
        }
      >
        <CfgGroup>
          <form id="cp-edit-form" className="cfg-form" onSubmit={save}>
            <IdentityFields formData={form} setFormData={setForm} idPrefix="cp-edit" />
          </form>
        </CfgGroup>
      </CfgSection>
    </CareProfileSection>
  );
}
