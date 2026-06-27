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
import React from 'react';
import { EditIcon } from '../../../components/Icons';

/**
 * Reusable patient header component for Admin V2 pages
 * Displays patient avatar, name, and change patient button
 */
const PatientHeader = ({ patient, onChangePatient }) => {
  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  if (!patient) return null;

  return (
    <div className="schedule-patient-header">
      <div className="schedule-patient-info">
        <div className="schedule-patient-avatar">
          {getInitials(patient.first_name, patient.last_name)}
        </div>
        <div className="schedule-patient-name-row">
          <h2>{patient.first_name} {patient.last_name}</h2>
          <button 
            className="schedule-edit-patient-btn"
            onClick={onChangePatient}
            title="Change Patient"
          >
            <EditIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientHeader;
