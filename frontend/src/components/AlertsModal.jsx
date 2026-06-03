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
import { useState, useEffect } from 'react';
import ModalBase from './ModalBase';
import AlertsList from './alerts/AlertsList';
import AlertsHistory from './alerts/AlertsHistory';

export default function AlertsModal({ isOpen, onClose, alertsCount, onAlertAcknowledged }) {
  const [tab, setTab] = useState('list');

  // Mark alerts as viewed when modal opens
  useEffect(() => {
    if (alertsCount > 0 && isOpen) {
      // You can add alerts viewed logic here if needed
    }
  }, [alertsCount, isOpen]);

  const handleAlertAcknowledge = (alertId) => {
    if (onAlertAcknowledged) {
      onAlertAcknowledged(alertId);
    }
  };

  const renderContent = () => {
    switch (tab) {
      case 'list':
        return <AlertsList onAlertAcknowledge={handleAlertAcknowledge} />;
      case 'history':
        return <AlertsHistory />;
      default:
        return <AlertsList onAlertAcknowledge={handleAlertAcknowledge} />;
    }
  };

  // If not using modal wrapper (for future noModal prop)
  const renderInnerContent = () => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderContent()}
    </div>
  );

  return (
    <ModalBase isOpen={isOpen} onClose={onClose} title={
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setTab('list')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'list' ? '#007bff' : '#f8f9fa',
            color: tab === 'list' ? '#fff' : '#333',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          Alert List
          {alertsCount > 0 && (
            <span style={{
              backgroundColor: '#dc3545',
              color: '#fff',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '12px',
              fontWeight: 'bold'
            }}>
              {alertsCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'history' ? '#007bff' : '#f8f9fa',
            color: tab === 'history' ? '#fff' : '#333',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '14px'
          }}
        >
          History
        </button>
        {/* Future navigation tabs can be added here */}
        {/* 
        <button
          onClick={() => setTab('analytics')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'analytics' ? '#007bff' : '#f8f9fa',
            color: tab === 'analytics' ? '#fff' : '#333',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '14px'
          }}
        >
          Analytics
        </button>
        <button
          onClick={() => setTab('settings')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'settings' ? '#007bff' : '#f8f9fa',
            color: tab === 'settings' ? '#fff' : '#333',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '14px'
          }}
        >
          Settings
        </button>
        */}
      </div>
    }>
      {renderInnerContent()}
    </ModalBase>
  );
}
