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
import React, { useEffect } from 'react';
import AlertsList from './AlertsList';
import ModalBase from './ModalBase';

const PulseOxModal = ({ 
  onClose,
  alertsCount,
  onAlertsViewed,
  onAlertAcknowledged // Add onAlertAcknowledged to props
}) => {

  // Mark alerts as viewed when modal opens
  useEffect(() => {
    if (alertsCount > 0 && onAlertsViewed) {
      onAlertsViewed();
    }
  }, [alertsCount, onAlertsViewed]);

  // Add a function to handle alert acknowledgment
  const handleAlertAcknowledge = (alertId) => {
    // Your existing acknowledgment code...
    
    // After successful acknowledgment, inform the parent component
    onAlertAcknowledged(alertId);
  };

  return (
    <ModalBase isOpen={true} onClose={onClose} title="Alerts">
      <div className="alerts-container">
        <AlertsList onClose={onClose} onAlertAcknowledge={handleAlertAcknowledge} />
      </div>
    </ModalBase>
  );
};

export default PulseOxModal;
