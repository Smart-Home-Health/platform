import React, { useState, useEffect } from 'react';
import MqttSettings from './settings/MqttSettings';
import GpioSettings from './settings/GpioSettings';
import SerialSettings from './settings/SerialSettings';
import DashboardSettings from './settings/DashboardSettings';
import PatientSettings from './settings/PatientSettings';
import ThresholdSettings from './settings/ThresholdSettings';
import UserSettings from './settings/UserSettings';
import ModalBase from './ModalBase';
import { getSettings, updateSettings } from '../services/settings';
import config from '../config';

/**
 * Settings form component for system configuration
 */
const SettingsForm = ({ onClose }) => {
  const [formData, setFormData] = useState({
    device_name: '',
    device_location: '',
    temp_unit: 'F',
    weight_unit: 'lbs',
    dark_mode: true,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [devLoading, setDevLoading] = useState(false);
  const [devSuccess, setDevSuccess] = useState(false);
  const [devError, setDevError] = useState(null);

  // Load settings on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await getSettings();
        
        const newFormData = {};
        for (const [key, value] of Object.entries(settings)) {
          // Handle direct value format from API
          newFormData[key] = typeof value === 'object' && value.value !== undefined ? value.value : value;
        }
        
        // Only update state if we received some settings
        if (Object.keys(newFormData).length > 0) {
          setFormData(prev => ({
            ...prev,
            ...newFormData
          }));
        }
        
        setError(null);
      } catch (err) {
        console.error("Error loading settings:", err);
        setError("Failed to load settings. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleInputChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      // Convert numeric inputs to numbers
      const settingsToUpdate = {
        device_name: formData.device_name,
        device_location: formData.device_location,
        temp_unit: formData.temp_unit,
        weight_unit: formData.weight_unit,
        dark_mode: formData.dark_mode,
      };

      await updateSettings(settingsToUpdate);
      setSuccess(true);
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Failed to save settings. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWebsocketBroadcast = async () => {
    setDevLoading(true);
    setDevError(null);
    setDevSuccess(false);
    
    try {
      const response = await fetch(`${config.apiUrl}/api/dev/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) throw new Error('Failed to trigger websocket broadcast');
      
      setDevSuccess(true);
      setTimeout(() => setDevSuccess(false), 3000);
    } catch (err) {
      setDevError('Failed to trigger websocket broadcast. Please try again.');
    } finally {
      setDevLoading(false);
    }
  };

  if (isLoading) {
    return (
      <ModalBase isOpen={true} onClose={onClose} title="Settings">
        <div className="loading">Loading settings...</div>
      </ModalBase>
    );
  }

  return (
    <ModalBase isOpen={true} onClose={onClose} title={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('general')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'general' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'general' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'dashboard' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'dashboard' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('thresholds')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'thresholds' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'thresholds' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Thresholds
            </button>
            <button
              onClick={() => setActiveTab('gpio')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'gpio' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'gpio' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              GPIO
            </button>
            <button
              onClick={() => setActiveTab('serial')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'serial' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'serial' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Serial
            </button>
            <button
              onClick={() => setActiveTab('mqtt')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'mqtt' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'mqtt' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              MQTT
            </button>
            <button
              onClick={() => setActiveTab('patients')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'patients' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'patients' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Patients
            </button>
            <button
              onClick={() => setActiveTab('users')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'users' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'users' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Users
            </button>
            <button
              onClick={() => setActiveTab('dev')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'dev' ? '#007bff' : '#f8f9fa',
                color: activeTab === 'dev' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Dev
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'admin' ? '#9f7aea' : '#f8f9fa',
                color: activeTab === 'admin' ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              Admin
            </button>
          </div>
        </div>
      </div>
    }>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
        <form onSubmit={handleSubmit} style={{ 
          backgroundColor: 'rgba(30,32,40,0.95)', 
          borderRadius: '12px', 
          padding: '16px',
          border: '1px solid #4a5568'
        }}>
          {activeTab === 'general' && (
            <>
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ 
                  color: '#ffffff', 
                  fontSize: '1.25rem', 
                  marginBottom: '16px',
                  fontWeight: '600'
                }}>Device Settings</h3>
                <div style={{ display: 'grid', gap: '16px' }}>
                  <div>
                    <label style={{ 
                      color: '#e2e8f0', 
                      fontSize: '13px', 
                      fontWeight: '500', 
                      marginBottom: '6px', 
                      display: 'block' 
                    }}>Device Name</label>
                    <input
                      type="text"
                      value={formData.device_name}
                      onChange={(e) => handleInputChange('device_name', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: '#2d3748',
                        border: '1px solid #4a5568',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s ease',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ 
                      color: '#e2e8f0', 
                      fontSize: '13px', 
                      fontWeight: '500', 
                      marginBottom: '6px', 
                      display: 'block' 
                    }}>Location</label>
                    <input
                      type="text"
                      value={formData.device_location}
                      onChange={(e) => handleInputChange('device_location', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: '#2d3748',
                        border: '1px solid #4a5568',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s ease',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ 
                  color: '#ffffff', 
                  fontSize: '1.25rem', 
                  marginBottom: '16px',
                  fontWeight: '600'
                }}>Display Settings</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ 
                      color: '#e2e8f0', 
                      fontSize: '13px', 
                      fontWeight: '500', 
                      marginBottom: '6px', 
                      display: 'block' 
                    }}>Temperature Unit</label>
                    <select
                      value={formData.temp_unit}
                      onChange={(e) => handleInputChange('temp_unit', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: '#2d3748',
                        border: '1px solid #4a5568',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="F">Fahrenheit (°F)</option>
                      <option value="C">Celsius (°C)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ 
                      color: '#e2e8f0', 
                      fontSize: '13px', 
                      fontWeight: '500', 
                      marginBottom: '6px', 
                      display: 'block' 
                    }}>Weight Unit</label>
                    <select
                      value={formData.weight_unit}
                      onChange={(e) => handleInputChange('weight_unit', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: '#2d3748',
                        border: '1px solid #4a5568',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="lbs">Pounds (lbs)</option>
                      <option value="kg">Kilograms (kg)</option>
                    </select>
                  </div>
                </div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  padding: '12px',
                  backgroundColor: '#1a202c',
                  borderRadius: '6px',
                  border: '1px solid #4a5568'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.dark_mode}
                    onChange={(e) => handleInputChange('dark_mode', e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      accentColor: '#007bff',
                      cursor: 'pointer'
                    }}
                  />
                  <label style={{ 
                    color: '#ffffff', 
                    fontSize: '14px', 
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}>Dark Mode</label>
                </div>
              </div>
            </>
          )}
          {activeTab === 'dashboard' && (
            <DashboardSettings />
          )}
          {activeTab === 'thresholds' && (
            <ThresholdSettings />
          )}
          {activeTab === 'gpio' && (
            <GpioSettings />
          )}
          {activeTab === 'serial' && (
            <SerialSettings />
          )}
          {activeTab === 'mqtt' && (
            <MqttSettings />
          )}
          {activeTab === 'patients' && (
            <PatientSettings />
          )}
          {activeTab === 'users' && (
            <UserSettings />
          )}
          {activeTab === 'dev' && (
            <>
              <div>
                <h3 style={{ 
                  color: '#ffffff', 
                  fontSize: '1.25rem', 
                  marginBottom: '16px',
                  fontWeight: '600'
                }}>Development Tools</h3>
                <div style={{
                  backgroundColor: 'rgba(20,24,32,0.8)',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid #4a5568'
                }}>
                  <h4 style={{ color: '#ffffff', marginBottom: '12px', fontSize: '1.1rem', fontWeight: '500' }}>
                    WebSocket Testing
                  </h4>
                  <p style={{ color: '#cbd5e0', marginBottom: '16px', lineHeight: '1.5', fontSize: '13px' }}>
                    Trigger a websocket broadcast to test real-time data updates and client connections.
                  </p>
                  
                  {devError && (
                    <div style={{ 
                      backgroundColor: '#fed7d7', 
                      color: '#c53030', 
                      padding: '10px 12px', 
                      borderRadius: '6px', 
                      marginBottom: '12px',
                      fontSize: '13px'
                    }}>{devError}</div>
                  )}
                  {devSuccess && (
                    <div style={{ 
                      backgroundColor: '#c6f6d5', 
                      color: '#2f855a', 
                      padding: '10px 12px', 
                      borderRadius: '6px', 
                      marginBottom: '12px',
                      fontSize: '13px'
                    }}>Websocket broadcast triggered successfully!</div>
                  )}
                  
                  <button
                    onClick={handleWebsocketBroadcast}
                    disabled={devLoading}
                    style={{
                      backgroundColor: '#28a745',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '10px 20px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: devLoading ? 'not-allowed' : 'pointer',
                      opacity: devLoading ? 0.6 : 1,
                      transition: 'all 0.2s ease',
                      marginBottom: '16px'
                    }}
                  >
                    {devLoading ? 'Broadcasting...' : 'Trigger WebSocket Broadcast'}
                  </button>
                  
                  <div style={{ 
                    backgroundColor: '#1a202c', 
                    borderRadius: '6px', 
                    padding: '12px',
                    border: '1px solid #4a5568'
                  }}>
                    <h5 style={{ color: '#ffffff', marginBottom: '8px', fontSize: '0.95rem', fontWeight: '500' }}>
                      What this does:
                    </h5>
                    <ul style={{ color: '#cbd5e0', fontSize: '13px', lineHeight: '1.4', margin: 0, paddingLeft: '16px' }}>
                      <li>Calls the backend broadcast_state() function</li>
                      <li>Sends current sensor state to all connected websocket clients</li>
                      <li>Useful for testing real-time data updates</li>
                      <li>Helps verify websocket connections are working</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
          {activeTab === 'admin' && (
            <>
              <div>
                <h3 style={{ 
                  color: '#ffffff', 
                  fontSize: '1.25rem', 
                  marginBottom: '16px',
                  fontWeight: '600'
                }}>Admin Panel Access</h3>
                <div style={{
                  backgroundColor: 'rgba(20,24,32,0.8)',
                  borderRadius: '8px',
                  padding: '20px',
                  border: '1px solid #4a5568',
                  textAlign: 'center'
                }}>
                  <h4 style={{ color: '#ffffff', marginBottom: '12px', fontSize: '1.1rem', fontWeight: '500' }}>
                    System Administration
                  </h4>
                  <p style={{ color: '#cbd5e0', marginBottom: '20px', lineHeight: '1.5', fontSize: '14px' }}>
                    Access the admin panel for advanced system configuration, user management, and system monitoring.
                  </p>
                  
                  <a
                    href="/admin"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      backgroundColor: '#9f7aea',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: '600',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 4px rgba(159, 122, 234, 0.3)'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#8b5cf6';
                      e.target.style.boxShadow = '0 4px 8px rgba(159, 122, 234, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = '#9f7aea';
                      e.target.style.boxShadow = '0 2px 4px rgba(159, 122, 234, 0.3)';
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>⚙️</span>
                    Open Admin Panel
                  </a>
                  
                  <div style={{ 
                    backgroundColor: '#1a202c', 
                    borderRadius: '6px', 
                    padding: '12px',
                    border: '1px solid #4a5568',
                    marginTop: '20px'
                  }}>
                    <h5 style={{ color: '#ffffff', marginBottom: '8px', fontSize: '0.95rem', fontWeight: '500' }}>
                      Admin Panel Features:
                    </h5>
                    <ul style={{ color: '#cbd5e0', fontSize: '13px', lineHeight: '1.5', margin: 0, paddingLeft: '16px', textAlign: 'left' }}>
                      <li>System configuration and settings management</li>
                      <li>User account administration</li>
                      <li>Database management and backups</li>
                      <li>System logs and monitoring</li>
                      <li>Security and access control</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
          {error && (
            <div style={{ 
              backgroundColor: '#fed7d7', 
              color: '#c53030', 
              padding: '10px 12px', 
              borderRadius: '6px', 
              marginBottom: '12px',
              fontSize: '13px'
            }}>{error}</div>
          )}
          {success && (
            <div style={{ 
              backgroundColor: '#c6f6d5', 
              color: '#2f855a', 
              padding: '10px 12px', 
              borderRadius: '6px', 
              marginBottom: '12px',
              fontSize: '13px'
            }}>Settings saved successfully!</div>
          )}
          {/* Only show main Save Settings button for tabs that don't have their own save functionality */}
          {activeTab !== 'dashboard' && activeTab !== 'gpio' && activeTab !== 'serial' && activeTab !== 'mqtt' && activeTab !== 'thresholds' && activeTab !== 'users' && activeTab !== 'admin' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button 
                type="submit" 
                disabled={isSubmitting}
                style={{
                  backgroundColor: '#007bff',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.6 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                {isSubmitting ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}
        </form>
        </div>
      </div>
    </ModalBase>
  );
};

export default SettingsForm;