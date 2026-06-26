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
import AppearanceSettings from './settings/AppearanceSettings';
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
            {tabBtn('appearance', 'Appearance')}
          </div>
        </div>
      </div>
    }>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{
            backgroundColor: 'var(--dash-surface)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--dash-border-strong)'
          }}>
            {activeTab === 'dashboard' && <DashboardSettings />}
            {activeTab === 'thresholds' && <ThresholdSettings />}
            {activeTab === 'appearance' && <AppearanceSettings />}
          </div>
        </div>
      </div>
    </ModalBase>
  );
};

export default SettingsForm;
