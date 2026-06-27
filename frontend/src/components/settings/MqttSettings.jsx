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
import React, { useState, useEffect } from 'react';
import config from '../../config';

const MqttSettings = () => {
  const [mqttSettings, setMqttSettings] = useState({
    mqtt_enabled: false,
    mqtt_broker: '',
    mqtt_port: 1883,
    mqtt_username: '',
    mqtt_password: '',
    mqtt_client_id: 'sensor_monitor',
    mqtt_discovery_enabled: true,
    mqtt_base_topic: 'shh',
    // Topic configuration for each vital
    topics: {
      spo2: {
        enabled: true,
        broadcast_topic: 'shh/spo2/state',
        listen_topic: 'shh/spo2/set'
      },
      bpm: {
        enabled: true,
        broadcast_topic: 'shh/bpm/state',
        listen_topic: 'shh/bpm/set'
      },
      perfusion: {
        enabled: true,
        broadcast_topic: 'shh/perfusion/state',
        listen_topic: 'shh/perfusion/set'
      },
      blood_pressure: {
        enabled: true,
        broadcast_topic: 'shh/bp/state',
        listen_topic: 'shh/bp/set'
      },
      temperature: {
        enabled: true,
        broadcast_topic: 'shh/temp/state',
        listen_topic: 'shh/temp/set'
      },
      nutrition: {
        enabled: false,
        water_broadcast_topic: 'shh/water/state',
        water_listen_topic: 'shh/water/set',
        calories_broadcast_topic: 'shh/calories/state',
        calories_listen_topic: 'shh/calories/set'
      },
      weight: {
        enabled: false,
        broadcast_topic: 'shh/weight/state',
        listen_topic: 'shh/weight/set'
      },
      bathroom: {
        enabled: false,
        broadcast_topic: 'shh/bathroom/state',
        listen_topic: 'shh/bathroom/set'
      },
      spo2_alarm: {
        enabled: true,
        broadcast_topic: 'shh/alarms/spo2',
        listen_topic: 'shh/alarms/spo2/set'
      },
      bpm_alarm: {
        enabled: true,
        broadcast_topic: 'shh/alarms/bpm',
        listen_topic: 'shh/alarms/bpm/set'
      },
      alarm1: {
        enabled: true,
        broadcast_topic: 'shh/alarms/gpio1',
        listen_topic: 'shh/alarms/gpio1/set'
      },
      alarm2: {
        enabled: true,
        broadcast_topic: 'shh/alarms/gpio2',
        listen_topic: 'shh/alarms/gpio2/set'
      }
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const vitalNames = {
    spo2: 'SpO₂ Level',
    bpm: 'Heart Rate (BPM)',
    perfusion: 'Perfusion Index',
    blood_pressure: 'Blood Pressure',
    temperature: 'Temperature',
    nutrition: 'Nutrition (Water & Calories)',
    weight: 'Weight',
    bathroom: 'Bathroom',
    spo2_alarm: 'SpO₂ Alarm',
    bpm_alarm: 'Heart Rate Alarm',
    alarm1: 'GPIO Alarm 1',
    alarm2: 'GPIO Alarm 2'
  };

  // Load MQTT settings on component mount
  useEffect(() => {
    loadMqttSettings();
  }, []);

  const loadMqttSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${config.apiUrl}/api/mqtt/settings`, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        console.log('[MQTT Settings] Loaded from backend:', data);
        setMqttSettings(data);
      } else {
        throw new Error('Failed to load MQTT settings');
      }
    } catch (err) {
      setError('Failed to load MQTT settings. Using defaults.');
      console.error('Error loading MQTT settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setMqttSettings(prev => ({
      ...prev,
      [field]: value
    }));
    setError(null);
    setSuccess(false);
  };

  const handleTopicChange = (vital, field, value) => {
    setMqttSettings(prev => ({
      ...prev,
      topics: {
        ...prev.topics,
        [vital]: {
          ...prev.topics[vital],
          [field]: value
        }
      }
    }));
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`${config.apiUrl}/api/mqtt/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mqttSettings),
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save MQTT settings');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    setConnectionStatus('testing');
    try {
      const response = await fetch(`${config.apiUrl}/api/mqtt/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mqttSettings),
      });

      if (response.ok) {
        setConnectionStatus('connected');
        setTimeout(() => setConnectionStatus('disconnected'), 5000);
      } else {
        setConnectionStatus('failed');
        setTimeout(() => setConnectionStatus('disconnected'), 3000);
      }
    } catch (err) {
      setConnectionStatus('failed');
      setTimeout(() => setConnectionStatus('disconnected'), 3000);
    }
  };

  const sendDiscovery = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/mqtt/send-discovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error('Failed to send MQTT discovery');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (isLoading) {
    return <div style={{ color: '#ffffff', padding: '20px' }}>Loading MQTT settings...</div>;
  }

  return (
    <div>
      <h3 style={{ 
        color: '#ffffff', 
        fontSize: '1.25rem', 
        marginBottom: '16px',
        fontWeight: '600'
      }}>MQTT Configuration</h3>
      
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
        }}>MQTT settings saved successfully!</div>
      )}

      <div>
        <div style={{ 
          background: 'rgba(20,24,32,0.8)', 
          borderRadius: '8px', 
          padding: '16px', 
          marginBottom: '16px',
          border: '1px solid #4a5568'
        }}>
          <h4 style={{ color: '#ffffff', marginBottom: '12px', fontSize: '1.1rem', fontWeight: '500' }}>
            MQTT Broker Settings
          </h4>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              fontSize: '14px', 
              color: '#ffffff',
              fontWeight: '500',
              cursor: 'pointer',
              padding: '12px',
              backgroundColor: '#1a202c',
              borderRadius: '6px',
              border: '1px solid #4a5568'
            }}>
              <input
                type="checkbox"
                checked={mqttSettings.mqtt_enabled}
                onChange={(e) => handleInputChange('mqtt_enabled', e.target.checked)}
                style={{ 
                  width: '18px',
                  height: '18px',
                  accentColor: '#007bff',
                  cursor: 'pointer'
                }}
              />
              <span>Enable MQTT</span>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ 
                color: '#e2e8f0', 
                fontSize: '13px', 
                fontWeight: '500', 
                marginBottom: '6px', 
                display: 'block' 
              }}>MQTT Broker Address</label>
              <input
                type="text"
                value={mqttSettings.mqtt_broker}
                onChange={(e) => handleInputChange('mqtt_broker', e.target.value)}
                placeholder="localhost"
                disabled={!mqttSettings.mqtt_enabled}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                  fontSize: '14px',
                  outline: 'none',
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
              }}>Port</label>
              <input
                type="number"
                value={mqttSettings.mqtt_port}
                onChange={(e) => handleInputChange('mqtt_port', parseInt(e.target.value))}
                min="1"
                max="65535"
                disabled={!mqttSettings.mqtt_enabled}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ 
                color: '#e2e8f0', 
                fontSize: '13px', 
                fontWeight: '500', 
                marginBottom: '6px', 
                display: 'block' 
              }}>Username (optional)</label>
              <input
                type="text"
                value={mqttSettings.mqtt_username}
                onChange={(e) => handleInputChange('mqtt_username', e.target.value)}
                disabled={!mqttSettings.mqtt_enabled}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                  fontSize: '14px',
                  outline: 'none',
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
              }}>Password (optional)</label>
              <input
                type="password"
                value={mqttSettings.mqtt_password}
                onChange={(e) => handleInputChange('mqtt_password', e.target.value)}
                disabled={!mqttSettings.mqtt_enabled}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                  border: '1px solid #4a5568',
                  borderRadius: '6px',
                  color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ 
              color: '#e2e8f0', 
              fontSize: '13px', 
              fontWeight: '500', 
              marginBottom: '6px', 
              display: 'block' 
            }}>Client ID</label>
            <input
              type="text"
              value={mqttSettings.mqtt_client_id}
              onChange={(e) => handleInputChange('mqtt_client_id', e.target.value)}
              disabled={!mqttSettings.mqtt_enabled}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                border: '1px solid #4a5568',
                borderRadius: '6px',
                color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <button 
              type="button"
              onClick={testConnection}
              disabled={!mqttSettings.mqtt_enabled || connectionStatus === 'testing'}
              style={{
                backgroundColor: connectionStatus === 'connected' ? '#28a745' : 
                               connectionStatus === 'failed' ? '#dc3545' : '#007bff',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: (!mqttSettings.mqtt_enabled || connectionStatus === 'testing') ? 'not-allowed' : 'pointer',
                opacity: (!mqttSettings.mqtt_enabled || connectionStatus === 'testing') ? 0.6 : 1,
                transition: 'all 0.2s ease'
              }}
            >
              {connectionStatus === 'testing' ? 'Testing...' : 
               connectionStatus === 'connected' ? 'Connected!' :
               connectionStatus === 'failed' ? 'Failed' : 'Test Connection'}
            </button>
          </div>
        </div>

        <div style={{ 
          background: 'rgba(20,24,32,0.8)', 
          borderRadius: '8px', 
          padding: '16px', 
          marginBottom: '16px',
          border: '1px solid #4a5568'
        }}>
          <h4 style={{ color: '#ffffff', marginBottom: '12px', fontSize: '1.1rem', fontWeight: '500' }}>
            Topic Configuration
          </h4>
          <p style={{ color: '#cbd5e0', marginBottom: '16px', lineHeight: '1.5', fontSize: '13px' }}>
            Configure which vitals are broadcast via MQTT and their topics for sending and receiving data.
          </p>

          <div style={{ display: 'grid', gap: '12px' }}>
            {Object.entries(mqttSettings.topics).map(([vital, config]) => {
              const vitalNames = {
                spo2: 'SpO₂ Level',
                bpm: 'Heart Rate (BPM)',
                perfusion: 'Perfusion Index',
                blood_pressure: 'Blood Pressure',
                temperature: 'Temperature',
                nutrition: 'Nutrition (General)',
                nutrition_water: 'Water Intake',
                nutrition_calories: 'Calorie Intake',
                weight: 'Weight',
                bathroom: 'Bathroom',
                spo2_alarm: 'SpO₂ Alarm',
                bpm_alarm: 'Heart Rate Alarm',
                alarm1: 'GPIO Alarm 1',
                alarm2: 'GPIO Alarm 2'
              };

              return (
                <div key={vital} style={{ 
                  backgroundColor: '#1a202c', 
                  borderRadius: '6px', 
                  padding: '12px',
                  border: '1px solid #4a5568'
                }}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '10px',
                      fontSize: '14px', 
                      color: '#ffffff',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(e) => handleTopicChange(vital, 'enabled', e.target.checked)}
                        disabled={!mqttSettings.mqtt_enabled}
                        style={{ 
                          width: '16px',
                          height: '16px',
                          accentColor: '#007bff',
                          cursor: 'pointer'
                        }}
                      />
                      <span>{vitalNames[vital]}</span>
                    </label>
                  </div>
                  
                  {config.enabled && (
                    vital === 'nutrition' ? (
                      // Special case for nutrition with 4 topic inputs
                      <div style={{ display: 'grid', gap: '12px', marginTop: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ 
                              color: '#e2e8f0', 
                              fontSize: '12px', 
                              fontWeight: '500', 
                              marginBottom: '4px', 
                              display: 'block' 
                            }}>Water Broadcast Topic</label>
                            <input
                              type="text"
                              value={config.water_broadcast_topic}
                              onChange={(e) => handleTopicChange(vital, 'water_broadcast_topic', e.target.value)}
                              disabled={!mqttSettings.mqtt_enabled}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                                border: '1px solid #4a5568',
                                borderRadius: '4px',
                                color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                                fontSize: '13px',
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ 
                              color: '#e2e8f0', 
                              fontSize: '12px', 
                              fontWeight: '500', 
                              marginBottom: '4px', 
                              display: 'block' 
                            }}>Water Listen Topic</label>
                            <input
                              type="text"
                              value={config.water_listen_topic}
                              onChange={(e) => handleTopicChange(vital, 'water_listen_topic', e.target.value)}
                              disabled={!mqttSettings.mqtt_enabled}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                                border: '1px solid #4a5568',
                                borderRadius: '4px',
                                color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                                fontSize: '13px',
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ 
                              color: '#e2e8f0', 
                              fontSize: '12px', 
                              fontWeight: '500', 
                              marginBottom: '4px', 
                              display: 'block' 
                            }}>Calories Broadcast Topic</label>
                            <input
                              type="text"
                              value={config.calories_broadcast_topic}
                              onChange={(e) => handleTopicChange(vital, 'calories_broadcast_topic', e.target.value)}
                              disabled={!mqttSettings.mqtt_enabled}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                                border: '1px solid #4a5568',
                                borderRadius: '4px',
                                color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                                fontSize: '13px',
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ 
                              color: '#e2e8f0', 
                              fontSize: '12px', 
                              fontWeight: '500', 
                              marginBottom: '4px', 
                              display: 'block' 
                            }}>Calories Listen Topic</label>
                            <input
                              type="text"
                              value={config.calories_listen_topic}
                              onChange={(e) => handleTopicChange(vital, 'calories_listen_topic', e.target.value)}
                              disabled={!mqttSettings.mqtt_enabled}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                                border: '1px solid #4a5568',
                                borderRadius: '4px',
                                color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                                fontSize: '13px',
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Standard case for other vitals with 2 topic inputs
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
                        <div>
                          <label style={{ 
                            color: '#e2e8f0', 
                            fontSize: '12px', 
                            fontWeight: '500', 
                            marginBottom: '4px', 
                            display: 'block' 
                          }}>Broadcast Topic</label>
                          <input
                            type="text"
                            value={config.broadcast_topic}
                            onChange={(e) => handleTopicChange(vital, 'broadcast_topic', e.target.value)}
                            disabled={!mqttSettings.mqtt_enabled}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                              border: '1px solid #4a5568',
                              borderRadius: '4px',
                              color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                              fontSize: '13px',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ 
                            color: '#e2e8f0', 
                            fontSize: '12px', 
                            fontWeight: '500', 
                            marginBottom: '4px', 
                            display: 'block' 
                          }}>Listen Topic</label>
                          <input
                            type="text"
                            value={config.listen_topic}
                            onChange={(e) => handleTopicChange(vital, 'listen_topic', e.target.value)}
                            disabled={!mqttSettings.mqtt_enabled}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                              border: '1px solid #4a5568',
                              borderRadius: '4px',
                              color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                              fontSize: '13px',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ 
            backgroundColor: '#1a202c', 
            borderRadius: '6px', 
            padding: '12px',
            border: '1px solid #4a5568',
            marginTop: '16px'
          }}>
            <h5 style={{ color: '#ffffff', marginBottom: '8px', fontSize: '1rem', fontWeight: '500' }}>
              About Topic Configuration
            </h5>
            <p style={{ color: '#cbd5e0', marginBottom: '8px', lineHeight: '1.5', fontSize: '13px' }}>
              <strong style={{ color: '#ffffff' }}>Broadcast Topic:</strong> Where this device publishes data updates for each vital.
            </p>
            <p style={{ color: '#cbd5e0', margin: 0, lineHeight: '1.5', fontSize: '13px' }}>
              <strong style={{ color: '#ffffff' }}>Listen Topic:</strong> Where this device listens for external commands or data for each vital.
            </p>
          </div>
        </div>

        <div style={{ 
          background: 'rgba(20,24,32,0.8)', 
          borderRadius: '8px', 
          padding: '16px', 
          marginBottom: '16px',
          border: '1px solid #4a5568'
        }}>
          <h4 style={{ color: '#ffffff', marginBottom: '12px', fontSize: '1.1rem', fontWeight: '500' }}>
            Home Assistant Discovery
          </h4>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              fontSize: '14px', 
              color: '#ffffff',
              fontWeight: '500',
              cursor: 'pointer',
              padding: '12px',
              backgroundColor: '#1a202c',
              borderRadius: '6px',
              border: '1px solid #4a5568'
            }}>
              <input
                type="checkbox"
                checked={mqttSettings.mqtt_discovery_enabled}
                onChange={(e) => handleInputChange('mqtt_discovery_enabled', e.target.checked)}
                disabled={!mqttSettings.mqtt_enabled}
                style={{ 
                  width: '18px',
                  height: '18px',
                  accentColor: '#007bff',
                  cursor: 'pointer'
                }}
              />
              <span>Enable Home Assistant Discovery</span>
            </label>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ 
              color: '#e2e8f0', 
              fontSize: '13px', 
              fontWeight: '500', 
              marginBottom: '6px', 
              display: 'block' 
            }}>Base Topic</label>
            <input
              type="text"
              value={mqttSettings.mqtt_base_topic}
              onChange={(e) => handleInputChange('mqtt_base_topic', e.target.value)}
              disabled={!mqttSettings.mqtt_enabled}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: mqttSettings.mqtt_enabled ? '#2d3748' : '#1a202c',
                border: '1px solid #4a5568',
                borderRadius: '6px',
                color: mqttSettings.mqtt_enabled ? '#ffffff' : '#6c757d',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <button 
              type="button"
              onClick={sendDiscovery}
              disabled={!mqttSettings.mqtt_enabled || !mqttSettings.mqtt_discovery_enabled}
              style={{
                backgroundColor: '#28a745',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: (!mqttSettings.mqtt_enabled || !mqttSettings.mqtt_discovery_enabled) ? 'not-allowed' : 'pointer',
                opacity: (!mqttSettings.mqtt_enabled || !mqttSettings.mqtt_discovery_enabled) ? 0.6 : 1,
                transition: 'all 0.2s ease'
              }}
            >
              Send Discovery Messages
            </button>
          </div>

          <div style={{ 
            backgroundColor: '#1a202c', 
            borderRadius: '6px', 
            padding: '12px',
            border: '1px solid #4a5568'
          }}>
            <h5 style={{ color: '#ffffff', marginBottom: '8px', fontSize: '1rem', fontWeight: '500' }}>
              About MQTT Discovery
            </h5>
            <p style={{ color: '#cbd5e0', marginBottom: '8px', lineHeight: '1.5', fontSize: '13px' }}>
              Home Assistant Discovery automatically configures sensors in Home Assistant when enabled. 
              Test mode uses a "medical-test" prefix to avoid conflicts with production systems.
            </p>
            <p style={{ color: '#cbd5e0', margin: 0, lineHeight: '1.5', fontSize: '13px' }}>
              <strong style={{ color: '#ffffff' }}>Note:</strong> Discovery messages are sent automatically when MQTT connects, 
              or manually using the button above.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            style={{
              backgroundColor: '#007bff',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            {isSaving ? 'Saving...' : 'Save MQTT Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MqttSettings;
