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
import { useLocation } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import AdminV2ReportsDayOverDay from './AdminV2ReportsDayOverDay';
import './AdminV2.css';

const AdminV2Reports = () => {
  const location = useLocation();
  const { selectedPatient } = useAdminPatient();

  const renderContent = () => {
    if (!selectedPatient) {
      return (
        <div className="admin-v2-monitoring-empty">
          <p>Select a patient from the sidebar to view reports.</p>
        </div>
      );
    }

    return <AdminV2ReportsDayOverDay patientId={selectedPatient.id} />;
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-monitoring">
        <div className="admin-v2-monitoring-header">
          <h1 className="admin-v2-page-title">Reports</h1>
          {selectedPatient && (
            <p className="admin-v2-page-subtitle">
              Compare vitals across days for {selectedPatient.first_name} {selectedPatient.last_name}
            </p>
          )}
        </div>
        <div className="admin-v2-monitoring-content">
          {renderContent()}
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Reports;
