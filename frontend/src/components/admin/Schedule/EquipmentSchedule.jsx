import React, { useState, useEffect } from 'react';
import config from '../../../config';

const EquipmentSchedule = () => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDueOnly, setShowDueOnly] = useState(true);

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

  const handleChange = async (equipmentId) => {
    if (!confirm('Mark this equipment as changed?')) return;
    
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment/${equipmentId}/change`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchEquipment();
      }
    } catch (error) {
      console.error('Error changing equipment:', error);
    }
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
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
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
    </div>
  );
};

export default EquipmentSchedule;
