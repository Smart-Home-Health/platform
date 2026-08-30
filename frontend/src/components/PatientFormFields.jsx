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
import { EmField, EmRow } from './vc/EntityModal';
import config, { apiFetch } from '../config';
import './vc/entity-card.css';

// Care-area suggestions: the user's HA areas (rooms) + rooms already seen in
// environmental data. Best-effort; the field stays free text.
function useCareAreaOptions() {
  const [options, setOptions] = useState([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch(`${config.apiUrl}/api/integrations/home_assistant/areas`)
        .then((res) => (res.ok ? res.json() : [])),
      apiFetch(`${config.apiUrl}/api/environment/locations`)
        .then((res) => (res.ok ? res.json() : [])),
    ]).then(([areas, locations]) => {
      if (cancelled) return;
      const seen = locations.filter((l) => l.scope !== 'outdoor' && l.location)
                            .map((l) => l.location);
      setOptions([...new Set([...areas, ...seen])]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return options;
}

// Who the profile is. Split out so the care-profile pages can edit identity
// and care context on separate screens while the create dialog shows both.
export function IdentityFields({ formData, setFormData, idPrefix = 'pf' }) {
  return (
    <>
      <EmRow>
        <EmField label="First Name" required htmlFor={`${idPrefix}-first`}>
          <input
            id={`${idPrefix}-first`}
            className="em-input"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            required
            placeholder="John"
          />
        </EmField>
        <EmField label="Last Name" required htmlFor={`${idPrefix}-last`}>
          <input
            id={`${idPrefix}-last`}
            className="em-input"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            required
            placeholder="Doe"
          />
        </EmField>
      </EmRow>

      <EmRow>
        <EmField label="Date of Birth" htmlFor={`${idPrefix}-dob`}>
          <input
            id={`${idPrefix}-dob`}
            className="em-input"
            type="date"
            value={formData.date_of_birth}
            onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
          />
        </EmField>
        <EmField label="Medical Record Number" htmlFor={`${idPrefix}-mrn`}>
          <input
            id={`${idPrefix}-mrn`}
            className="em-input"
            value={formData.medical_record_number}
            onChange={(e) => setFormData({ ...formData, medical_record_number: e.target.value })}
            placeholder="MRN-12345"
          />
        </EmField>
      </EmRow>
    </>
  );
}

export function CareAreaField({ formData, setFormData, idPrefix = 'pf' }) {
  const careAreaOptions = useCareAreaOptions();
  return (
    <EmField
      label="Care area (room)"
      htmlFor={`${idPrefix}-care-area`}
      hint="The room this person is cared for in — used to match room sensors and Home Assistant areas."
    >
      <input
        id={`${idPrefix}-care-area`}
        className="em-input"
        list={`${idPrefix}-care-area-options`}
        value={formData.care_area || ''}
        onChange={(e) => setFormData({ ...formData, care_area: e.target.value })}
        placeholder="e.g. Bedroom"
      />
      <datalist id={`${idPrefix}-care-area-options`}>
        {careAreaOptions.map((area) => (
          <option key={area} value={area} />
        ))}
      </datalist>
    </EmField>
  );
}

export function NotesField({ formData, setFormData, idPrefix = 'pf', rows = 3, hint }) {
  return (
    <EmField label="Notes" htmlFor={`${idPrefix}-notes`} hint={hint}>
      <textarea
        id={`${idPrefix}-notes`}
        className="em-input"
        rows={rows}
        value={formData.notes}
        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        placeholder="Anything the care team should know…"
      />
    </EmField>
  );
}

// Shared create/edit fields for a care profile. Used by the profiles list
// (create dialog); the profile pages compose the pieces above instead.
export default function PatientFormFields({ formData, setFormData, idPrefix = 'pf' }) {
  return (
    <>
      <IdentityFields formData={formData} setFormData={setFormData} idPrefix={idPrefix} />
      <CareAreaField formData={formData} setFormData={setFormData} idPrefix={idPrefix} />
      <NotesField formData={formData} setFormData={setFormData} idPrefix={idPrefix} />

      <label className="em-check-row">
        <input
          type="checkbox"
          className="em-check"
          checked={formData.is_active}
          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
        />
        <span className="em-check-label">Active</span>
      </label>
    </>
  );
}
