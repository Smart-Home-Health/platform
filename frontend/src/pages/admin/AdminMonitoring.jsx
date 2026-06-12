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

const AdminMonitoring = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('unacknowledged'); // 'unacknowledged', 'all', 'history'
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [dayAnalysis, setDayAnalysis] = useState(null);

  useEffect(() => {
    fetchAlerts();
    fetchAvailableDates();
  }, [activeTab]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const includeAcknowledged = activeTab === 'all' || activeTab === 'history';
      const response = await fetch(
        `${config.apiUrl}/api/monitoring/alerts?include_acknowledged=${includeAcknowledged}&limit=100&detailed=true`
      );
      const data = await response.json();
      console.log('Alerts data:', data); // Debug log to see the actual data structure
      setAlerts(data);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableDates = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/monitoring/history/dates`);
      const data = await response.json();
      setAvailableDates(data);
    } catch (error) {
      console.error('Error fetching available dates:', error);
    }
  };

  const fetchDayAnalysis = async (date) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/monitoring/history/analyze/${date}`);
      const data = await response.json();
      setDayAnalysis(data);
    } catch (error) {
      console.error('Error fetching day analysis:', error);
    }
  };

  const handleAcknowledgeAlert = async (alertId) => {
    const wasOxygenUsed = confirm('Was oxygen used during this event?');
    
    let oxygenAmount = null;
    let oxygenUnit = 'L/min';
    
    if (wasOxygenUsed) {
      oxygenAmount = prompt('Oxygen amount used:', '');
      if (oxygenAmount !== null && oxygenAmount !== '') {
        oxygenUnit = prompt('Unit (L/min, mL/min, etc.):', 'L/min');
      }
    }

    try {
      const response = await fetch(`${config.apiUrl}/api/monitoring/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          oxygen_used: wasOxygenUsed ? 1 : 0,
          oxygen_highest: oxygenAmount || null,
          oxygen_unit: oxygenUnit || 'L/min'
        }),
      });

      if (response.ok) {
        fetchAlerts();
      } else {
        console.error('Failed to acknowledge alert');
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  const handleViewAlertDetails = async (alertId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/monitoring/alerts/${alertId}/data`);
      const data = await response.json();
      setSelectedAlert(data);
      setShowAlertModal(true);
    } catch (error) {
      console.error('Error fetching alert details:', error);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      return date.toLocaleString();
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'Invalid Date';
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getAlertSeverity = (alertType, value) => {
    // This could be enhanced based on your specific alert thresholds
    if (alertType === 'spo2' && value < 85) return 'Critical';
    if (alertType === 'spo2' && value < 90) return 'High';
    if (alertType === 'bpm' && (value < 50 || value > 120)) return 'High';
    return 'Medium';
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'Critical': return '#dc3545';
      case 'High': return '#fd7e14';
      case 'Medium': return '#ffc107';
      default: return '#6c757d';
    }
  };

  // Helper functions to map API data to display format
  const getAlertType = (alert) => {
    if (alert.spo2_alarm_triggered) return 'spo2';
    if (alert.hr_alarm_triggered) return 'bpm';
    if (alert.external_alarm_triggered) return 'external';
    return 'unknown';
  };

  const getAlertValue = (alert) => {
    // Since the API doesn't return trigger values, we'll use the min values as indicators
    // If min values are -1, it means no specific threshold was recorded
    if (alert.spo2_alarm_triggered && alert.spo2_min > 0) return alert.spo2_min;
    if (alert.hr_alarm_triggered && alert.bpm_min > 0) return alert.bpm_min;
    if (alert.external_alarm_triggered) return 'External';
    return 'N/A';
  };

  const getDuration = (alert) => {
    if (!alert.start_time) return null;
    const startTime = new Date(alert.start_time);
    const endTime = alert.end_time ? new Date(alert.end_time) : new Date();
    return Math.floor((endTime - startTime) / 1000); // Duration in seconds
  };

  if (loading) {
    return <div className="admin-page">
      <div className="loading">Loading monitoring data...</div>
    </div>;
  }

  return (
    <div className="admin-page" style={{ margin: '2rem' }}>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Monitoring & Alerts</h1>
        <p className="admin-page-description">
          View and manage patient monitoring alerts and historical data
        </p>
      </div>

      <div className="admin-section" style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div className="admin-section-header">
          <h2 className="admin-section-title">Patient Alerts</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className={`btn ${activeTab === 'unacknowledged' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('unacknowledged')}
            >
              Unacknowledged
            </button>
            <button 
              className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('all')}
            >
              All Alerts
            </button>
            <button 
              className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('history')}
            >
              Historical Analysis
            </button>
          </div>
        </div>

        <div className="admin-section-content">
          {activeTab === 'history' ? (
            <div>
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
                    Historical Data Analysis
                  </h3>
                </div>
                
                <div style={{ padding: '2rem' }}>
                  <div style={{ display: 'flex', gap: '2rem', alignItems: 'end', marginBottom: '2rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Select Date
                      </label>
                      <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
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
                      >
                        <option value="">Choose a date...</option>
                        {availableDates.map((date) => (
                          <option key={date} value={date}>
                            {new Date(date).toLocaleDateString()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button 
                      onClick={() => selectedDate && fetchDayAnalysis(selectedDate)}
                      disabled={!selectedDate}
                      style={{
                        padding: '0.75rem 1.5rem',
                        border: '1px solid #007bff',
                        borderRadius: '6px',
                        background: selectedDate ? '#007bff' : '#6c757d',
                        color: 'white',
                        cursor: selectedDate ? 'pointer' : 'not-allowed',
                        fontSize: '1rem',
                        fontWeight: '500',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedDate) e.target.style.background = '#0056b3';
                      }}
                      onMouseLeave={(e) => {
                        if (selectedDate) e.target.style.background = '#007bff';
                      }}
                    >
                      Analyze Day
                    </button>
                  </div>

                  {dayAnalysis && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <h4 style={{ 
                        margin: '0 0 1.5rem 0',
                        color: '#495057',
                        fontSize: '1rem',
                        fontWeight: '600',
                        borderBottom: '2px solid #e9ecef',
                        paddingBottom: '0.5rem'
                      }}>
                        Analysis for {new Date(selectedDate).toLocaleDateString()}
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                        <div style={{
                          background: '#f8f9fa',
                          border: '1px solid #e9ecef',
                          borderRadius: '8px',
                          padding: '1.5rem'
                        }}>
                          <h5 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>SpO₂ Statistics</h5>
                          <p style={{ margin: '0.5rem 0' }}><strong>Average:</strong> {dayAnalysis.spo2_avg?.toFixed(1)}%</p>
                          <p style={{ margin: '0.5rem 0' }}><strong>Minimum:</strong> {dayAnalysis.spo2_min}%</p>
                          <p style={{ margin: '0.5rem 0' }}><strong>Maximum:</strong> {dayAnalysis.spo2_max}%</p>
                          <p style={{ margin: '0.5rem 0' }}><strong>Below 90%:</strong> {dayAnalysis.spo2_below_90_count} readings</p>
                        </div>
                        
                        <div style={{
                          background: '#f8f9fa',
                          border: '1px solid #e9ecef',
                          borderRadius: '8px',
                          padding: '1.5rem'
                        }}>
                          <h5 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>Heart Rate Statistics</h5>
                          <p style={{ margin: '0.5rem 0' }}><strong>Average:</strong> {dayAnalysis.bpm_avg?.toFixed(0)} BPM</p>
                          <p style={{ margin: '0.5rem 0' }}><strong>Minimum:</strong> {dayAnalysis.bpm_min} BPM</p>
                          <p style={{ margin: '0.5rem 0' }}><strong>Maximum:</strong> {dayAnalysis.bpm_max} BPM</p>
                        </div>
                        
                        <div style={{
                          background: '#f8f9fa',
                          border: '1px solid #e9ecef',
                          borderRadius: '8px',
                          padding: '1.5rem'
                        }}>
                          <h5 style={{ margin: '0 0 1rem 0', color: '#2c3e50' }}>Alert Summary</h5>
                          <p style={{ margin: '0.5rem 0' }}><strong>Total Alerts:</strong> {dayAnalysis.total_alerts}</p>
                          <p style={{ margin: '0.5rem 0' }}><strong>Alert Duration:</strong> {formatDuration(dayAnalysis.total_alert_duration)}</p>
                          <p style={{ margin: '0.5rem 0' }}><strong>Data Points:</strong> {dayAnalysis.total_readings}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
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
                      Date/Time
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
                      Type
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
                      Value
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
                      Duration
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
                      Severity
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
                      Oxygen Used
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
                  {alerts.map((alert, index) => {
                    const alertType = getAlertType(alert);
                    const alertValue = getAlertValue(alert);
                    const duration = getDuration(alert);
                    const severity = getAlertSeverity(alertType, alertValue);
                    return (
                      <tr key={alert.id} style={{ 
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa',
                        transition: 'background-color 0.2s ease'
                      }}>
                        <td style={{ 
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef',
                          color: '#2c3e50',
                          fontWeight: '500'
                        }}>
                          {formatDateTime(alert.start_time)}
                        </td>
                        <td style={{ 
                          textTransform: 'uppercase', 
                          fontWeight: '600',
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef',
                          color: '#7f8c8d'
                        }}>
                          {alertType}
                        </td>
                        <td style={{ 
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef',
                          color: '#7f8c8d'
                        }}>
                          {alertValue}
                          {alertType === 'spo2' && alertValue !== 'N/A' && alertValue !== 'External' ? '%' : 
                           alertType === 'bpm' && alertValue !== 'N/A' && alertValue !== 'External' ? ' BPM' : ''}
                        </td>
                        <td style={{ 
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef',
                          color: '#7f8c8d'
                        }}>
                          {formatDuration(duration)}
                        </td>
                        <td style={{ 
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef'
                        }}>
                          <span style={{ 
                            color: getSeverityColor(severity), 
                            fontWeight: '600',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            backgroundColor: severity === 'Critical' ? '#f8d7da' : severity === 'High' ? '#fff3cd' : '#e2e3e5',
                            border: `1px solid ${getSeverityColor(severity)}20`
                          }}>
                            {severity}
                          </span>
                        </td>
                        <td style={{ 
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef',
                          color: '#7f8c8d'
                        }}>
                          {alert.oxygen_used ? 
                            `${alert.oxygen_highest || 'N/A'} ${alert.oxygen_unit || 'L/min'}` : 
                            'Not used'
                          }
                        </td>
                        <td style={{ 
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef'
                        }}>
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            fontWeight: '500',
                            backgroundColor: alert.acknowledged ? '#d4edda' : '#fff3cd',
                            color: alert.acknowledged ? '#155724' : '#856404',
                            border: `1px solid ${alert.acknowledged ? '#c3e6cb' : '#ffeaa7'}`
                          }}>
                            {alert.acknowledged ? 'Acknowledged' : 'Pending'}
                          </span>
                        </td>
                        <td style={{ 
                          padding: '1rem',
                          borderBottom: '1px solid #e9ecef'
                        }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              onClick={() => handleViewAlertDetails(alert.id)}
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
                              title="View Details"
                            >
                              👁️
                            </button>
                            {!alert.acknowledged && (
                              <button 
                                onClick={() => handleAcknowledgeAlert(alert.id)}
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
                                title="Acknowledge Alert"
                              >
                                ✅
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {alerts.length === 0 && activeTab !== 'history' && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              {activeTab === 'unacknowledged' ? 
                'No unacknowledged alerts found.' : 
                'No alerts found.'
              }
            </div>
          )}
        </div>
      </div>

      {/* Alert Details Modal */}
      {showAlertModal && selectedAlert && (
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
            maxWidth: '800px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>
                Alert Details
              </h3>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowAlertModal(false)}
              >
                Close
              </button>
            </div>

            <div className="admin-grid">
              <div className="admin-card">
                <h4>Alert Information</h4>
                <p><strong>Type:</strong> {getAlertType(selectedAlert)?.toUpperCase()}</p>
                <p><strong>Time:</strong> {formatDateTime(selectedAlert.start_time)}</p>
                <p><strong>Value:</strong> {getAlertValue(selectedAlert)}</p>
                <p><strong>Duration:</strong> {formatDuration(getDuration(selectedAlert))}</p>
              </div>

              <div className="admin-card">
                <h4>Response Data</h4>
                <p><strong>Oxygen Used:</strong> {selectedAlert.oxygen_used ? 'Yes' : 'No'}</p>
                <p><strong>Oxygen Amount:</strong> {selectedAlert.oxygen_highest || 'Not recorded'}</p>
                <p><strong>Unit:</strong> {selectedAlert.oxygen_unit || 'N/A'}</p>
                <p><strong>Acknowledged:</strong> {selectedAlert.acknowledged ? 'Yes' : 'No'}</p>
              </div>
            </div>

            {selectedAlert.readings && selectedAlert.readings.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4>Related Readings</h4>
                <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #e9ecef', borderRadius: '8px' }}>
                  <table style={{ 
                    width: '100%', 
                    borderCollapse: 'collapse',
                    fontSize: '0.9rem',
                    margin: 0
                  }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ 
                          padding: '0.75rem', 
                          textAlign: 'left', 
                          fontWeight: '600',
                          color: '#2c3e50',
                          borderBottom: '1px solid #e9ecef',
                          fontSize: '0.8rem'
                        }}>
                          Time
                        </th>
                        <th style={{ 
                          padding: '0.75rem', 
                          textAlign: 'left', 
                          fontWeight: '600',
                          color: '#2c3e50',
                          borderBottom: '1px solid #e9ecef',
                          fontSize: '0.8rem'
                        }}>
                          SpO₂
                        </th>
                        <th style={{ 
                          padding: '0.75rem', 
                          textAlign: 'left', 
                          fontWeight: '600',
                          color: '#2c3e50',
                          borderBottom: '1px solid #e9ecef',
                          fontSize: '0.8rem'
                        }}>
                          BPM
                        </th>
                        <th style={{ 
                          padding: '0.75rem', 
                          textAlign: 'left', 
                          fontWeight: '600',
                          color: '#2c3e50',
                          borderBottom: '1px solid #e9ecef',
                          fontSize: '0.8rem'
                        }}>
                          Perfusion
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAlert.readings.slice(0, 20).map((reading, index) => (
                        <tr key={index} style={{ 
                          backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa'
                        }}>
                          <td style={{ 
                            padding: '0.75rem',
                            borderBottom: '1px solid #e9ecef',
                            color: '#2c3e50'
                          }}>
                            {new Date(reading.datetime).toLocaleTimeString()}
                          </td>
                          <td style={{ 
                            padding: '0.75rem',
                            borderBottom: '1px solid #e9ecef',
                            color: '#7f8c8d'
                          }}>
                            {reading.spo2}%
                          </td>
                          <td style={{ 
                            padding: '0.75rem',
                            borderBottom: '1px solid #e9ecef',
                            color: '#7f8c8d'
                          }}>
                            {reading.bpm}
                          </td>
                          <td style={{ 
                            padding: '0.75rem',
                            borderBottom: '1px solid #e9ecef',
                            color: '#7f8c8d'
                          }}>
                            {reading.perfusion}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedAlert.readings.length > 20 && (
                  <p style={{ textAlign: 'center', color: '#666', marginTop: '0.5rem' }}>
                    Showing first 20 of {selectedAlert.readings.length} readings
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMonitoring;
