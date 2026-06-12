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
import AdminV2Layout from './AdminV2Layout';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
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

// Compact native <select> used in the dense per-patient permission grid.
const cellSelectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:border-ring focus:outline-none';

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

  const mqttOff = !connSettings.mqtt_enabled;

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw space-y-6">
          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          {success && <Alert variant="success" role="status">{success}</Alert>}

          {/* Connection */}
          <Card>
            <CardHeader><CardTitle>Connection</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="flex w-fit cursor-pointer items-center gap-2">
                <Checkbox
                  checked={connSettings.mqtt_enabled}
                  onCheckedChange={(v) => handleConnChange('mqtt_enabled', v === true)}
                />
                <span className="text-sm text-foreground">Enable MQTT</span>
              </label>

              <FormRow>
                <Field label="Broker">
                  <Input
                    value={connSettings.mqtt_broker}
                    onChange={e => handleConnChange('mqtt_broker', e.target.value)}
                    placeholder="localhost"
                    disabled={mqttOff}
                  />
                </Field>
                <Field label="Port">
                  <Input
                    type="number"
                    value={connSettings.mqtt_port}
                    onChange={e => handleConnChange('mqtt_port', parseInt(e.target.value, 10))}
                    disabled={mqttOff}
                  />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Username">
                  <Input
                    value={connSettings.mqtt_username}
                    onChange={e => handleConnChange('mqtt_username', e.target.value)}
                    disabled={mqttOff}
                  />
                </Field>
                <Field label="Password">
                  <Input
                    type="password"
                    value={connSettings.mqtt_password}
                    onChange={e => handleConnChange('mqtt_password', e.target.value)}
                    disabled={mqttOff}
                  />
                </Field>
              </FormRow>

              <Field label="Client ID">
                <Input
                  value={connSettings.mqtt_client_id}
                  onChange={e => handleConnChange('mqtt_client_id', e.target.value)}
                  placeholder="sensor_monitor"
                  disabled={mqttOff}
                />
              </Field>

              <Field label="Base topic">
                <Input
                  value={connSettings.mqtt_base_topic}
                  onChange={e => handleConnChange('mqtt_base_topic', e.target.value)}
                  placeholder="shh"
                  disabled={mqttOff}
                />
              </Field>
            </CardContent>
            <CardFooter>
              <Button variant="secondary" onClick={testConnection} disabled={mqttOff || testingConn}>
                {testingConn ? 'Testing…' : 'Test connection'}
              </Button>
              <Button onClick={saveConnection} disabled={savingConn}>
                {savingConn ? 'Saving…' : 'Save connection'}
              </Button>
            </CardFooter>
          </Card>

          {/* Per-patient MQTT */}
          <Card>
            <CardHeader>
              <CardTitle>Per-patient MQTT</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enable MQTT for each patient and set section permissions: Get (device → HA), Set (HA → device), or Both.
              </p>
            </CardHeader>
            <CardContent>
              {patientsConfig.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No patients. Add patients in Configuration → Patients.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="p-2 font-medium">Patient</th>
                        <th className="p-2 font-medium">Enable</th>
                        {MQTT_SECTIONS.map(s => (
                          <th key={s.id} className="whitespace-nowrap p-2 font-medium">{s.label}</th>
                        ))}
                        <th className="p-2 font-medium">Save</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientsConfig.map(row => (
                        <tr key={row.patient_id} className="border-b border-border/60">
                          <td className="whitespace-nowrap p-2 text-foreground">
                            {row.patient_name || `Patient ${row.patient_id}`}
                          </td>
                          <td className="p-2">
                            <Checkbox
                              checked={!!row.enabled}
                              onCheckedChange={(v) => setPatientEnabled(row.patient_id, v === true)}
                            />
                          </td>
                          {MQTT_SECTIONS.map(section => (
                            <td key={section.id} className="p-2">
                              <select
                                className={cellSelectClass}
                                value={(row.sections || {})[section.id] || 'off'}
                                onChange={e => updatePatientSection(row.patient_id, section.id, e.target.value)}
                              >
                                {PERM_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </td>
                          ))}
                          <td className="p-2">
                            <Button
                              size="sm"
                              onClick={() => savePatientConfig(row.patient_id)}
                              disabled={savingPatientId === row.patient_id}
                            >
                              {savingPatientId === row.patient_id ? 'Saving…' : 'Save'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Home Assistant discovery */}
          <Card>
            <CardHeader><CardTitle>Home Assistant discovery</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
              <p className="text-sm text-muted-foreground">
                Send discovery for all enabled patients so Home Assistant creates one entity per patient
                (combined vitals: SpO₂, BPM, alarm, etc.).
              </p>
              <Button onClick={sendDiscoveryAll} disabled={sendingDiscovery || mqttOff}>
                {sendingDiscovery ? 'Sending…' : 'Send discovery for all enabled patients'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminV2Layout>
  );
}
