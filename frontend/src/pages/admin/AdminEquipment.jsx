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
import config from '../../config';

const AdminEquipment = () => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [equipmentHistory, setEquipmentHistory] = useState([]);
  
  const [newEquipment, setNewEquipment] = useState({
    name: '',
    quantity: 1,
    scheduled_replacement: true,
    last_changed: new Date().toISOString().split('T')[0],
    useful_days: 30
  });

  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment`);
      const data = await response.json();
      setEquipment(data);
    } catch (error) {
      console.error('Error fetching equipment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEquipment = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newEquipment),
      });

      if (response.ok) {
        setShowAddForm(false);
        setNewEquipment({
          name: '',
          quantity: 1,
          scheduled_replacement: true,
          last_changed: new Date().toISOString().split('T')[0],
          useful_days: 30
        });
        fetchEquipment();
      } else {
        console.error('Failed to add equipment');
      }
    } catch (error) {
      console.error('Error adding equipment:', error);
    }
  };

  const handleReceiveEquipment = async (equipmentId) => {
    const amount = prompt('How many items did you receive?', '1');
    if (amount && !isNaN(amount) && parseInt(amount) > 0) {
      try {
        const response = await fetch(`${config.apiUrl}/api/equipment/${equipmentId}/receive`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount: parseInt(amount) }),
        });

        if (response.ok) {
          fetchEquipment();
        } else {
          console.error('Failed to receive equipment');
        }
      } catch (error) {
        console.error('Error receiving equipment:', error);
      }
    }
  };

  const handleOpenEquipment = async (equipmentId) => {
    const amount = prompt('How many items did you open/use?', '1');
    if (amount && !isNaN(amount) && parseInt(amount) > 0) {
      try {
        const response = await fetch(`${config.apiUrl}/api/equipment/${equipmentId}/open`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount: parseInt(amount) }),
        });

        if (response.ok) {
          fetchEquipment();
        } else {
          console.error('Failed to open equipment');
        }
      } catch (error) {
        console.error('Error opening equipment:', error);
      }
    }
  };

  const handleChangeEquipment = async (equipmentId) => {
    const changedAt = prompt('When was this equipment changed? (YYYY-MM-DD)', new Date().toISOString().split('T')[0]);
    if (changedAt) {
      try {
        const response = await fetch(`${config.apiUrl}/api/equipment/${equipmentId}/change`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ changed_at: changedAt }),
        });

        if (response.ok) {
          fetchEquipment();
        } else {
          console.error('Failed to log equipment change');
        }
      } catch (error) {
        console.error('Error logging equipment change:', error);
      }
    }
  };

  const handleViewHistory = async (equipmentId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment/${equipmentId}/history`);
      const data = await response.json();
      setEquipmentHistory(data);
      setSelectedEquipment(equipment.find(eq => eq.id === equipmentId));
      setShowHistoryModal(true);
    } catch (error) {
      console.error('Error fetching equipment history:', error);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const calculateDaysUntilDue = (lastChanged, usefulDays) => {
    if (!lastChanged || !usefulDays) return null;
    const lastChangedDate = new Date(lastChanged);
    const dueDate = new Date(lastChangedDate.getTime() + (usefulDays * 24 * 60 * 60 * 1000));
    const today = new Date();
    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusColor = (daysUntilDue) => {
    if (daysUntilDue === null) return 'status-inactive';
    if (daysUntilDue <= 0) return 'status-overdue';
    if (daysUntilDue <= 3) return 'status-due';
    return 'status-active';
  };

  const getStatusText = (daysUntilDue) => {
    if (daysUntilDue === null) return 'No Schedule';
    if (daysUntilDue <= 0) return `Overdue by ${Math.abs(daysUntilDue)} days`;
    if (daysUntilDue <= 3) return `Due in ${daysUntilDue} days`;
    return `${daysUntilDue} days left`;
  };

  if (loading) {
    return <div className="admin-page">
      <div className="loading">Loading equipment...</div>
    </div>;
  }

  return (
    <div className="admin-page" style={{ margin: '2rem' }}>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Equipment Management</h1>
        <p className="admin-page-description">
          Manage medical equipment inventory and replacement schedules
        </p>
      </div>

      <div className="admin-section" style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div className="admin-section-header">
          <h2 className="admin-section-title">Equipment Inventory</h2>
          <button 
            className="btn btn-success"
            onClick={() => setShowAddForm(true)}
          >
            + Add Equipment
          </button>
        </div>

        <div className="admin-section-content">
          {showAddForm && (
            <div style={{ 
              marginBottom: '3rem',
              background: '#ffffff',
              border: '1px solid #e9ecef',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                background: '#f8f9fa',
                padding: '1.5rem 2rem',
                borderBottom: '1px solid #e9ecef'
              }}>
                <h3 style={{
                  margin: 0,
                  color: '#2c3e50',
                  fontSize: '1.25rem',
                  fontWeight: '600'
                }}>
                  Add New Equipment
                </h3>
              </div>
              
              <form onSubmit={handleAddEquipment} style={{ padding: '2rem' }}>
                {/* Basic Information Section */}
                <div style={{ marginBottom: '2.5rem' }}>
                  <h4 style={{ 
                    margin: '0 0 1.5rem 0',
                    color: '#495057',
                    fontSize: '1rem',
                    fontWeight: '600',
                    borderBottom: '2px solid #e9ecef',
                    paddingBottom: '0.5rem'
                  }}>
                    Basic Information
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Equipment Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={newEquipment.name}
                        onChange={(e) => setNewEquipment({ ...newEquipment, name: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '1px solid #ced4da', 
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: '#ffffff',
                          color: '#495057',
                          boxSizing: 'border-box'
                        }}
                        placeholder="e.g., Pulse Oximeter Sensors"
                      />
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Initial Quantity *
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={newEquipment.quantity}
                        onChange={(e) => setNewEquipment({ ...newEquipment, quantity: parseInt(e.target.value) })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '1px solid #ced4da', 
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: '#ffffff',
                          color: '#495057',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Replacement Schedule Section */}
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ 
                    margin: '0 0 1.5rem 0',
                    color: '#495057',
                    fontSize: '1rem',
                    fontWeight: '600',
                    borderBottom: '2px solid #e9ecef',
                    paddingBottom: '0.5rem'
                  }}>
                    Replacement Schedule
                  </h4>
                  <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <input
                        type="checkbox"
                        id="scheduled_replacement"
                        checked={newEquipment.scheduled_replacement}
                        onChange={(e) => setNewEquipment({ ...newEquipment, scheduled_replacement: e.target.checked })}
                        style={{ transform: 'scale(1.2)' }}
                      />
                      <label htmlFor="scheduled_replacement" style={{ 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Enable Scheduled Replacement
                      </label>
                    </div>
                  </div>

                  {newEquipment.scheduled_replacement && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                      <div>
                        <label style={{ 
                          display: 'block', 
                          marginBottom: '0.75rem', 
                          fontWeight: '600',
                          color: '#495057'
                        }}>
                          Last Changed Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={newEquipment.last_changed}
                          onChange={(e) => setNewEquipment({ ...newEquipment, last_changed: e.target.value })}
                          style={{ 
                            width: '100%', 
                            padding: '0.75rem', 
                            border: '1px solid #ced4da', 
                            borderRadius: '6px',
                            fontSize: '1rem',
                            backgroundColor: '#ffffff',
                            color: '#495057',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ 
                          display: 'block', 
                          marginBottom: '0.75rem', 
                          fontWeight: '600',
                          color: '#495057'
                        }}>
                          Useful Days *
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={newEquipment.useful_days}
                          onChange={(e) => setNewEquipment({ ...newEquipment, useful_days: parseInt(e.target.value) })}
                          style={{ 
                            width: '100%', 
                            padding: '0.75rem', 
                            border: '1px solid #ced4da', 
                            borderRadius: '6px',
                            fontSize: '1rem',
                            backgroundColor: '#ffffff',
                            color: '#495057',
                            boxSizing: 'border-box'
                          }}
                          placeholder="Days until replacement needed"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ 
                  display: 'flex', 
                  gap: '1rem', 
                  justifyContent: 'flex-end',
                  paddingTop: '1.5rem',
                  borderTop: '1px solid #e9ecef'
                }}>
                  <button 
                    type="button" 
                    onClick={() => setShowAddForm(false)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      border: '1px solid #6c757d',
                      borderRadius: '6px',
                      background: '#6c757d',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#5a6268'}
                    onMouseLeave={(e) => e.target.style.background = '#6c757d'}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    style={{
                      padding: '0.75rem 1.5rem',
                      border: '1px solid #28a745',
                      borderRadius: '6px',
                      background: '#28a745',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#218838'}
                    onMouseLeave={(e) => e.target.style.background = '#28a745'}
                  >
                    Add Equipment
                  </button>
                </div>
              </form>
            </div>
          )}

          <div style={{ 
            background: '#ffffff', 
            borderRadius: '12px', 
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e9ecef'
          }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '0.9rem'
            }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={{ 
                    padding: '1rem', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    color: '#2c3e50',
                    borderBottom: '1px solid #e9ecef',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Equipment Name
                  </th>
                  <th style={{ 
                    padding: '1rem', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    color: '#2c3e50',
                    borderBottom: '1px solid #e9ecef',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Quantity
                  </th>
                  <th style={{ 
                    padding: '1rem', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    color: '#2c3e50',
                    borderBottom: '1px solid #e9ecef',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Last Changed
                  </th>
                  <th style={{ 
                    padding: '1rem', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    color: '#2c3e50',
                    borderBottom: '1px solid #e9ecef',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Useful Days
                  </th>
                  <th style={{ 
                    padding: '1rem', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    color: '#2c3e50',
                    borderBottom: '1px solid #e9ecef',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Status
                  </th>
                  <th style={{ 
                    padding: '1rem', 
                    textAlign: 'left', 
                    fontWeight: '600',
                    color: '#2c3e50',
                    borderBottom: '1px solid #e9ecef',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((item, index) => {
                  const daysUntilDue = calculateDaysUntilDue(item.last_changed, item.useful_days);
                  return (
                    <tr key={item.id} style={{ 
                      backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa',
                      transition: 'background-color 0.2s ease'
                    }}>
                      <td style={{ 
                        fontWeight: '600', 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#2c3e50'
                      }}>
                        {item.name}
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#7f8c8d'
                      }}>
                        {item.quantity}
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#7f8c8d'
                      }}>
                        {item.last_changed ? formatDate(item.last_changed) : 'Not set'}
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#7f8c8d'
                      }}>
                        {item.useful_days || 'N/A'} days
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef'
                      }}>
                        <span className={`status-badge ${getStatusColor(daysUntilDue)}`} style={{
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '0.8rem',
                          fontWeight: '500',
                          backgroundColor: daysUntilDue === null ? '#f8d7da' : daysUntilDue <= 0 ? '#f8d7da' : daysUntilDue <= 3 ? '#fff3cd' : '#d4edda',
                          color: daysUntilDue === null ? '#721c24' : daysUntilDue <= 0 ? '#721c24' : daysUntilDue <= 3 ? '#856404' : '#155724',
                          border: `1px solid ${daysUntilDue === null ? '#f5c6cb' : daysUntilDue <= 0 ? '#f5c6cb' : daysUntilDue <= 3 ? '#ffeaa7' : '#c3e6cb'}`
                        }}>
                          {getStatusText(daysUntilDue)}
                        </span>
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef'
                      }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            onClick={() => handleReceiveEquipment(item.id)}
                            style={{
                              padding: '8px',
                              border: 'none',
                              borderRadius: '6px',
                              background: '#28a745',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '14px',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#218838'}
                            onMouseLeave={(e) => e.target.style.background = '#28a745'}
                            title="Receive new stock"
                          >
                            📦
                          </button>
                          <button 
                            onClick={() => handleOpenEquipment(item.id)}
                            style={{
                              padding: '8px',
                              border: 'none',
                              borderRadius: '6px',
                              background: '#ffc107',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '14px',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#e0a800'}
                            onMouseLeave={(e) => e.target.style.background = '#ffc107'}
                            title="Use/Open equipment"
                          >
                            📉
                          </button>
                          {item.scheduled_replacement && (
                            <button 
                              onClick={() => handleChangeEquipment(item.id)}
                              style={{
                                padding: '8px',
                                border: 'none',
                                borderRadius: '6px',
                                background: '#007bff',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '14px',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '32px',
                                height: '32px'
                              }}
                              onMouseEnter={(e) => e.target.style.background = '#0056b3'}
                              onMouseLeave={(e) => e.target.style.background = '#007bff'}
                              title="Log equipment change"
                            >
                              🔄
                            </button>
                          )}
                          <button 
                            onClick={() => handleViewHistory(item.id)}
                            style={{
                              padding: '8px',
                              border: 'none',
                              borderRadius: '6px',
                              background: '#6c757d',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '14px',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#545b62'}
                            onMouseLeave={(e) => e.target.style.background = '#6c757d'}
                            title="View history"
                          >
                            📋
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {equipment.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No equipment found. Add some equipment to get started.
            </div>
          )}
        </div>
      </div>

      {/* History Modal */}
      {showHistoryModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>
                Equipment History: {selectedEquipment?.name}
              </h3>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowHistoryModal(false)}
              >
                Close
              </button>
            </div>

            {equipmentHistory.length > 0 ? (
              <div style={{ 
                background: '#ffffff', 
                borderRadius: '8px', 
                overflow: 'hidden',
                border: '1px solid #e9ecef'
              }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse',
                  fontSize: '0.9rem'
                }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <th style={{ 
                        padding: '1rem', 
                        textAlign: 'left', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        borderBottom: '1px solid #e9ecef',
                        fontSize: '0.85rem'
                      }}>
                        Date
                      </th>
                      <th style={{ 
                        padding: '1rem', 
                        textAlign: 'left', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        borderBottom: '1px solid #e9ecef',
                        fontSize: '0.85rem'
                      }}>
                        Action
                      </th>
                      <th style={{ 
                        padding: '1rem', 
                        textAlign: 'left', 
                        fontWeight: '600',
                        color: '#2c3e50',
                        borderBottom: '1px solid #e9ecef',
                        fontSize: '0.85rem'
                      }}>
                        Quantity Change
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentHistory.map((entry, index) => (
                      <tr key={index} style={{ 
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa'
                      }}>
                        <td style={{ 
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef',
                          color: '#2c3e50'
                        }}>
                          {formatDate(entry.date)}
                        </td>
                        <td style={{ 
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef',
                          color: '#7f8c8d'
                        }}>
                          {entry.action}
                        </td>
                        <td style={{ 
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef',
                          color: '#7f8c8d'
                        }}>
                          {entry.quantity_change}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#666' }}>
                No history available for this equipment.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEquipment;
