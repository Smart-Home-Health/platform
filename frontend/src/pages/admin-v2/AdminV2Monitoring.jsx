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
import { useLocation } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import AlertsList from '../../components/alerts/AlertsList';
import AlertsHistory from '../../components/alerts/AlertsHistory';
import AdminV2MonitoringTimeline from './AdminV2MonitoringTimeline';
import AdminV2MonitoringVentilator from './AdminV2MonitoringVentilator';
import AdminV2MonitoringInteractions from './AdminV2MonitoringInteractions';
import './AdminV2.css';

const AdminV2Monitoring = () => {
  const location = useLocation();
  const { selectedPatient } = useAdminPatient();

  const isTimelineView = location.pathname.includes('/care/monitoring/timeline');
  const isVentilatorView = location.pathname.includes('/care/monitoring/ventilator');
  const isHistoryView = location.pathname.includes('/care/monitoring/history');
  const isInteractionsView = location.pathname.includes('/care/monitoring/interactions');

  const renderContent = () => {
    if (!selectedPatient) {
      return (
        <div className="admin-v2-monitoring-empty">
          <p>Select a patient from the sidebar to view monitoring alerts and history.</p>
        </div>
      );
    }

    if (isTimelineView) {
      return <AdminV2MonitoringTimeline />;
    }

    if (isVentilatorView) {
      return <AdminV2MonitoringVentilator patientId={selectedPatient.id} />;
    }

    if (isInteractionsView) {
      return <AdminV2MonitoringInteractions />;
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
