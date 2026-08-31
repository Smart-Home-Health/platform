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
import { useLocation } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import PatientGate from './components/PatientGate';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import AlertsList from '../../components/alerts/AlertsList';
import AlertsHistory from '../../components/alerts/AlertsHistory';
import AdminV2MonitoringTimeline from './AdminV2MonitoringTimeline';
import AdminV2MonitoringVentilator from './AdminV2MonitoringVentilator';
import AdminV2MonitoringInteractions from './AdminV2MonitoringInteractions';
import AdminV2MonitoringEnvironment from './AdminV2MonitoringEnvironment';
import './AdminV2.css';
import './settings/settings-page.css';

const AdminV2Monitoring = () => {
  const location = useLocation();
  const { selectedPatient } = useAdminPatient();

  const isTimelineView = location.pathname.includes('/care/monitoring/timeline');
  const isVentilatorView = location.pathname.includes('/care/monitoring/ventilator');
  const isHistoryView = location.pathname.includes('/care/monitoring/history');
  const isInteractionsView = location.pathname.includes('/care/monitoring/interactions');
  const isEnvironmentView = location.pathname.includes('/care/monitoring/environment');

  // The subtitle used to say "Alerts and pulse oximetry history" on every
  // tab, including the two that show neither.
  const subtitle = () => {
    if (isVentilatorView) return 'Ventilator device data';
    if (isTimelineView) return 'One day of readings and events';
    if (isEnvironmentView) return 'Environmental readings and correlations';
    if (isInteractionsView) return 'Interactions between readings and care';
    if (isHistoryView) return 'Alert history';
    return 'Alerts and pulse oximetry';
  };

  const renderContent = () => {
    if (!selectedPatient) {
      return <PatientGate message="Choose a patient to view monitoring alerts and history." />;
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

    if (isEnvironmentView) {
      return <AdminV2MonitoringEnvironment />;
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
      <div className="admin-v2-page">
        <div className="cfg">
          <div className="cfg-pagehead">
            <div className="cfg-pagehead-text">
              <h1 className="cfg-h1">Monitoring</h1>
              {selectedPatient && (
                <p className="cfg-pagehead-desc">
                  {subtitle()} for {selectedPatient.first_name} {selectedPatient.last_name}
                </p>
              )}
            </div>
          </div>
          {renderContent()}
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Monitoring;
