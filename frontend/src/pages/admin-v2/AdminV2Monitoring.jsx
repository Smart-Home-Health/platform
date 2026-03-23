import React from 'react';
import { useLocation } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import AlertsList from '../../components/alerts/AlertsList';
import AlertsHistory from '../../components/alerts/AlertsHistory';
import './AdminV2.css';

const AdminV2Monitoring = () => {
  const location = useLocation();
  const { selectedPatient } = useAdminPatient();

  const isHistoryView = location.pathname.includes('/care/monitoring/history');
  const isSettingsView = location.pathname.includes('/care/monitoring/settings');
  const isAlertsView = !isHistoryView && !isSettingsView;

  const renderContent = () => {
    if (!selectedPatient) {
      return (
        <div className="admin-v2-monitoring-empty">
          <p>Select a patient from the sidebar to view monitoring alerts and history.</p>
        </div>
      );
    }

    if (isSettingsView) {
      return (
        <div className="admin-v2-monitoring-settings">
          <p>Alert settings coming soon.</p>
        </div>
      );
    }

    if (isHistoryView) {
      return <AlertsHistory patientId={selectedPatient.id} />;
    }

    return (
      <AlertsList
        patientId={selectedPatient.id}
        onAlertAcknowledge={() => {}}
      />
    );
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-monitoring">
        <div className="admin-v2-monitoring-header">
          <h1 className="admin-v2-page-title">Monitoring</h1>
          {selectedPatient && (
            <p className="admin-v2-page-subtitle">
              Alerts and pulse oximetry history for {selectedPatient.first_name} {selectedPatient.last_name}
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

export default AdminV2Monitoring;
