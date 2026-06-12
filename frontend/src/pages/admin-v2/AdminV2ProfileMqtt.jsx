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
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
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
        <div className="tw flex flex-col gap-6">
          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          {success && <Alert variant="success" role="status">{success}</Alert>}

          {/* Topic overrides */}
          <Card>
            <CardHeader><CardTitle>Topic overrides</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field
                label="State topic (device → HA)"
                hint={defaultStateTopic ? `Default: ${defaultStateTopic}` : undefined}
              >
                <Input
                  value={topicOverrides.state_topic}
                  onChange={e => setTopicOverrides(prev => ({ ...prev, state_topic: e.target.value }))}
                  placeholder={defaultStateTopic}
                />
              </Field>
              <Field
                label="Set topic (HA → device)"
                hint={defaultSetTopic ? `Default: ${defaultSetTopic}` : undefined}
              >
                <Input
                  value={topicOverrides.set_topic}
                  onChange={e => setTopicOverrides(prev => ({ ...prev, set_topic: e.target.value }))}
                  placeholder={defaultSetTopic}
                />
              </Field>
            </CardContent>
            <CardFooter>
              <Button onClick={saveTopicOverrides} disabled={saving}>
                {saving ? 'Saving…' : 'Save topic settings'}
              </Button>
            </CardFooter>
          </Card>

          {/* Home Assistant discovery */}
          <Card>
            <CardHeader><CardTitle>Home Assistant discovery</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
              <p className="text-sm text-muted-foreground">
                Send discovery for this patient so Home Assistant creates one entity with combined
                vitals (SpO₂, BPM, alarm, etc.).
              </p>
              <Button onClick={sendDiscovery} disabled={sendingDiscovery}>
                {sendingDiscovery ? 'Sending…' : 'Run discovery for this patient'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminV2Layout>
  );
}
