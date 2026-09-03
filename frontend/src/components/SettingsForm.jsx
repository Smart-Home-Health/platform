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
// Live-dashboard Settings panel — only what a caregiver adjusts at the board:
// what the dashboard shows, and the SpO₂ / heart-rate alert thresholds.
// Admin-only settings live under /care/configuration.
//
// Same bones as the other docked panels: ModalBase with the two-line
// mp-modal-title, a PanelViewSwitcher between the two views, and the dock
// context deciding whether field rows sit side by side or stack.
import { useState } from 'react';
import DashboardSettings from './settings/DashboardSettings';
import ThresholdSettings from './settings/ThresholdSettings';
import ModalBase from './ModalBase';
import PanelViewSwitcher from './section-panel/PanelViewSwitcher';
import { useModalDock } from '../contexts/ModalDockContext';
import './settings/settings-panel.css';

const VIEWS = [
  { value: 'dashboard', label: 'Dashboard', sublabel: 'Tiles and charts' },
  { value: 'thresholds', label: 'Thresholds', sublabel: 'SpO₂ and heart-rate alerts' },
];

export default function SettingsForm({ onClose }) {
  const [view, setView] = useState('dashboard');
  const { docked, expanded } = useModalDock();
  const wide = docked && expanded;
  const current = VIEWS.find((v) => v.value === view) || VIEWS[0];

  return (
    <ModalBase isOpen={true} onClose={onClose} title={
      <span className="mp-modal-title">
        <span>Settings</span>
        <span className="mp-modal-title-sub">Live board · {current.label}</span>
      </span>
    }>
      <div className={`st-panel ${wide ? 'wide' : 'narrow'}`}>
        <PanelViewSwitcher views={VIEWS} value={view} onChange={setView} />
        <div className="st-scroll">
          {view === 'thresholds' ? <ThresholdSettings /> : <DashboardSettings />}
        </div>
      </div>
    </ModalBase>
  );
}
