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
import { useNavigate } from 'react-router-dom';
import config from '../../config';
import AdminV2Layout from './AdminV2Layout';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import './AdminV2.css';

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
        <div className="admin-v2-page"><div className="admin-v2-loading">Loading MQTT configuration…</div></div>
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

          {/* Compact cards, up to 3 in a row on desktop, stacked on mobile */}
          <div className="grid items-start gap-4 lg:grid-cols-3">
            {/* Connection */}
            <Card>
              <CardHeader><CardTitle>Connection</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <label className="flex w-fit cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={connSettings.mqtt_enabled}
                    onCheckedChange={(v) => handleConnChange('mqtt_enabled', v === true)}
                  />
                  <span className="text-sm text-foreground">Enable MQTT</span>
                </label>
                <Field label="Broker">
                  <Input value={connSettings.mqtt_broker} onChange={e => handleConnChange('mqtt_broker', e.target.value)} placeholder="localhost" disabled={mqttOff} />
                </Field>
                <Field label="Port">
                  <Input type="number" value={connSettings.mqtt_port} onChange={e => handleConnChange('mqtt_port', parseInt(e.target.value, 10))} disabled={mqttOff} />
                </Field>
                <Field label="Username">
                  <Input value={connSettings.mqtt_username} onChange={e => handleConnChange('mqtt_username', e.target.value)} disabled={mqttOff} />
                </Field>
                <Field label="Password">
                  <Input type="password" value={connSettings.mqtt_password} onChange={e => handleConnChange('mqtt_password', e.target.value)} disabled={mqttOff} />
                </Field>
                <Field label="Client ID">
                  <Input value={connSettings.mqtt_client_id} onChange={e => handleConnChange('mqtt_client_id', e.target.value)} placeholder="sensor_monitor" disabled={mqttOff} />
                </Field>
                <Field label="Base topic">
                  <Input value={connSettings.mqtt_base_topic} onChange={e => handleConnChange('mqtt_base_topic', e.target.value)} placeholder="shh" disabled={mqttOff} />
                </Field>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={testConnection} disabled={mqttOff || testingConn}>
                  {testingConn ? 'Testing…' : 'Test'}
                </Button>
                <Button onClick={saveConnection} disabled={savingConn}>
                  {savingConn ? 'Saving…' : 'Save'}
                </Button>
              </CardFooter>
            </Card>

            {/* HA discovery */}
            <Card>
              <CardHeader><CardTitle>Home Assistant discovery</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Send discovery for all enabled patients so Home Assistant creates one device per
                  patient (combined vitals).
                </p>
              </CardContent>
              <CardFooter>
                <Button onClick={sendDiscoveryAll} disabled={sendingDiscovery || mqttOff}>
                  {sendingDiscovery ? 'Sending…' : 'Send discovery (all)'}
                </Button>
              </CardFooter>
            </Card>

            {/* Per-patient pointer */}
            <Card>
              <CardHeader><CardTitle>Per-patient settings</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Enable MQTT and set section permissions, topics, and discovery for each patient on
                  their settings page.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="secondary" onClick={() => navigate('/care/configuration/patients')}>
                  Go to Patients
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </AdminV2Layout>
  );
}
