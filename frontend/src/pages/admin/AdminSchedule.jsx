import React, { useState } from 'react';
import MedicationSchedule from '../../components/admin/Schedule/MedicationSchedule';
import CareTaskSchedule from '../../components/admin/Schedule/CareTaskSchedule';
import EquipmentSchedule from '../../components/admin/Schedule/EquipmentSchedule';
import './AdminSchedule.css';

const AdminSchedule = () => {
  const [activeSection, setActiveSection] = useState('medications');

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Schedule Overview</h1>
        <p className="admin-page-description">
          View and manage scheduled medications, care tasks, and equipment maintenance
        </p>
      </div>

      <div className="schedule-tabs">
        <button 
          className={`schedule-tab ${activeSection === 'medications' ? 'active' : ''}`}
          onClick={() => setActiveSection('medications')}
        >
          Medications
        </button>
        <button 
          className={`schedule-tab ${activeSection === 'care-tasks' ? 'active' : ''}`}
          onClick={() => setActiveSection('care-tasks')}
        >
          Care Tasks
        </button>
        <button 
          className={`schedule-tab ${activeSection === 'equipment' ? 'active' : ''}`}
          onClick={() => setActiveSection('equipment')}
        >
          Equipment
        </button>
      </div>

      <div className="schedule-content">
        {activeSection === 'medications' && <MedicationSchedule />}
        {activeSection === 'care-tasks' && <CareTaskSchedule />}
        {activeSection === 'equipment' && <EquipmentSchedule />}
      </div>
    </div>
  );
};

export default AdminSchedule;
