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
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import config from '../../config';
import AdminV2Layout from './AdminV2Layout';
import { WifiIcon, HomeIcon, PatientsIcon } from '../../components/Icons';
import { EmField } from '../../components/vc/EntityModal';
import { CfgSection, CfgGroup, CfgFields } from './settings/CfgSection';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

export default function AdminV2Mqtt() {
  const navigate = useNavigate();
  const [connSettings, setConnSettings] = useState({
    mqtt_enabled: false,
    mqtt_broker: '',
    mqtt_port: 1883,
    mqtt_username: '',
    mqtt_password: '',
    mqtt_client_id: 'sensor_monitor',
    mqtt_base_topic: 'shh',
  });
  const [loading, setLoading] = useState(true);
  const [savingConn, setSavingConn] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [sendingDiscovery, setSendingDiscovery] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/mqtt/settings`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setConnSettings(prev => ({
          ...prev,
          mqtt_enabled: d.mqtt_enabled === true || d.mqtt_enabled === 'true',
          mqtt_broker: d.mqtt_broker || '',
          mqtt_port: parseInt(d.mqtt_port, 10) || 1883,
          mqtt_username: d.mqtt_username || '',
          mqtt_password: d.mqtt_password || '',
          mqtt_client_id: d.mqtt_client_id || 'sensor_monitor',
          mqtt_base_topic: d.mqtt_base_topic || 'shh',
        }));
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

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

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
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save');
      flash('Connection settings saved.');
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
      if (res.ok) flash('Connection test succeeded.');
      else setError((await res.json()).detail || 'Connection test failed');
    } catch (e) {
      setError(e.message);
    } finally {
      setTestingConn(false);
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
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to send discovery');
      flash('Discovery sent for all enabled patients.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSendingDiscovery(false);
    }
  };

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page"><p className="cfg-loading">Loading MQTT configuration…</p></div>
      </AdminV2Layout>
    );
  }

  const mqttOff = !connSettings.mqtt_enabled;

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="cfg">
          {error && <p className="em-error" role="alert">{error}</p>}
          {success && <p className="em-success" role="status">{success}</p>}

          {/* Up to three sections in a row on a wide screen, stacked on mobile. */}
          <div className="cfg-cols three">
            <CfgSection
              icon={<WifiIcon size={16} />}
              title="Connection"
              actions={
                <>
                  <button type="button" className="em-cancel" onClick={testConnection}
                          disabled={mqttOff || testingConn}>
                    {testingConn ? 'Testing…' : 'Test'}
                  </button>
                  <button type="button" className="em-submit" onClick={saveConnection}
                          disabled={savingConn}>
                    {savingConn ? 'Saving…' : 'Save'}
                  </button>
                </>
              }
            >
              <CfgGroup>
                <label className="em-check-row">
                  <input
                    type="checkbox"
                    className="em-check"
                    checked={connSettings.mqtt_enabled}
                    onChange={(e) => handleConnChange('mqtt_enabled', e.target.checked)}
                  />
                  <span className="em-check-label">Enable MQTT</span>
                </label>
                {/* Paired up rather than one per row — the column is wide
                    enough for two once the layout reaches its 3-up stop. */}
                <CfgFields>
                <EmField label="Broker" htmlFor="mqtt-broker">
                  <input id="mqtt-broker" className="em-input" value={connSettings.mqtt_broker}
                         onChange={e => handleConnChange('mqtt_broker', e.target.value)}
                         placeholder="localhost" disabled={mqttOff} />
                </EmField>
                <EmField label="Port" htmlFor="mqtt-port">
                  <input id="mqtt-port" className="em-input" type="number" value={connSettings.mqtt_port}
                         onChange={e => handleConnChange('mqtt_port', parseInt(e.target.value, 10))}
                         disabled={mqttOff} />
                </EmField>
                <EmField label="Username" htmlFor="mqtt-username">
                  <input id="mqtt-username" className="em-input" value={connSettings.mqtt_username}
                         onChange={e => handleConnChange('mqtt_username', e.target.value)}
                         disabled={mqttOff} />
                </EmField>
                <EmField label="Password" htmlFor="mqtt-password">
                  <input id="mqtt-password" className="em-input" type="password"
                         value={connSettings.mqtt_password}
                         onChange={e => handleConnChange('mqtt_password', e.target.value)}
                         disabled={mqttOff} />
                </EmField>
                <EmField label="Client ID" htmlFor="mqtt-client-id">
                  <input id="mqtt-client-id" className="em-input" value={connSettings.mqtt_client_id}
                         onChange={e => handleConnChange('mqtt_client_id', e.target.value)}
                         placeholder="sensor_monitor" disabled={mqttOff} />
                </EmField>
                <EmField label="Base topic" htmlFor="mqtt-base-topic">
                  <input id="mqtt-base-topic" className="em-input" value={connSettings.mqtt_base_topic}
                         onChange={e => handleConnChange('mqtt_base_topic', e.target.value)}
                         placeholder="shh" disabled={mqttOff} />
                </EmField>
                </CfgFields>
              </CfgGroup>
            </CfgSection>

            <CfgSection
              icon={<HomeIcon size={16} />}
              title="Home Assistant discovery"
              actions={
                <button type="button" className="em-submit" onClick={sendDiscoveryAll}
                        disabled={sendingDiscovery || mqttOff}>
                  {sendingDiscovery ? 'Sending…' : 'Send discovery (all)'}
                </button>
              }
            >
              <CfgGroup>
                <p className="cfg-group-hint">
                  Send discovery for all enabled patients so Home Assistant creates one device per
                  patient (combined vitals).
                </p>
              </CfgGroup>
            </CfgSection>

            <CfgSection
              icon={<PatientsIcon size={16} />}
              title="Per-patient settings"
              actions={
                <button type="button" className="em-cancel"
                        onClick={() => navigate('/care/configuration/patients')}>
                  Go to Patients
                </button>
              }
            >
              <CfgGroup>
                <p className="cfg-group-hint">
                  Enable MQTT and set section permissions, topics, and discovery for each patient on
                  their settings page.
                </p>
              </CfgGroup>
            </CfgSection>
          </div>
        </div>
      </div>
    </AdminV2Layout>
  );
}
