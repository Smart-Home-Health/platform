import React, { useState, useEffect } from 'react';
import config from '../../config';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import './AdminV2.css';

export default function AdminV2ProfileMqtt() {
  const { selectedPatient } = useAdminPatient();
  const [mqttConfig, setMqttConfig] = useState(null);
  const [connSettings, setConnSettings] = useState({ mqtt_base_topic: 'shh' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingDiscovery, setSendingDiscovery] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [topicOverrides, setTopicOverrides] = useState({ state_topic: '', set_topic: '' });

  const patientId = selectedPatient?.id;

  useEffect(() => {
    if (patientId) load();
    else setMqttConfig(null);
  }, [patientId]);

  const load = async () => {
    if (!patientId) return;
    setLoading(true);
    setError('');
    try {
      const [integrationsRes, mqttSettingsRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/integrations/patient/${patientId}?include_disabled=true`, {
          credentials: 'include',
        }),
        fetch(`${config.apiUrl}/api/mqtt/settings`, { credentials: 'include' }),
      ]);
      if (integrationsRes.ok) {
        const list = await integrationsRes.json();
        const mqtt = list.find(i => i.integration_slug === 'mqtt');
        setMqttConfig(mqtt || null);
        if (mqtt?.settings?.topic_overrides) {
          setTopicOverrides(prev => ({ ...prev, ...mqtt.settings.topic_overrides }));
        } else {
          setTopicOverrides({ state_topic: '', set_topic: '' });
        }
      }
      if (mqttSettingsRes.ok) {
        const d = await mqttSettingsRes.json();
        setConnSettings({
          mqtt_base_topic: d.mqtt_base_topic || 'shh',
          mqtt_test_mode: d.mqtt_test_mode === true || d.mqtt_test_mode === 'true',
        });
      }
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const saveTopicOverrides = async () => {
    if (!patientId || !mqttConfig) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const settings = {
        ...(mqttConfig.settings || {}),
        topic_overrides: topicOverrides,
      };
      const res = await fetch(
        `${config.apiUrl}/api/integrations/patient/${patientId}/${mqttConfig.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(settings),
        }
      );
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save');
      setSuccess('Topic settings saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const sendDiscovery = async () => {
    if (!patientId) return;
    setSendingDiscovery(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${config.apiUrl}/api/mqtt/send-discovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          test_mode: connSettings.mqtt_test_mode,
          patient_id: patientId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to send discovery');
      setSuccess('Discovery sent for this patient.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSendingDiscovery(false);
    }
  };

  const defaultStateTopic = connSettings.mqtt_base_topic
    ? `${connSettings.mqtt_base_topic}/patient/${patientId}/state`
    : '';
  const defaultSetTopic = connSettings.mqtt_base_topic
    ? `${connSettings.mqtt_base_topic}/patient/${patientId}/set`
    : '';

  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-content-inner">
          <p className="admin-v2-muted">Select a patient to configure MQTT.</p>
        </div>
      </AdminV2Layout>
    );
  }

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-content-inner">
          <p>Loading…</p>
        </div>
      </AdminV2Layout>
    );
  }

  if (!mqttConfig || !mqttConfig.is_enabled) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-content-inner">
          <h1 className="admin-v2-page-title">MQTT (Profile)</h1>
          <p className="admin-v2-muted">
            MQTT is not enabled for this patient. Enable it in Configuration → MQTT and set
            section permissions, then return here to configure topics and discovery.
          </p>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-content-inner">
        <h1 className="admin-v2-page-title">MQTT (Profile)</h1>
        <p className="admin-v2-settings-description">
          Configure MQTT topics for {selectedPatient.first_name} {selectedPatient.last_name}.
          Leave blank to use defaults. After saving, run discovery so Home Assistant sees this
          patient.
        </p>
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
          <h2 className="admin-v2-settings-section-title">Topic overrides</h2>
          <div className="admin-v2-settings-card">
            <div className="admin-v2-settings-field">
              <label>State topic (device → HA)</label>
              <input
                type="text"
                value={topicOverrides.state_topic}
                onChange={e =>
                  setTopicOverrides(prev => ({ ...prev, state_topic: e.target.value }))
                }
                placeholder={defaultStateTopic}
              />
              {defaultStateTopic && (
                <span className="admin-v2-settings-hint">Default: {defaultStateTopic}</span>
              )}
            </div>
            <div className="admin-v2-settings-field">
              <label>Set topic (HA → device)</label>
              <input
                type="text"
                value={topicOverrides.set_topic}
                onChange={e =>
                  setTopicOverrides(prev => ({ ...prev, set_topic: e.target.value }))
                }
                placeholder={defaultSetTopic}
              />
              {defaultSetTopic && (
                <span className="admin-v2-settings-hint">Default: {defaultSetTopic}</span>
              )}
            </div>
            <div className="admin-v2-settings-actions">
              <button
                type="button"
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={saveTopicOverrides}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save topic settings'}
              </button>
            </div>
          </div>
        </section>

        <section className="admin-v2-settings-section">
          <h2 className="admin-v2-settings-section-title">Home Assistant discovery</h2>
          <div className="admin-v2-settings-card">
            <p className="admin-v2-settings-description">
              Send discovery for this patient so Home Assistant creates one entity with combined
              vitals (SpO₂, BPM, alarm, etc.).
            </p>
            <button
              type="button"
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={sendDiscovery}
              disabled={sendingDiscovery}
            >
              {sendingDiscovery ? 'Sending…' : 'Run discovery for this patient'}
            </button>
          </div>
        </section>
      </div>
    </AdminV2Layout>
  );
}
