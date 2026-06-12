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
