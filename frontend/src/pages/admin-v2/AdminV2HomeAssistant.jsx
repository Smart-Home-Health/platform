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
// Configuration → Home Assistant: inbound entity ingestion. Pick HA entities
// and map each to a patient vital or an environmental observation. Running as
// the HA add-on needs no connection config (Supervisor proxy); standalone
// installs supply a base URL + long-lived access token.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config, { apiFetch } from '../../config';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { HomeIcon, PlusIcon, RefreshIcon, TrashIcon, EditIcon } from '../../components/Icons';
import './AdminV2.css';

const API = () => `${config.apiUrl}/api/integrations/home_assistant`;

const formatWhen = (iso) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return isNaN(d) ? 'Never' : d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const describeTarget = (m) => {
  if (m.target_kind === 'vital') {
    return `Vital: ${m.vital_type}${m.vital_group ? ` (${m.vital_group})` : ''}`;
  }
  const where = m.location ? `${m.scope} / ${m.location}` : m.scope;
  return `Environment: ${m.metric} (${where})`;
};

const readError = async (res) => {
  const body = await res.json().catch(() => ({}));
  return typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`;
};

const EMPTY_FORM = {
  entity_id: '', friendly_name: '', device_class: '', source_unit: '',
  target_kind: 'vital', patient_id: '', vital_type: '', vital_group: '',
  metric: '', scope: 'room', location: '', min_interval_seconds: 0,
};

const AdminV2HomeAssistant = () => {
  const [cfg, setCfg] = useState(null);
  const [status, setStatus] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);

  // Connection form
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');       // '' = keep saved token

  // Mapping dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = create
  const [form, setForm] = useState(EMPTY_FORM);
  const [entities, setEntities] = useState(null);
  const [entitySearch, setEntitySearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [vitalTypes, setVitalTypes] = useState([]);
  const [metrics, setMetrics] = useState([]);

  const statusTimer = useRef(null);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [cfgRes, statusRes, mappingsRes] = await Promise.all([
        apiFetch(`${API()}/config`),
        apiFetch(`${API()}/status`),
        apiFetch(`${API()}/mappings`),
      ]);
      if (!cfgRes.ok) throw new Error(await readError(cfgRes));
      const cfgBody = await cfgRes.json();
      setCfg(cfgBody);
      setEnabled(Boolean(cfgBody.enabled));
      setBaseUrl(cfgBody.base_url || '');
      if (statusRes.ok) setStatus(await statusRes.json());
      if (mappingsRes.ok) setMappings(await mappingsRes.json());
    } catch (err) {
      setError(`Failed to load Home Assistant settings: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const [statusRes, mappingsRes] = await Promise.all([
        apiFetch(`${API()}/status`),
        apiFetch(`${API()}/mappings`),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (mappingsRes.ok) setMappings(await mappingsRes.json());
    } catch {
      /* transient; the visible status just goes stale */
    }
  }, []);

  useEffect(() => {
    loadAll();
    statusTimer.current = setInterval(refreshStatus, 10000);
    return () => clearInterval(statusTimer.current);
  }, [loadAll, refreshStatus]);

  const saveConfig = async () => {
    setError(null);
    setNotice(null);
    setBusy('save');
    try {
      const body = { enabled, mode: 'auto', base_url: baseUrl || null };
      if (token) body.token = token;
      const res = await apiFetch(`${API()}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      setCfg(await res.json());
      setToken('');
      setNotice('Saved.');
    } catch (err) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const testConnection = async () => {
    setError(null);
    setNotice(null);
    setBusy('test');
    try {
      const body = { enabled, mode: 'auto', base_url: baseUrl || null };
      if (token) body.token = token;
      const res = await apiFetch(`${API()}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      const result = await res.json();
      if (result.ok) {
        setNotice(`Connected to ${result.location_name || 'Home Assistant'} (version ${result.version || '?'}).`);
      } else {
        setError(`Connection failed: ${result.error || 'unknown error'}`);
      }
    } catch (err) {
      setError(`Test failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  // ---- Mapping dialog -------------------------------------------------

  const openDialog = async (mapping = null) => {
    setError(null);
    setNotice(null);
    setEditingId(mapping ? mapping.id : null);
    setForm(mapping ? {
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.entries(mapping).map(
        ([k, v]) => [k, v == null ? EMPTY_FORM[k] ?? '' : v])),
      patient_id: mapping.patient_id ? String(mapping.patient_id) : '',
    } : EMPTY_FORM);
    setEntitySearch('');
    setDialogOpen(true);

    // Pickers load in the background; the dialog stays usable meanwhile.
    if (!mapping) {
      setEntities(null);
      apiFetch(`${API()}/entities`).then(async (res) => {
        if (res.ok) setEntities(await res.json());
        else setError(`Couldn't list Home Assistant entities: ${await readError(res)}`);
      }).catch((err) => setError(`Couldn't list Home Assistant entities: ${err.message}`));
    }
    // No trailing slash: the collection route is declared @router.get("") and
    // the slash variant 307s (see the trailing-slash pitfall in CLAUDE.md).
    apiFetch(`${config.apiUrl}/api/patients`).then(async (res) => {
      if (res.ok) setPatients(await res.json());
    }).catch(() => {});
    apiFetch(`${config.apiUrl}/api/environment/metrics`).then(async (res) => {
      if (res.ok) setMetrics((await res.json()).filter((m) => !m.derived));
    }).catch(() => {});
  };

  // Vital-type options depend on the selected patient (custom vitals).
  useEffect(() => {
    if (!dialogOpen) return;
    const qs = form.patient_id ? `?patient_id=${form.patient_id}` : '';
    apiFetch(`${API()}/vital-types${qs}`).then(async (res) => {
      if (res.ok) setVitalTypes(await res.json());
    }).catch(() => {});
  }, [dialogOpen, form.patient_id]);

  const pickEntity = (entity) => {
    setForm((f) => ({
      ...f,
      entity_id: entity.entity_id,
      friendly_name: entity.friendly_name || '',
      device_class: entity.device_class || '',
      source_unit: entity.unit_of_measurement || '',
    }));
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const selectedVitalType = vitalTypes.find((t) => t.value === form.vital_type);

  const saveMapping = async () => {
    setError(null);
    setBusy('mapping');
    try {
      const body = {
        entity_id: form.entity_id,
        friendly_name: form.friendly_name || null,
        device_class: form.device_class || null,
        source_unit: form.source_unit || null,
        target_kind: form.target_kind,
        min_interval_seconds: Number(form.min_interval_seconds) || 0,
      };
      if (form.target_kind === 'vital') {
        body.patient_id = form.patient_id ? Number(form.patient_id) : null;
        body.vital_type = form.vital_type || null;
        body.vital_group = form.vital_group || null;
      } else {
        body.metric = form.metric || null;
        body.scope = form.scope || null;
        body.location = form.location || null;
      }
      const res = await apiFetch(
        editingId ? `${API()}/mappings/${editingId}` : `${API()}/mappings`,
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(await readError(res));
      setDialogOpen(false);
      setNotice(editingId ? 'Mapping updated.' : 'Mapping added.');
      refreshStatus();
    } catch (err) {
      setError(`Mapping save failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const toggleMapping = async (mapping) => {
    const res = await apiFetch(`${API()}/mappings/${mapping.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !mapping.enabled }),
    });
    if (res.ok) refreshStatus();
    else setError(`Update failed: ${await readError(res)}`);
  };

  const deleteMapping = async (mapping) => {
    if (!window.confirm(`Stop ingesting ${mapping.friendly_name || mapping.entity_id}?`)) return;
    const res = await apiFetch(`${API()}/mappings/${mapping.id}`, { method: 'DELETE' });
    if (res.ok) refreshStatus();
    else setError(`Delete failed: ${await readError(res)}`);
  };

  if (isLoading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="admin-v2-loading">Loading Home Assistant settings…</div>
        </div>
      </AdminV2Layout>
    );
  }

  const supervisor = Boolean(cfg?.supervisor_available);
  const connected = Boolean(status?.connected);
  const searchLower = entitySearch.trim().toLowerCase();
  const filteredEntities = (entities || []).filter((e) =>
    !searchLower
    || e.entity_id.toLowerCase().includes(searchLower)
    || (e.friendly_name || '').toLowerCase().includes(searchLower)
    || (e.device_class || '').toLowerCase().includes(searchLower));

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw space-y-6">
          {error && <Alert variant="destructive">{error}</Alert>}
          {notice && <Alert variant="success">{notice}</Alert>}

          {/* Connection */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground" aria-hidden><HomeIcon size={22} /></span>
                  <div className="flex flex-col gap-0.5">
                    <CardTitle>Home Assistant</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Bring readings from Home Assistant into Smart Home Health —
                      pulse oximeters, blood pressure cuffs, room sensors, anything HA can see.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={connected ? 'success' : 'muted'}>
                    {connected ? 'Connected' : 'Not connected'}
                  </Badge>
                  <Button variant="secondary" onClick={loadAll} className="gap-1.5">
                    <RefreshIcon size={16} /> Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {supervisor ? (
                  <Alert>
                    Running as the Home Assistant add-on — the connection is automatic,
                    no URL or token needed.
                  </Alert>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ha-base-url">Home Assistant URL</Label>
                      <Input id="ha-base-url" placeholder="http://homeassistant.local:8123"
                             value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ha-token">Long-lived access token</Label>
                      <Input id="ha-token" type="password"
                             placeholder={cfg?.token_set ? 'Saved — enter to replace' : 'Paste token'}
                             value={token} onChange={(e) => setToken(e.target.value)} />
                      <p className="text-xs text-muted-foreground">
                        Create one in HA under your profile, Security tab. An administrator
                        user's token is recommended (needed for room names).
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Checkbox id="ha-enabled" checked={enabled}
                            onCheckedChange={(v) => setEnabled(Boolean(v))} />
                  <Label htmlFor="ha-enabled">Ingest mapped entities live</Label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={saveConfig} disabled={busy === 'save'}>
                    {busy === 'save' ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant="secondary" onClick={testConnection} disabled={busy === 'test'}>
                    {busy === 'test' ? 'Testing…' : 'Test connection'}
                  </Button>
                </div>

                {status?.last_error && !connected && (
                  <Alert variant="destructive">Last connection error: {status.last_error}</Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Mappings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <CardTitle>Entity mappings</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Each mapped entity is recorded as a patient vital or an
                    environmental reading whenever its value changes in HA.
                  </p>
                </div>
                <Button onClick={() => openDialog()} className="gap-1.5 shrink-0">
                  <PlusIcon size={16} /> Add mapping
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {mappings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No entities mapped yet. Add a mapping to start ingesting data.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4">Entity</th>
                        <th className="py-2 pr-4">Target</th>
                        <th className="py-2 pr-4">Last seen</th>
                        <th className="py-2 pr-4">Last value</th>
                        <th className="py-2 pr-4">On</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {mappings.map((m) => (
                        <tr key={m.id}>
                          <td className="py-2 pr-4">
                            <div className="font-medium text-foreground">
                              {m.friendly_name || m.entity_id}
                            </div>
                            <div className="text-xs text-muted-foreground">{m.entity_id}</div>
                          </td>
                          <td className="py-2 pr-4">{describeTarget(m)}</td>
                          <td className="py-2 pr-4">{formatWhen(m.last_seen_at)}</td>
                          <td className="py-2 pr-4">
                            {m.last_value != null
                              ? `${m.last_value}${m.source_unit ? ` ${m.source_unit}` : ''}`
                              : '—'}
                            {m.last_error && (
                              <div className="text-xs text-destructive">{m.last_error}</div>
                            )}
                          </td>
                          <td className="py-2 pr-4">
                            <Checkbox checked={m.enabled}
                                      aria-label={`Toggle ${m.entity_id}`}
                                      onCheckedChange={() => toggleMapping(m)} />
                          </td>
                          <td className="py-2">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" aria-label={`Edit ${m.entity_id}`}
                                      onClick={() => openDialog(m)}>
                                <EditIcon size={16} />
                              </Button>
                              <Button variant="ghost" size="icon" aria-label={`Delete ${m.entity_id}`}
                                      onClick={() => deleteMapping(m)}>
                                <TrashIcon size={16} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add/edit mapping dialog */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit mapping' : 'Add mapping'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Entity picker (create only) */}
                {!editingId && (
                  <div className="space-y-2">
                    <Label htmlFor="ha-entity-search">Home Assistant entity</Label>
                    {form.entity_id ? (
                      <div className="flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-border p-3 text-sm">
                        {/* overflow-hidden (not just min-w-0): without it the
                            nowrap entity text sets the grid column's min-content
                            and widens the whole dialog past the phone viewport */}
                        <div className="min-w-0 overflow-hidden">
                          <div className="truncate font-medium">{form.friendly_name || form.entity_id}</div>
                          <div className="break-all text-xs text-muted-foreground">
                            {form.entity_id}
                            {form.source_unit ? ` · ${form.source_unit}` : ''}
                          </div>
                        </div>
                        <Button variant="secondary" className="shrink-0"
                                onClick={() => setField('entity_id', '')}>
                          Change
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Input id="ha-entity-search" placeholder="Search entities…"
                               value={entitySearch}
                               onChange={(e) => setEntitySearch(e.target.value)} />
                        <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                          {entities === null && (
                            <div className="p-3 text-sm text-muted-foreground">Loading entities…</div>
                          )}
                          {entities !== null && filteredEntities.length === 0 && (
                            <div className="p-3 text-sm text-muted-foreground">No matching entities.</div>
                          )}
                          {filteredEntities.slice(0, 50).map((e) => (
                            <button key={e.entity_id} type="button" onClick={() => pickEntity(e)}
                                    disabled={e.mapped}
                                    className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-secondary/60 disabled:opacity-50">
                              {/* overflow-hidden + truncate: long entity ids must
                                  never widen the dialog past the viewport on mobile */}
                              <span className="min-w-0 overflow-hidden">
                                <span className="block truncate font-medium">{e.friendly_name || e.entity_id}</span>
                                <span className="block truncate text-xs text-muted-foreground">{e.entity_id}</span>
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {e.mapped ? 'Mapped' : [e.state, e.unit_of_measurement].filter(Boolean).join(' ')}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Target */}
                <div className="space-y-2">
                  <Label>Record as</Label>
                  <Select value={form.target_kind} onValueChange={(v) => setField('target_kind', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vital">Patient vital</SelectItem>
                      <SelectItem value="environment">Environmental reading</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.target_kind === 'vital' ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Patient</Label>
                      <Select value={form.patient_id}
                              onValueChange={(v) => setField('patient_id', v)}>
                        <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {patients.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {[p.first_name, p.last_name].filter(Boolean).join(' ') || `Patient ${p.id}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Vital type</Label>
                      <Select value={form.vital_type}
                              onValueChange={(v) => { setField('vital_type', v); setField('vital_group', ''); }}>
                        <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {vitalTypes.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedVitalType?.groups?.length > 0 && (
                      <div className="space-y-2">
                        <Label>Component</Label>
                        <Select value={form.vital_group}
                                onValueChange={(v) => setField('vital_group', v)}>
                          <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                          <SelectContent>
                            {selectedVitalType.groups.map((g) => (
                              <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Metric</Label>
                      <Select value={form.metric} onValueChange={(v) => setField('metric', v)}>
                        <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {metrics.map((m) => (
                            <SelectItem key={m.name} value={m.name}>
                              {m.label} ({m.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Scope</Label>
                      <Select value={form.scope} onValueChange={(v) => setField('scope', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="room">Room</SelectItem>
                          <SelectItem value="indoor">Indoor (whole home)</SelectItem>
                          <SelectItem value="outdoor">Outdoor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ha-map-location">Location</Label>
                      <Input id="ha-map-location" placeholder="e.g. bedroom"
                             value={form.location}
                             onChange={(e) => setField('location', e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ha-map-interval">Minimum seconds between recordings</Label>
                    <Input id="ha-map-interval" type="number" min="0" max="86400"
                           value={form.min_interval_seconds}
                           onChange={(e) => setField('min_interval_seconds', e.target.value)} />
                    <p className="text-xs text-muted-foreground">
                      0 records every change; e.g. 300 keeps a chatty sensor to one reading per 5 minutes.
                    </p>
                  </div>
                  {form.source_unit && (
                    <div className="space-y-2">
                      <Label>Detected unit</Label>
                      <p className="pt-2 text-sm text-muted-foreground">{form.source_unit}</p>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveMapping}
                        disabled={busy === 'mapping' || !form.entity_id
                          || (form.target_kind === 'vital' && (!form.patient_id || !form.vital_type))
                          || (form.target_kind === 'environment' && !form.metric)}>
                  {busy === 'mapping' ? 'Saving…' : (editingId ? 'Save changes' : 'Add mapping')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2HomeAssistant;
