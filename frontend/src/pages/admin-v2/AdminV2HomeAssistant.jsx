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
import { useCallback, useEffect, useRef, useState } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config, { apiFetch } from '../../config';
import EntityModal, { EmField, EmSelect } from '../../components/vc/EntityModal';
import { CfgSection, CfgGroup, CfgFields, CfgBadge } from './settings/CfgSection';
import { HomeIcon, PlusIcon, RefreshIcon, TrashIcon, EditIcon } from '../../components/Icons';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

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
  // Location suggestions: the user's HA areas (rooms) + locations already
  // seen in the data, so room names stay consistent across both platforms.
  const [locationOptions, setLocationOptions] = useState([]);

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
    Promise.all([
      apiFetch(`${API()}/areas`).then((res) => (res.ok ? res.json() : [])),
      apiFetch(`${config.apiUrl}/api/environment/locations`)
        .then((res) => (res.ok ? res.json() : [])),
    ]).then(([areas, locations]) => {
      const seen = locations.filter((l) => l.scope !== 'outdoor' && l.location)
                            .map((l) => l.location);
      setLocationOptions([...new Set([...areas, ...seen])]);
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
      // Piggyback the entity's HA area as the location so rooms stay
      // consistent between HA and SHH; still editable below.
      location: f.location || entity.area || '',
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
          <p className="cfg-loading">Loading Home Assistant settings…</p>
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
        <div className="cfg">
          {error && <p className="em-error" role="alert">{error}</p>}
          {notice && <p className="em-success" role="status">{notice}</p>}

          <CfgSection
            icon={<HomeIcon size={16} />}
            title="Home Assistant"
            subtitle="Bring readings from Home Assistant into Smart Home Health — pulse oximeters, blood pressure cuffs, room sensors, anything HA can see."
            aside={
              <>
                <CfgBadge tone={connected ? 'ok' : undefined}>
                  {connected ? 'Connected' : 'Not connected'}
                </CfgBadge>
                <button type="button" className="cfg-ghost" onClick={loadAll}>
                  <RefreshIcon size={14} /> Refresh
                </button>
              </>
            }
            actions={
              <>
                <button type="button" className="em-cancel" onClick={testConnection}
                        disabled={busy === 'test'}>
                  {busy === 'test' ? 'Testing…' : 'Test connection'}
                </button>
                <button type="button" className="em-submit" onClick={saveConfig}
                        disabled={busy === 'save'}>
                  {busy === 'save' ? 'Saving…' : 'Save'}
                </button>
              </>
            }
          >
            <CfgGroup>
              {supervisor ? (
                <p className="cfg-note">
                  Running as the Home Assistant add-on — the connection is automatic,
                  no URL or token needed.
                </p>
              ) : (
                <CfgFields narrow>
                  <EmField label="Home Assistant URL" htmlFor="ha-base-url">
                    <input id="ha-base-url" className="em-input"
                           placeholder="http://homeassistant.local:8123"
                           value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                  </EmField>
                  <EmField
                    label="Long-lived access token"
                    htmlFor="ha-token"
                    hint="Create one in HA under your profile, Security tab. An administrator user's token is recommended (needed for room names)."
                  >
                    <input id="ha-token" className="em-input" type="password"
                           placeholder={cfg?.token_set ? 'Saved — enter to replace' : 'Paste token'}
                           value={token} onChange={(e) => setToken(e.target.value)} />
                  </EmField>
                </CfgFields>
              )}

              <label className="em-check-row" htmlFor="ha-enabled">
                <input id="ha-enabled" type="checkbox" className="em-check"
                       checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span className="em-check-label">Ingest mapped entities live</span>
              </label>

              {status?.last_error && !connected && (
                <p className="em-error" role="alert">Last connection error: {status.last_error}</p>
              )}
            </CfgGroup>
          </CfgSection>

          <CfgSection
            title="Entity mappings"
            subtitle="Each mapped entity is recorded as a patient vital or an environmental reading whenever its value changes in HA."
            aside={
              <button type="button" className="cfg-ghost" onClick={() => openDialog()}>
                <PlusIcon size={14} /> Add mapping
              </button>
            }
          >
            <CfgGroup>
              {mappings.length === 0 ? (
                <p className="cfg-empty">
                  No entities mapped yet. Add a mapping to start ingesting data.
                </p>
              ) : (
                /* One row markup: stacked label/value pairs on a phone,
                   columns at >=900px. */
                <div
                  className="cfg-table"
                  style={{ '--cfg-trow-cols': 'minmax(10rem, 1.6fr) minmax(0, 1.4fr) 8rem 7rem 3rem 4.5rem' }}
                >
                  <div className="cfg-thead" aria-hidden="true">
                    <span>Entity</span><span>Target</span><span>Last seen</span>
                    <span>Last value</span><span>On</span><span />
                  </div>
                  {mappings.map((m) => (
                    <div className="cfg-trow" key={m.id}>
                      <span className="cfg-tcell name">
                        <span className="cfg-pick-main">
                          <span className="cfg-pick-name">{m.friendly_name || m.entity_id}</span>
                          <span className="cfg-pick-id">{m.entity_id}</span>
                        </span>
                      </span>
                      <span className="cfg-tcell" data-label="Target">
                        <span className="cfg-tval">{describeTarget(m)}</span>
                      </span>
                      <span className="cfg-tcell" data-label="Last seen">
                        <span className="cfg-tval">{formatWhen(m.last_seen_at)}</span>
                      </span>
                      <span className="cfg-tcell" data-label="Last value">
                        <span className="cfg-tval strong">
                          {m.last_value != null
                            ? `${m.last_value}${m.source_unit ? ` ${m.source_unit}` : ''}`
                            : '—'}
                          {m.last_error && <span className="cfg-rowerr">{m.last_error}</span>}
                        </span>
                      </span>
                      <span className="cfg-tcell" data-label="On">
                        <input
                          type="checkbox"
                          className="em-check"
                          checked={m.enabled}
                          aria-label={`Toggle ${m.entity_id}`}
                          onChange={() => toggleMapping(m)}
                        />
                      </span>
                      <span className="cfg-tcell" data-label="Actions">
                        <span className="cfg-rowactions">
                          <button type="button" className="cfg-iconbtn"
                                  aria-label={`Edit ${m.entity_id}`} onClick={() => openDialog(m)}>
                            <EditIcon size={14} />
                          </button>
                          <button type="button" className="cfg-iconbtn danger"
                                  aria-label={`Delete ${m.entity_id}`} onClick={() => deleteMapping(m)}>
                            <TrashIcon size={14} />
                          </button>
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CfgGroup>
          </CfgSection>
        </div>

        <EntityModal
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={editingId ? 'Edit mapping' : 'Add mapping'}
          wide
        >
          <div className="em-form">
            {!editingId && (
              <EmField label="Home Assistant entity" htmlFor="ha-entity-search">
                {form.entity_id ? (
                  <div className="cfg-chosen">
                    <span className="cfg-pick-main">
                      <span className="cfg-pick-name">{form.friendly_name || form.entity_id}</span>
                      <span className="cfg-pick-id">
                        {form.entity_id}
                        {form.source_unit ? ` · ${form.source_unit}` : ''}
                      </span>
                    </span>
                    <button type="button" className="cfg-ghost"
                            onClick={() => setField('entity_id', '')}>
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input id="ha-entity-search" className="em-input" placeholder="Search entities…"
                           value={entitySearch}
                           onChange={(e) => setEntitySearch(e.target.value)} />
                    <div className="cfg-picklist scroll">
                      {entities === null && <p className="cfg-empty">Loading entities…</p>}
                      {entities !== null && filteredEntities.length === 0 && (
                        <p className="cfg-empty">No matching entities.</p>
                      )}
                      {filteredEntities.slice(0, 50).map((e) => (
                        <button key={e.entity_id} type="button" className="cfg-pick"
                                onClick={() => pickEntity(e)} disabled={e.mapped}>
                          <span className="cfg-pick-main">
                            <span className="cfg-pick-name">{e.friendly_name || e.entity_id}</span>
                            <span className="cfg-pick-id">{e.entity_id}</span>
                          </span>
                          <span className="cfg-pick-meta">
                            {e.mapped ? 'Mapped' : [e.state, e.unit_of_measurement].filter(Boolean).join(' ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </EmField>
            )}

            <EmField label="Record as" htmlFor="ha-target-kind">
              <EmSelect id="ha-target-kind" value={form.target_kind}
                        onChange={(e) => setField('target_kind', e.target.value)}>
                <option value="vital">Patient vital</option>
                <option value="environment">Environmental reading</option>
              </EmSelect>
            </EmField>

            {form.target_kind === 'vital' ? (
              <CfgFields>
                <EmField label="Patient" htmlFor="ha-patient">
                  <EmSelect id="ha-patient" value={form.patient_id}
                            onChange={(e) => setField('patient_id', e.target.value)}>
                    <option value="">Choose…</option>
                    {patients.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {[p.first_name, p.last_name].filter(Boolean).join(' ') || `Patient ${p.id}`}
                      </option>
                    ))}
                  </EmSelect>
                </EmField>
                <EmField label="Vital type" htmlFor="ha-vital-type">
                  <EmSelect id="ha-vital-type" value={form.vital_type}
                            onChange={(e) => { setField('vital_type', e.target.value); setField('vital_group', ''); }}>
                    <option value="">Choose…</option>
                    {vitalTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </EmSelect>
                </EmField>
                {selectedVitalType?.groups?.length > 0 && (
                  <EmField label="Component" htmlFor="ha-vital-group">
                    <EmSelect id="ha-vital-group" value={form.vital_group}
                              onChange={(e) => setField('vital_group', e.target.value)}>
                      <option value="">Choose…</option>
                      {selectedVitalType.groups.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </EmSelect>
                  </EmField>
                )}
              </CfgFields>
            ) : (
              <CfgFields>
                <EmField label="Metric" htmlFor="ha-metric">
                  <EmSelect id="ha-metric" value={form.metric}
                            onChange={(e) => setField('metric', e.target.value)}>
                    <option value="">Choose…</option>
                    {metrics.map((m) => (
                      <option key={m.name} value={m.name}>{m.label} ({m.unit})</option>
                    ))}
                  </EmSelect>
                </EmField>
                <EmField label="Scope" htmlFor="ha-scope">
                  <EmSelect id="ha-scope" value={form.scope}
                            onChange={(e) => setField('scope', e.target.value)}>
                    <option value="room">Room</option>
                    <option value="indoor">Indoor (whole home)</option>
                    <option value="outdoor">Outdoor</option>
                  </EmSelect>
                </EmField>
                <EmField
                  label="Location"
                  htmlFor="ha-map-location"
                  hint="Suggestions come from your Home Assistant areas and rooms already in use here."
                >
                  <input id="ha-map-location" className="em-input" placeholder="e.g. bedroom"
                         list="ha-location-suggestions"
                         value={form.location}
                         onChange={(e) => setField('location', e.target.value)} />
                  <datalist id="ha-location-suggestions">
                    {locationOptions.map((loc) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </EmField>
              </CfgFields>
            )}

            <CfgFields narrow>
              <EmField
                label="Minimum seconds between recordings"
                htmlFor="ha-map-interval"
                hint="0 records every change; e.g. 300 keeps a chatty sensor to one reading per 5 minutes."
              >
                <input id="ha-map-interval" className="em-input" type="number" min="0" max="86400"
                       value={form.min_interval_seconds}
                       onChange={(e) => setField('min_interval_seconds', e.target.value)} />
              </EmField>
              {form.source_unit && (
                <EmField label="Detected unit">
                  <p className="cfg-note">{form.source_unit}</p>
                </EmField>
              )}
            </CfgFields>

            <div className="em-footer">
              <button type="button" className="em-cancel" onClick={() => setDialogOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="em-submit"
                onClick={saveMapping}
                disabled={busy === 'mapping' || !form.entity_id
                  || (form.target_kind === 'vital' && (!form.patient_id || !form.vital_type))
                  || (form.target_kind === 'environment' && !form.metric)}
              >
                {busy === 'mapping' ? 'Saving…' : (editingId ? 'Save changes' : 'Add mapping')}
              </button>
            </div>
          </div>
        </EntityModal>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2HomeAssistant;
