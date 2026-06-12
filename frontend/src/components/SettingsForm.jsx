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
import DashboardSettings from './settings/DashboardSettings';
import ThresholdSettings from './settings/ThresholdSettings';
import ModalBase from './ModalBase';
import { Button } from '@/components/ui/button';

/**
 * Live dashboard Settings modal — exposes only Dashboard and Thresholds.
 * Admin-only panels (MQTT, Patients, Users, Dev, Admin) live in /admin-v2.
 */
const SettingsForm = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabBtn = (key, label) => (
    <Button
      size="sm"
      variant={activeTab === key ? 'default' : 'secondary'}
      onClick={() => setActiveTab(key)}
    >
      {label}
    </Button>
  );

  return (
    <ModalBase isOpen={true} onClose={onClose} title={
      <div className="tw" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
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
