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
import React, { useState, useEffect } from 'react';
import config from '../../../config';
import EquipmentRestockGate from '../../EquipmentRestockGate';
import { formatDateOnly } from '../../../utils/timezone';

const EquipmentSchedule = () => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDueOnly, setShowDueOnly] = useState(true);
  const [restockInfo, setRestockInfo] = useState(null);

  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment`);
      console.log('Fetching equipment from:', `${config.apiUrl}/api/equipment`);
      if (response.ok) {
        const data = await response.json();
        console.log('Received equipment data:', data);
        setEquipment(data);
      } else {
        console.error('Failed to fetch equipment:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching equipment:', error);
    } finally {
      setLoading(false);
    }
  };

  // Core change request. On a 409 out-of-stock the restock gate is opened; the
  // gate retries this directly (no re-confirm).
  const doChange = async (equipmentId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment/${equipmentId}/change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ changed_at: new Date().toISOString() }),
      });
      if (response.ok) {
        setRestockInfo(null);
        fetchEquipment();
      } else {
        const data = await response.json().catch(() => ({}));
        if (response.status === 409 && data.error === 'insufficient_quantity') {
          setRestockInfo(data);
        } else {
          console.error('Failed to change equipment:', response.status, response.statusText);
        }
      }
    } catch (error) {
      console.error('Error changing equipment:', error);
    }
  };

  const handleChange = (equipmentId) => {
    if (!confirm('Mark this equipment as changed?')) return;
    doChange(equipmentId);
  };

  const isDue = (item) => {
    if (!item.scheduled_replacement || !item.last_changed) return false;
    const lastChanged = new Date(item.last_changed);
    const dueDate = new Date(lastChanged.getTime() + item.useful_days * 24 * 60 * 60 * 1000);
    return dueDate <= new Date();
  };

  const getDaysUntilDue = (item) => {
    if (!item.scheduled_replacement || !item.last_changed) return null;
    const lastChanged = new Date(item.last_changed);
    const dueDate = new Date(lastChanged.getTime() + item.useful_days * 24 * 60 * 60 * 1000);
    const today = new Date();
    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return formatDateOnly(dateString, { year: 'numeric', month: 'long', day: 'numeric' }) || 'N/A';
  };

  const getStatusColor = (item) => {
    const daysUntil = getDaysUntilDue(item);
    if (daysUntil === null) return { bg: '#f8f9fa', border: '#dee2e6', text: '#495057' };
    if (daysUntil < 0) return { bg: '#f8d7da', border: '#dc3545', text: '#721c24' };
    if (daysUntil <= 7) return { bg: '#fff3cd', border: '#ffc107', text: '#856404' };
    return { bg: '#d4edda', border: '#28a745', text: '#155724' };
  };

  const filteredEquipment = showDueOnly 
    ? equipment.filter(item => isDue(item))
    : equipment.filter(item => item.scheduled_replacement);

  // Sort by days until due (most urgent first)
  const sortedEquipment = [...filteredEquipment].sort((a, b) => {
    const daysA = getDaysUntilDue(a);
    const daysB = getDaysUntilDue(b);
    if (daysA === null) return 1;
    if (daysB === null) return -1;
    return daysA - daysB;
  });

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading equipment schedule...</div>;
  }

  return (
    <div className="schedule-section">
      <div className="schedule-header">
        <h2>Equipment Replacement Schedule</h2>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
          Found {equipment.length} equipment items ({sortedEquipment.length} {showDueOnly ? 'due' : 'scheduled'})
        </p>
        <div className="filter-controls">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showDueOnly}
              onChange={(e) => setShowDueOnly(e.target.checked)}
            />
            <span>Show Due Only</span>
          </label>
        </div>
      </div>

      {sortedEquipment.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          {showDueOnly ? 'No equipment is due for replacement' : 'No scheduled equipment found'}
        </div>
      ) : (
        <div className="equipment-list">
          {sortedEquipment.map(item => {
            const colors = getStatusColor(item);
            const daysUntil = getDaysUntilDue(item);
            const due = isDue(item);
            
            return (
              <div
                key={item.id}
                className="equipment-item"
                style={{
                  backgroundColor: colors.bg,
                  borderLeft: `4px solid ${colors.border}`,
                  padding: '16px',
                  marginBottom: '12px',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div className="equipment-info" style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: '600', 
                    marginBottom: '8px',
                    color: '#333'
                  }}>
                    {item.name}
                  </div>
                  <div style={{ 
                    fontSize: '14px', 
                    color: '#666',
                    marginBottom: '4px'
                  }}>
                    <strong>Quantity:</strong> {item.quantity} {item.quantity > 1 ? 'items' : 'item'}
                  </div>
                  <div style={{ 
                    fontSize: '14px', 
                    color: '#666',
                    marginBottom: '4px'
                  }}>
                    <strong>Last Changed:</strong> {formatDate(item.last_changed)}
                  </div>
                  <div style={{ 
                    fontSize: '14px', 
                    color: '#666',
                    marginBottom: '4px'
                  }}>
                    <strong>Useful Days:</strong> {item.useful_days} days
                  </div>
                  {daysUntil !== null && (
                    <div style={{ 
                      fontSize: '14px', 
                      color: colors.text,
                      fontWeight: '600',
                      marginTop: '8px'
                    }}>
                      {due 
                        ? `OVERDUE by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}`
                        : `Due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`
                      }
                    </div>
                  )}
                </div>
                <div className="equipment-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => handleChange(item.id)}
                  >
                    Mark Changed
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EquipmentRestockGate
        info={restockInfo}
        onClose={() => setRestockInfo(null)}
        onUpdated={() => doChange(restockInfo.equipment_id)}
      />
    </div>
  );
};

export default EquipmentSchedule;
