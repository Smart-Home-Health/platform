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
