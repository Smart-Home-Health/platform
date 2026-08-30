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
import EntityModal from '../../../components/vc/EntityModal';
import PersonAvatar from '../../../components/vc/PersonAvatar';
import '../settings/settings-page.css';

/**
 * Reusable patient selector modal for Admin V2 pages
 * Shows a list of active patients to select from
 */
const PatientSelectorModal = ({
  patients,
  selectedPatient,
  onSelectPatient,
  onClose,
  loading = false,
  title = 'Select Patient'
}) => {
  // Until a patient is chosen the modal is a hard gate: ignoring onOpenChange
  // blocks Escape/outside-click, and the built-in X is not rendered.
  const canClose = !!selectedPatient;

  // Consumers gate mounting (`{showPatientModal && ...}`), so always open.
  return (
    <EntityModal
      open
      onOpenChange={(o) => { if (!o && canClose) onClose(); }}
      title={title}
      hideClose={!canClose}
    >
      <div className="em-form">
        {loading ? (
          <p className="cfg-empty">Loading patients...</p>
        ) : patients.length === 0 ? (
          <p className="cfg-empty">No patients found</p>
        ) : (
          <div className="cfg-picklist">
            {patients.filter(p => p.is_active).map(patient => (
              <button
                key={patient.id}
                type="button"
                className={`cfg-pick ${selectedPatient?.id === patient.id ? 'selected' : ''}`}
                onClick={() => onSelectPatient(patient)}
              >
                <span className="cfg-pick-lead">
                  <PersonAvatar kind="patient" id={patient.id} seed={patient.avatar_seed}
                                photo={patient.avatar_photo} size={40} decorative />
                  <span className="cfg-pick-main">
                    <span className="cfg-pick-name">
                      {patient.first_name} {patient.last_name}
                    </span>
                    <span className="cfg-pick-id">
                      {patient.room || 'No room assigned'}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </EntityModal>
  );
};

export default PatientSelectorModal;
