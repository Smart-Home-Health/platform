/*
 * Smart Home Health Hub
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
import React from 'react';
import { XIcon } from '../../../components/Icons';

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
  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const canClose = !!selectedPatient;

  const handleOverlayClick = () => {
    if (canClose) {
      onClose();
    }
  };

  return (
    <div className="admin-v2-modal-overlay" onClick={handleOverlayClick}>
      <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-v2-modal-header">
          <h2>{title}</h2>
          {canClose && (
            <button className="admin-v2-modal-close" onClick={onClose}>
              <XIcon size={20} />
            </button>
          )}
        </div>
        <div className="admin-v2-modal-body">
          {loading ? (
            <div className="admin-v2-loading">Loading patients...</div>
          ) : patients.length === 0 ? (
            <div className="admin-v2-empty">No patients found</div>
          ) : (
            <div className="admin-v2-patient-selector-list">
              {patients.filter(p => p.is_active).map(patient => (
                <button
                  key={patient.id}
                  className={`admin-v2-patient-selector-item ${selectedPatient?.id === patient.id ? 'selected' : ''}`}
                  onClick={() => onSelectPatient(patient)}
                >
                  <div className="admin-v2-patient-avatar">
                    {getInitials(patient.first_name, patient.last_name)}
                  </div>
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
        </div>
      </div>
    </div>
  );
};

export default PatientSelectorModal;
