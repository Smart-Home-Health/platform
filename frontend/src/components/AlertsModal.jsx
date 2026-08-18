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
import { useMemo, useState } from 'react';
import ModalBase from './ModalBase';
import AlertsList from './alerts/AlertsList';
import AlertsHistory from './alerts/AlertsHistory';
import PanelViewSwitcher from './section-panel/PanelViewSwitcher';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import './section-panel/section-panel.css';

export default function AlertsModal({ isOpen, onClose, alertsCount, onAlertAcknowledged }) {
  const [tab, setTab] = useState('list');
  const { selectedPatient } = useAdminPatient();

  const handleAlertAcknowledge = (alertId) => {
    if (onAlertAcknowledged) onAlertAcknowledged(alertId);
  };

  // The second view is not an alert history — it is the day’s pulse-ox
  // analysis. The sublabel says so rather than the tab quietly misnaming it.
  const views = useMemo(() => ([
    {
      value: 'list',
      label: 'Alerts',
      sublabel: 'Pulse ox episodes',
      note: alertsCount > 0 ? `${alertsCount} unreviewed` : 'All reviewed',
      tone: alertsCount > 0 ? 'due' : 'given',
    },
    {
      value: 'history',
      label: 'History',
      sublabel: 'Daily pulse-ox analysis',
    },
  ]), [alertsCount]);

  return (
    <ModalBase isOpen={isOpen} onClose={onClose} title={
      <span className="mp-modal-title">
        <span>Alerts</span>
        <span className="mp-modal-title-sub">
          {selectedPatient
            ? `${selectedPatient.first_name} ${selectedPatient.last_name} · ${tab === 'history' ? 'Analysis' : 'Episodes'}`
            : 'No patient selected'}
        </span>
      </span>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PanelViewSwitcher views={views} value={tab} onChange={setTab} />

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {tab === 'history'
            ? <AlertsHistory patientId={selectedPatient?.id} />
            : <AlertsList onAlertAcknowledge={handleAlertAcknowledge} patientId={selectedPatient?.id} />}
        </div>
      </div>
    </ModalBase>
  );
}
