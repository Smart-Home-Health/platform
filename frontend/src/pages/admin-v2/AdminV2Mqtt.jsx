import React, { useState, useEffect } from 'react';
import config from '../../config';
import AdminV2Layout from './AdminV2Layout';
import './AdminV2.css';

const MQTT_SECTIONS = [
  { id: 'spo2', label: 'SpO₂' },
  { id: 'bpm', label: 'Heart Rate' },
  { id: 'perfusion', label: 'Perfusion' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'blood_pressure', label: 'Blood Pressure' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'weight', label: 'Weight' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'spo2_alarm', label: 'SpO₂ Alarm' },
  { id: 'bpm_alarm', label: 'BPM Alarm' },
  { id: 'alarm1', label: 'Alarm 1' },
  { id: 'alarm2', label: 'Alarm 2' },
];

const PERM_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'get', label: 'Get only' },
  { value: 'set', label: 'Set only' },
  { value: 'both', label: 'Both' },
];

export default function AdminV2Mqtt() {
  const [connSettings, setConnSettings] = useState({
    mqtt_enabled: false,
    mqtt_broker: '',
    mqtt_port: 1883,
    mqtt_username: '',
    mqtt_password: '',
    mqtt_client_id: 'sensor_monitor',
    mqtt_base_topic: 'shh',
    mqtt_test_mode: true,
  });
  const [patientsConfig, setPatientsConfig] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingConn, setSavingConn] = useState(false);
  const [savingPatientId, setSavingPatientId] = useState(null);
  const [testingConn, setTestingConn] = useState(false);
  const [sendingDiscovery, setSendingDiscovery] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [settingsRes, patientsRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/mqtt/settings`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/mqtt/patients`, { credentials: 'include' }),
      ]);
      if (settingsRes.ok) {
        const d = await settingsRes.json();
        setConnSettings(prev => ({
          ...prev,
          mqtt_enabled: d.mqtt_enabled === true || d.mqtt_enabled === 'true',
          mqtt_broker: d.mqtt_broker || '',
          mqtt_port: parseInt(d.mqtt_port, 10) || 1883,
          mqtt_username: d.mqtt_username || '',
          mqtt_password: d.mqtt_password || '',
          mqtt_client_id: d.mqtt_client_id || 'sensor_monitor',
          mqtt_base_topic: d.mqtt_base_topic || 'shh',
          mqtt_test_mode: d.mqtt_test_mode === true || d.mqtt_test_mode === 'true',
        }));
      }
      if (patientsRes.ok) {
        const list = await patientsRes.json();
        setPatientsConfig(list);
      }
    } catch (e) {
      setError(e.message || 'Failed to load MQTT config');
    } finally {
      setLoading(false);
    }
  };

  const handleConnChange = (key, value) => {
    setConnSettings(prev => ({ ...prev, [key]: value }));
    setError('');
  };

  const saveConnection = async () => {
    setSavingConn(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${config.apiUrl}/api/mqtt/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mqtt_enabled: connSettings.mqtt_enabled,
          mqtt_broker: connSettings.mqtt_broker,
          mqtt_port: connSettings.mqtt_port,
          mqtt_username: connSettings.mqtt_username,
          mqtt_password: connSettings.mqtt_password || undefined,
          mqtt_client_id: connSettings.mqtt_client_id,
          mqtt_base_topic: connSettings.mqtt_base_topic,
          mqtt_test_mode: connSettings.mqtt_test_mode,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save');
      setSuccess('Connection settings saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingConn(false);
    }
  };

  const testConnection = async () => {
    setTestingConn(true);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/mqtt/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(connSettings),
      });
      if (res.ok) {
        setSuccess('Connection test succeeded.');
      } else {
        const data = await res.json();
        setError(data.detail || 'Connection test failed');
      }
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setTestingConn(false);
    }
  };

  const updatePatientSection = (patientId, section, value) => {
    setPatientsConfig(prev =>
      prev.map(p =>
        p.patient_id === patientId
          ? {
              ...p,
              sections: { ...(p.sections || {}), [section]: value },
            }
          : p
      )
    );
  };

  const setPatientEnabled = (patientId, enabled) => {
    setPatientsConfig(prev =>
      prev.map(p =>
        p.patient_id === patientId ? { ...p, enabled } : p
      )
    );
  };

  const savePatientConfig = async (patientId) => {
    const row = patientsConfig.find(p => p.patient_id === patientId);
    if (!row) return;
    setSavingPatientId(patientId);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/mqtt/patients/${patientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: row.enabled,
          sections: row.sections || {},
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save');
      setSuccess(`Saved config for ${row.patient_name || 'patient'}.`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingPatientId(null);
    }
  };

  const sendDiscoveryAll = async () => {
    setSendingDiscovery(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${config.apiUrl}/api/mqtt/send-discovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ test_mode: connSettings.mqtt_test_mode }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to send discovery');
      setSuccess('Discovery sent for all enabled patients.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSendingDiscovery(false);
    }
  };

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-content-inner">
          <p>Loading MQTT configuration…</p>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="admin-v2-page-header">
          <h1 className="admin-v2-page-title">MQTT Configuration</h1>
          <p className="admin-v2-page-subtitle">Configure the MQTT broker connection used by sensors and integrations</p>
        </div>
        {error && (
          <div className="admin-v2-alert admin-v2-alert-error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="admin-v2-alert admin-v2-alert-success" role="status">
            {success}
          </div>
        )}

        <section className="admin-v2-settings-section">
          <h2 className="admin-v2-settings-section-title">Connection</h2>
          <div className="admin-v2-settings-card">
            <div className="admin-v2-settings-group">
              <label className="admin-v2-checkbox-label">
                <input
                  type="checkbox"
                  checked={connSettings.mqtt_enabled}
                  onChange={e => handleConnChange('mqtt_enabled', e.target.checked)}
                />
                Enable MQTT
              </label>
            </div>
            <div className="admin-v2-settings-row">
              <div className="admin-v2-settings-field">
                <label>Broker</label>
                <input
                  type="text"
                  value={connSettings.mqtt_broker}
                  onChange={e => handleConnChange('mqtt_broker', e.target.value)}
                  placeholder="localhost"
                  disabled={!connSettings.mqtt_enabled}
                />
              </div>
              <div className="admin-v2-settings-field">
                <label>Port</label>
                <input
                  type="number"
                  value={connSettings.mqtt_port}
                  onChange={e => handleConnChange('mqtt_port', parseInt(e.target.value, 10))}
                  disabled={!connSettings.mqtt_enabled}
                />
              </div>
            </div>
            <div className="admin-v2-settings-row">
              <div className="admin-v2-settings-field">
                <label>Username</label>
                <input
                  type="text"
                  value={connSettings.mqtt_username}
                  onChange={e => handleConnChange('mqtt_username', e.target.value)}
                  disabled={!connSettings.mqtt_enabled}
                />
              </div>
              <div className="admin-v2-settings-field">
                <label>Password</label>
                <input
                  type="password"
                  value={connSettings.mqtt_password}
                  onChange={e => handleConnChange('mqtt_password', e.target.value)}
                  disabled={!connSettings.mqtt_enabled}
                />
              </div>
            </div>
            <div className="admin-v2-settings-field">
              <label>Client ID</label>
              <input
                type="text"
                value={connSettings.mqtt_client_id}
                onChange={e => handleConnChange('mqtt_client_id', e.target.value)}
                placeholder="sensor_monitor"
                disabled={!connSettings.mqtt_enabled}
              />
            </div>
            <div className="admin-v2-settings-field">
              <label>Base topic</label>
              <input
                type="text"
                value={connSettings.mqtt_base_topic}
                onChange={e => handleConnChange('mqtt_base_topic', e.target.value)}
                placeholder="shh"
                disabled={!connSettings.mqtt_enabled}
              />
            </div>
            <div className="admin-v2-settings-actions">
              <button
                type="button"
                className="admin-v2-btn admin-v2-btn-secondary"
                onClick={testConnection}
                disabled={!connSettings.mqtt_enabled || testingConn}
              >
                {testingConn ? 'Testing…' : 'Test connection'}
              </button>
              <button
                type="button"
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={saveConnection}
                disabled={savingConn}
              >
                {savingConn ? 'Saving…' : 'Save connection'}
              </button>
            </div>
          </div>
        </section>

        <section className="admin-v2-settings-section">
          <h2 className="admin-v2-settings-section-title">Per-patient MQTT</h2>
          <p className="admin-v2-settings-description">
            Enable MQTT for each patient and set section permissions: Get (device → HA), Set (HA → device), or Both.
          </p>
          <div className="admin-v2-settings-card">
            <div className="admin-v2-mqtt-table-wrap">
              <table className="admin-v2-mqtt-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Enable</th>
                    {MQTT_SECTIONS.map(s => (
                      <th key={s.id} title={s.label}>
                        {s.label}
                      </th>
                    ))}
                    <th>Save</th>
                  </tr>
                </thead>
                <tbody>
                  {patientsConfig.map(row => (
                    <tr key={row.patient_id}>
                      <td>{row.patient_name || `Patient ${row.patient_id}`}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!row.enabled}
                          onChange={e => setPatientEnabled(row.patient_id, e.target.checked)}
                        />
                      </td>
                      {MQTT_SECTIONS.map(section => (
                        <td key={section.id}>
                          <select
                            value={(row.sections || {})[section.id] || 'off'}
                            onChange={e =>
                              updatePatientSection(row.patient_id, section.id, e.target.value)
                            }
                          >
                            {PERM_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="admin-v2-btn admin-v2-btn-primary admin-v2-btn-sm"
                          onClick={() => savePatientConfig(row.patient_id)}
                          disabled={savingPatientId === row.patient_id}
                        >
                          {savingPatientId === row.patient_id ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {patientsConfig.length === 0 && (
              <p className="admin-v2-muted">No patients. Add patients in Configuration → Patients.</p>
            )}
          </div>
        </section>

        <section className="admin-v2-settings-section">
          <h2 className="admin-v2-settings-section-title">Home Assistant discovery</h2>
          <div className="admin-v2-settings-card">
            <p className="admin-v2-settings-description">
              Send discovery for all enabled patients so Home Assistant creates one entity per patient
              (combined vitals: SpO₂, BPM, alarm, etc.).
            </p>
            <button
              type="button"
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={sendDiscoveryAll}
              disabled={sendingDiscovery || !connSettings.mqtt_enabled}
            >
              {sendingDiscovery ? 'Sending…' : 'Send discovery for all enabled patients'}
            </button>
          </div>
        </section>
      </div>
    </AdminV2Layout>
  );
}
