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
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import config from '../../config';
import AdminV2Layout from './AdminV2Layout';
import PatientFormFields from '../../components/PatientFormFields';
import { MQTT_SECTIONS, permOptionsForSection, permSelectClass } from './mqttConstants';
import { ChevronLeftIcon } from '../../components/Icons';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import './AdminV2.css';

// Modules a patient might not use — placeholder only; not wired to a backend yet.
const PATIENT_MODULES = [
  { id: 'medications', label: 'Medications' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'care_tasks', label: 'Care Tasks' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'symptoms', label: 'Symptoms' },
];

const emptyForm = {
  first_name: '', last_name: '', date_of_birth: '',
  medical_record_number: '', notes: '', is_active: true,
};

export default function AdminV2PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // MQTT
  const [mqttGlobalOn, setMqttGlobalOn] = useState(false);
  const [mqttBaseTopic, setMqttBaseTopic] = useState('shh');
  const [mqttEnabled, setMqttEnabled] = useState(false);
  const [sections, setSections] = useState({});
  const [mqttIntegration, setMqttIntegration] = useState(null); // { id, settings }
  const [topicOverrides, setTopicOverrides] = useState({ state_topic: '', set_topic: '' });
  const [savingMqtt, setSavingMqtt] = useState(false);
  const [savingTopics, setSavingTopics] = useState(false);
  const [runningDiscovery, setRunningDiscovery] = useState(false);

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pRes, sRes, mpRes, intRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/patients/${patientId}`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/mqtt/settings`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/mqtt/patients`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/integrations/patient/${patientId}?include_disabled=true`, { credentials: 'include' }),
      ]);

      if (!pRes.ok) throw new Error('Failed to load patient');
      const p = await pRes.json();
      setPatient(p);
      setFormData({
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        date_of_birth: p.date_of_birth ? p.date_of_birth.split('T')[0] : '',
        medical_record_number: p.medical_record_number || '',
        notes: p.notes || '',
        is_active: p.is_active,
      });

      if (sRes.ok) {
        const s = await sRes.json();
        setMqttGlobalOn(s.mqtt_enabled === true || s.mqtt_enabled === 'true');
        setMqttBaseTopic(s.mqtt_base_topic || 'shh');
      }
      if (mpRes.ok) {
        const list = await mpRes.json();
        const row = list.find(r => String(r.patient_id) === String(patientId));
        setMqttEnabled(!!row?.enabled);
        setSections(row?.sections || {});
      }
      if (intRes.ok) {
        const list = await intRes.json();
        const mqtt = list.find(i => i.integration_slug === 'mqtt');
        setMqttIntegration(mqtt ? { id: mqtt.id, settings: mqtt.settings || {} } : null);
        setTopicOverrides({
          state_topic: mqtt?.settings?.topic_overrides?.state_topic || '',
          set_topic: mqtt?.settings?.topic_overrides?.set_topic || '',
        });
      }
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const saveDetails = async () => {
    setSavingDetails(true);
    setError('');
    try {
      const payload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        is_active: formData.is_active,
        notes: formData.notes || null,
      };
      if (formData.date_of_birth) payload.date_of_birth = formData.date_of_birth;
      if (formData.medical_record_number) payload.medical_record_number = formData.medical_record_number;
      const res = await fetch(`${config.apiUrl}/api/patients/${patientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save patient');
      setPatient(await res.json());
      flash('Patient details saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingDetails(false);
    }
  };

  const toggleActive = async () => {
    setError('');
    try {
      const res = patient?.is_active
        ? await fetch(`${config.apiUrl}/api/patients/${patientId}`, { method: 'DELETE', credentials: 'include' })
        : await fetch(`${config.apiUrl}/api/patients/${patientId}/activate`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to update status');
      await load();
      flash(patient?.is_active ? 'Patient deactivated.' : 'Patient activated.');
    } catch (e) {
      setError(e.message);
    }
  };

  const saveMqtt = async () => {
    setSavingMqtt(true);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/mqtt/patients/${patientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: mqttEnabled, sections }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save MQTT settings');
      await load();  // refresh integration id (created on first enable) for topic overrides
      flash('MQTT settings saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingMqtt(false);
    }
  };

  const saveTopics = async () => {
    if (!mqttIntegration) return;
    setSavingTopics(true);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/integrations/patient/${patientId}/${mqttIntegration.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...(mqttIntegration.settings || {}), topic_overrides: topicOverrides }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save topics');
      flash('Topic overrides saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingTopics(false);
    }
  };

  const runDiscovery = async () => {
    setRunningDiscovery(true);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/mqtt/send-discovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ patient_id: Number(patientId) }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to run discovery');
      flash('Discovery sent for this patient.');
    } catch (e) {
      setError(e.message);
    } finally {
      setRunningDiscovery(false);
    }
  };

  const defaultStateTopic = `${mqttBaseTopic}/patient/${patientId}/state`;
  const defaultSetTopic = `${mqttBaseTopic}/patient/${patientId}/set`;

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page"><div className="admin-v2-loading">Loading patient…</div></div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw space-y-6">
          <div className="flex items-center justify-between gap-3">
            <button
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => navigate('/care/configuration/patients')}
            >
              <ChevronLeftIcon size={16} /> Patients
            </button>
            {patient && (
              <Badge variant={patient.is_active ? 'success' : 'secondary'}>
                {patient.is_active ? 'Active' : 'Inactive'}
              </Badge>
            )}
          </div>

          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          {success && <Alert variant="success" role="status">{success}</Alert>}

          {/* Basic details */}
          <Card>
            <CardHeader>
              <CardTitle>
                {patient ? `${patient.first_name} ${patient.last_name}` : 'Patient'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">Basic details</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PatientFormFields formData={formData} setFormData={setFormData} idPrefix="pd" />
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3">
              <Button onClick={saveDetails} disabled={savingDetails}>
                {savingDetails ? 'Saving…' : 'Save details'}
              </Button>
              <Button
                variant={patient?.is_active ? 'destructive' : 'secondary'}
                onClick={toggleActive}
              >
                {patient?.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </CardFooter>
          </Card>

          {/* MQTT — only when global MQTT is enabled */}
          {mqttGlobalOn && (
            <Card>
              <CardHeader>
                <CardTitle>MQTT / Home Assistant</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Publish this patient's data to Home Assistant. Per-section permission: Get
                  (device → HA), Set (HA → device), or Both.
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <label className="flex w-fit cursor-pointer items-center gap-2">
                  <Checkbox checked={mqttEnabled} onCheckedChange={(v) => setMqttEnabled(v === true)} />
                  <span className="text-sm text-foreground">Enable MQTT for this patient</span>
                </label>

                {mqttEnabled && (
                  <div className="flex flex-col gap-2 border-t border-border pt-4">
                    <h4 className="text-sm font-semibold text-foreground">Sections</h4>
                    {/* Vertical list — one row per section (mobile-friendly) */}
                    <div className="divide-y divide-border/60 rounded-lg border border-border">
                      {MQTT_SECTIONS.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-sm text-foreground">{s.label}</span>
                          <select
                            className={`${permSelectClass} max-w-[8rem]`}
                            value={sections[s.id] || 'off'}
                            onChange={(e) => setSections((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          >
                            {permOptionsForSection(s.id).map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button onClick={saveMqtt} disabled={savingMqtt}>
                  {savingMqtt ? 'Saving…' : 'Save MQTT settings'}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Topic overrides + discovery — only when enabled and the integration exists */}
          {mqttGlobalOn && mqttEnabled && mqttIntegration && (
            <Card>
              <CardHeader>
                <CardTitle>Topics & discovery</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Field label="State topic (device → HA)" hint={`Default: ${defaultStateTopic}`}>
                  <Input
                    value={topicOverrides.state_topic}
                    onChange={(e) => setTopicOverrides((p) => ({ ...p, state_topic: e.target.value }))}
                    placeholder={defaultStateTopic}
                  />
                </Field>
                <Field label="Set topic (HA → device)" hint={`Default: ${defaultSetTopic}`}>
                  <Input
                    value={topicOverrides.set_topic}
                    onChange={(e) => setTopicOverrides((p) => ({ ...p, set_topic: e.target.value }))}
                    placeholder={defaultSetTopic}
                  />
                </Field>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={saveTopics} disabled={savingTopics}>
                  {savingTopics ? 'Saving…' : 'Save topics'}
                </Button>
                <Button onClick={runDiscovery} disabled={runningDiscovery}>
                  {runningDiscovery ? 'Sending…' : 'Run discovery'}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Modules (placeholder, per-patient) */}
          <Card>
            <CardHeader>
              <CardTitle>Modules</CardTitle>
              <p className="text-sm text-muted-foreground">
                Turn features on or off for this patient. Coming soon — not yet active.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PATIENT_MODULES.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 opacity-60">
                    <Checkbox checked disabled />
                    <span className="text-sm text-foreground">{m.label}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminV2Layout>
  );
}
