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
