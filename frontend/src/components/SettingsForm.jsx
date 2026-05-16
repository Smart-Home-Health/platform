import React, { useState } from 'react';
import DashboardSettings from './settings/DashboardSettings';
import ThresholdSettings from './settings/ThresholdSettings';
import ModalBase from './ModalBase';

/**
 * Live dashboard Settings modal — exposes only Dashboard and Thresholds.
 * Admin-only panels (MQTT, Patients, Users, Dev, Admin) live in /admin-v2.
 */
const SettingsForm = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabBtn = (key, label) => (
    <button
      onClick={() => setActiveTab(key)}
      style={{
        padding: '8px 16px',
        border: 'none',
        borderRadius: '6px',
        backgroundColor: activeTab === key ? '#007bff' : '#f8f9fa',
        color: activeTab === key ? '#fff' : '#333',
        cursor: 'pointer',
        fontWeight: '500',
        fontSize: '14px'
      }}
    >
      {label}
    </button>
  );

  return (
    <ModalBase isOpen={true} onClose={onClose} title={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {tabBtn('dashboard', 'Dashboard')}
            {tabBtn('thresholds', 'Thresholds')}
          </div>
        </div>
      </div>
    }>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{
            backgroundColor: 'rgba(30,32,40,0.95)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #4a5568'
          }}>
            {activeTab === 'dashboard' && <DashboardSettings />}
            {activeTab === 'thresholds' && <ThresholdSettings />}
          </div>
        </div>
      </div>
    </ModalBase>
  );
};

export default SettingsForm;
