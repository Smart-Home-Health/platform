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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import PersonAvatar from '../../../components/vc/PersonAvatar';

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
  // blocks Escape/outside-click, and the built-in X is hidden via CSS.
  const canClose = !!selectedPatient;

  // Consumers gate mounting (`{showPatientModal && ...}`), so always open.
  return (
    <Dialog open onOpenChange={(o) => { if (!o && canClose) onClose(); }}>
      <DialogContent
        className={`max-h-[85vh] overflow-y-auto sm:max-w-[480px] ${canClose ? '' : '[&>button]:hidden'}`}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-2 text-center text-muted-foreground">Loading patients...</p>
        ) : patients.length === 0 ? (
          <p className="py-2 text-center text-muted-foreground">No patients found</p>
        ) : (
          <div className="admin-v2-patient-selector-list">
            {patients.filter(p => p.is_active).map(patient => (
              <button
                key={patient.id}
                className={`admin-v2-patient-selector-item ${selectedPatient?.id === patient.id ? 'selected' : ''}`}
                onClick={() => onSelectPatient(patient)}
              >
                <PersonAvatar kind="patient" id={patient.id} seed={patient.avatar_seed}
                              photo={patient.avatar_photo} size={48} decorative />
                <div className="admin-v2-patient-selector-info">
                  <span className="admin-v2-patient-name">
                    {patient.first_name} {patient.last_name}
                  </span>
                  <span className="admin-v2-patient-meta">
                    {patient.room || 'No room assigned'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PatientSelectorModal;
