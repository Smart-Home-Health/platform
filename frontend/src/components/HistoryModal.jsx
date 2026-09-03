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
// Recorded vitals. A shell around VitalsHistoryPanel, which owns both sizes.
//
// Recording lives in Capture Vitals now, so this panel only reads: the old
// "+ Add Vitals" button and its embedded RecordVitalsForm are gone rather than
// duplicated. The bathroom chart went with them — bathroom moved out to its
// own section, and no `bathroom` vital_type has existed here since.
import ModalBase from './ModalBase';
import VitalsHistoryPanel from './history/VitalsHistoryPanel';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import './section-panel/section-panel.css';

const HistoryModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();

  return (
    <ModalBase isOpen={true} onClose={onClose} title={
      <span className="mp-modal-title">
        <span>Recorded vitals</span>
        <span className="mp-modal-title-sub">
          {selectedPatient
            ? `${[selectedPatient.first_name, selectedPatient.last_name].filter(Boolean).join(' ')} · History`
            : 'No patient selected'}
        </span>
      </span>
    }>
      {/* Same bail as the other docked panels: with no patient chosen the
          vitals queries have nothing to scope to. */}
      {selectedPatient
        ? <VitalsHistoryPanel patientId={selectedPatient.id} />
        : <div className="vh-empty">Select a patient to see recorded vitals</div>}
    </ModalBase>
  );
};

export default HistoryModal;
