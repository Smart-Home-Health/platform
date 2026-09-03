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
// Gate for patient-scoped pages. "Select a patient from the sidebar" was a
// dead end on a phone (the sidebar hides behind the nav drawer), so when
// nothing is selected this opens the picker itself, with the prompt behind it
// as the way back in if the list is empty. Pages that sync the selection to a
// ?patient URL param keep doing so via their own context→URL effect.
import { useEffect, useState } from 'react';
import { useAdminPatient } from '../../../contexts/AdminPatientContext';
import PatientSelectorModal from './PatientSelectorModal';
import '../../../components/vc/entity-card.css';
import '../settings/settings-page.css';

export default function PatientGate({
  message = 'Choose a patient to view this page.',
  icon = null,
  children = null,
}) {
  const { patients = [], selectedPatient, selectPatient, loadingPatients = false } = useAdminPatient();
  const [showPicker, setShowPicker] = useState(false);

  const gated = !selectedPatient;
  useEffect(() => {
    if (gated && !loadingPatients && patients.length > 0) setShowPicker(true);
  }, [gated, loadingPatients, patients.length]);

  if (!gated) return children;

  if (loadingPatients) {
    return <p className="cfg-loading">Loading patients...</p>;
  }

  return (
    <>
      <div className="cfg-nopatient">
        {icon}
        <h2>Select a Patient</h2>
        <p>{message}</p>
        <button type="button" className="em-submit" onClick={() => setShowPicker(true)}>
          Select Patient
        </button>
      </div>
      {showPicker && (
        <PatientSelectorModal
          patients={patients}
          selectedPatient={selectedPatient}
          onSelectPatient={(p) => { selectPatient(p); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
          loading={loadingPatients}
        />
      )}
    </>
  );
}
