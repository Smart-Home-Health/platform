import React, { useState, useEffect } from 'react';
import config from '../../config';

const AdminSettings = () => {
  const [settings, setSettings] = useState({});
  const [mqttSettings, setMqttSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general'); // 'general', 'mqtt', 'sensors', 'alarms'
  const [testingMqtt, setTestingMqtt] = useState(false);
  const [mqttTestResult, setMqttTestResult] = useState(null);

  useEffect(() => {
    fetchSettings();
    if (activeTab === 'mqtt') {
      fetchMqttSettings();
    }
  }, [activeTab]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/settings`);
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMqttSettings = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/mqtt/settings`);
      const data = await response.json();
      setMqttSettings(data);
    } catch (error) {
      console.error('Error fetching MQTT settings:', error);
    }
  };

  const handleSaveSettings = async (updatedSettings) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: updatedSettings }),
      });

      if (response.ok) {
        fetchSettings();
        alert('Settings saved successfully!');
      } else {
        console.error('Failed to save settings');
        alert('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings');
    }
  };

  const handleSaveMqttSettings = async (updatedMqttSettings) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/mqtt/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedMqttSettings),
      });

      if (response.ok) {
        fetchMqttSettings();
        alert('MQTT settings saved successfully!');
      } else {
        console.error('Failed to save MQTT settings');
        alert('Failed to save MQTT settings');
      }
    } catch (error) {
      console.error('Error saving MQTT settings:', error);
      alert('Error saving MQTT settings');
    }
  };

  const handleTestMqttConnection = async () => {
    setTestingMqtt(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/mqtt/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mqttSettings),
      });

      const result = await response.json();
      setMqttTestResult(result);
    } catch (error) {
      console.error('Error testing MQTT connection:', error);
      setMqttTestResult({ success: false, message: 'Error testing connection' });
    } finally {
      setTestingMqtt(false);
    }
  };

  const renderGeneralSettings = () => {
    const generalSettings = {
      chart_time_range: settings.chart_time_range?.value || '5m',
      perfusion_as_percent: settings.perfusion_as_percent?.value === 'true',
      show_statistics: settings.show_statistics?.value !== 'false',
      baud_rate: settings.baud_rate?.value || '19200',
      gpio_enabled: settings.gpio_enabled?.value === 'true'
    };

    const handleChange = (key, value) => {
      const updatedSettings = { ...generalSettings, [key]: value };
      handleSaveSettings(updatedSettings);
    };

    return (
      <div className="admin-grid">
        <div className="admin-card">
          <h3 className="admin-card-title">Dashboard Settings</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
              Chart Time Range
            </label>
            <select
              value={generalSettings.chart_time_range}
              onChange={(e) => handleChange('chart_time_range', e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            >
              <option value="1m">1 Minute</option>
              <option value="3m">3 Minutes</option>
              <option value="5m">5 Minutes</option>
              <option value="10m">10 Minutes</option>
              <option value="30m">30 Minutes</option>
              <option value="1h">1 Hour</option>
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={generalSettings.perfusion_as_percent}
                onChange={(e) => handleChange('perfusion_as_percent', e.target.checked)}
              />
              Show Perfusion as Percentage
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={generalSettings.show_statistics}
                onChange={(e) => handleChange('show_statistics', e.target.checked)}
              />
              Show Statistics (Min/Max/Avg)
            </label>
          </div>
        </div>

        <div className="admin-card">
          <h3 className="admin-card-title">Alarm Thresholds</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Min SpO₂ (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.MIN_SPO2?.value || 88}
                onChange={(e) => handleChange('MIN_SPO2', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Max SpO₂ (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.MAX_SPO2?.value || 100}
                onChange={(e) => handleChange('MAX_SPO2', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Min BPM
              </label>
              <input
                type="number"
                min="0"
                value={settings.MIN_BPM?.value || 50}
                onChange={(e) => handleChange('MIN_BPM', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Max BPM
              </label>
              <input
                type="number"
                min="0"
                value={settings.MAX_BPM?.value || 120}
                onChange={(e) => handleChange('MAX_BPM', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMqttSettings = () => {
    const handleMqttChange = (key, value) => {
      setMqttSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
      <div className="admin-grid">
        <div className="admin-card">
          <h3 className="admin-card-title">MQTT Connection</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={mqttSettings.mqtt_enabled === 'true'}
                onChange={(e) => handleMqttChange('mqtt_enabled', e.target.checked ? 'true' : 'false')}
              />
              Enable MQTT
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Broker Host
              </label>
              <input
                type="text"
                value={mqttSettings.mqtt_broker || ''}
                onChange={(e) => handleMqttChange('mqtt_broker', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                placeholder="localhost"
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Port
              </label>
              <input
                type="number"
                value={mqttSettings.mqtt_port || '1883'}
                onChange={(e) => handleMqttChange('mqtt_port', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Username
              </label>
              <input
                type="text"
                value={mqttSettings.mqtt_username || ''}
                onChange={(e) => handleMqttChange('mqtt_username', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Password
              </label>
              <input
                type="password"
                value={mqttSettings.mqtt_password || ''}
                onChange={(e) => handleMqttChange('mqtt_password', e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
              Client ID
            </label>
            <input
              type="text"
              value={mqttSettings.mqtt_client_id || ''}
              onChange={(e) => handleMqttChange('mqtt_client_id', e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              placeholder="shh-device"
            />
          </div>

          <div className="admin-actions">
            <button 
              className="btn btn-primary"
              onClick={() => handleSaveMqttSettings(mqttSettings)}
            >
              Save MQTT Settings
            </button>
            <button 
              className="btn btn-secondary"
              onClick={handleTestMqttConnection}
              disabled={testingMqtt}
            >
              {testingMqtt ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {mqttTestResult && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              borderRadius: '4px',
              backgroundColor: mqttTestResult.success ? '#d4edda' : '#f8d7da',
              color: mqttTestResult.success ? '#155724' : '#721c24',
              border: `1px solid ${mqttTestResult.success ? '#c3e6cb' : '#f5c6cb'}`
            }}>
              <strong>{mqttTestResult.success ? 'Success!' : 'Failed!'}</strong>
              <br />
              {mqttTestResult.message}
            </div>
          )}
        </div>

        <div className="admin-card">
          <h3 className="admin-card-title">Home Assistant Integration</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={mqttSettings.mqtt_discovery_enabled === 'true'}
                onChange={(e) => handleMqttChange('mqtt_discovery_enabled', e.target.checked ? 'true' : 'false')}
              />
              Enable MQTT Discovery
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
              Base Topic
            </label>
            <input
              type="text"
              value={mqttSettings.mqtt_base_topic || 'shh'}
              onChange={(e) => handleMqttChange('mqtt_base_topic', e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>

          <div className="admin-actions">
            <button 
              className="btn btn-success"
              onClick={() => {
                fetch(`${config.apiUrl}/api/mqtt/send-discovery`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({})
                }).then(() => alert('Discovery messages sent!'))
                  .catch(err => alert('Failed to send discovery messages'));
              }}
            >
              Send Discovery Messages
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="admin-page">
      <div className="loading">Loading settings...</div>
    </div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">System Settings</h1>
        <p className="admin-page-description">
          Configure system settings, MQTT integration, and hardware parameters
        </p>
      </div>

      <div className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">Configuration</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className={`btn ${activeTab === 'general' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('general')}
            >
              General
            </button>
            <button 
              className={`btn ${activeTab === 'mqtt' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('mqtt')}
            >
              MQTT
            </button>
          </div>
        </div>

        <div className="admin-section-content">
          {activeTab === 'general' && renderGeneralSettings()}
          {activeTab === 'mqtt' && renderMqttSettings()}
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
