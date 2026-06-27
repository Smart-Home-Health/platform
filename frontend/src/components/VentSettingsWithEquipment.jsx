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
import React, { useState } from 'react';
import EquipmentModal from './EquipmentModal';

// This component provides tabs for "Ventilator Settings" and "Equipment Tracker"
export default function VentSettingsWithEquipment() {
  const [tab, setTab] = useState('vent');

  return (
    <div className="vent-settings-with-equipment">
      <div className="vent-tabs">
        <button onClick={() => setTab('vent')} className={tab === 'vent' ? 'active' : ''}>Ventilator Settings</button>
        <button onClick={() => setTab('equipment')} className={tab === 'equipment' ? 'active' : ''}>Equipment Tracker</button>
      </div>
      <div className="vent-tab-content">
        {tab === 'vent' ? (
          <div className="vent-settings-content">
            {/* Put your ventilator settings form/fields here, or a placeholder */}
            <div style={{ padding: '1rem' }}>
              <h3>Ventilator Settings</h3>
              <p>Configure ventilator parameters here.</p>
              {/* Add actual ventilator settings fields as needed */}
            </div>
          </div>
        ) : (
          <div className="equipment-tracker-content">
            {/* Render the equipment tracker UI directly, not as a modal */}
            <EquipmentModal isOpen={true} onClose={() => {}} />
          </div>
        )}
      </div>
    </div>
  );
}
