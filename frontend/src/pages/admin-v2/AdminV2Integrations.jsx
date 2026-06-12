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
import React, { useState, useEffect, useRef } from 'react';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { API_BASE_URL, getApiBaseUrl } from '../../config';
import AdminV2Layout from './AdminV2Layout';
import {
  PlusIcon,
  RefreshIcon,
  XIcon,
  CheckIcon,
  ClockIcon,
  LinkIcon,
  TrashIcon
} from '../../components/Icons';
import { VentImportPanel } from './components';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import './AdminV2.css';

// Label/value row used inside the integration & reader cards.
function CardRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

export default function AdminV2Integrations() {
  const { selectedPatient, loadingPatients } = useAdminPatient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Available integrations from registry
  const [availableIntegrations, setAvailableIntegrations] = useState([]);

  // Patient's configured integrations
  const [patientIntegrations, setPatientIntegrations] = useState([]);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  // Vent imports panel — keyed on PatientIntegration id
  const [importsPanel, setImportsPanel] = useState({ open: false, integration: null });
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [addingIntegration, setAddingIntegration] = useState(false);

  // Settings for new integration
  const [newSettings, setNewSettings] = useState({});

  // Post-create state for local-auth integrations (Frigate camera picker).
  // 'form' = filling out config; 'select-camera' = picking from discovered list.
  const [addStep, setAddStep] = useState('form');
  const [discoveredCameras, setDiscoveredCameras] = useState([]);
  const [pickedCamera, setPickedCamera] = useState('');

  // Syncing state
  const [syncingId, setSyncingId] = useState(null);

  // Track in-flight delete
  const [deletingId, setDeletingId] = useState(null);

  // Reader state
  const [readers, setReaders] = useState([]);
  const [showReaderModal, setShowReaderModal] = useState(false);
  const [readerIp, setReaderIp] = useState('');
  const [readerPort, setReaderPort] = useState('8080');
  const [, setReaderName] = useState('');
  const [pairingReader, setPairingReader] = useState(null); // { id, name, status: 'waiting' | 'denied' | 'expired' }
  const [pairingLoading, setPairingLoading] = useState(false);
  const pairPollRef = useRef(null);

  // Get patient ID
  const patientId = selectedPatient?.id;

  useEffect(() => {
    if (patientId) {
      fetchIntegrations();
      fetchReaders();
    }
  }, [patientId]);

  const fetchReaders = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/readers`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setReaders(data.readers || []);
      }
    } catch (err) {
      console.error('Failed to fetch readers:', err);
    }
  };

  const fetchIntegrations = async () => {
    if (!patientId) return;

    setLoading(true);
    setError('');

    try {
      // Fetch available integrations
      const availableRes = await fetch(`${API_BASE_URL}/api/integrations`, {
        credentials: 'include'
      });
      if (!availableRes.ok) throw new Error('Failed to fetch available integrations');
      const available = await availableRes.json();
      setAvailableIntegrations(available);

      // Fetch patient's configured integrations
      const patientRes = await fetch(
        `${API_BASE_URL}/api/integrations/patient/${patientId}?include_disabled=true`,
        { credentials: 'include' }
      );
      if (!patientRes.ok) throw new Error('Failed to fetch patient integrations');
      const patient = await patientRes.json();
      setPatientIntegrations(patient);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Seed newSettings with any defaults declared on the integration's
  // config_schema so values reach the POST body even when the user never
  // touches a field. Without this, defaults render in the UI but the state
  // object stays empty.
  const pickIntegration = (integration) => {
    const defaults = {};
    const props = integration?.config_schema?.properties || {};
    for (const [key, schema] of Object.entries(props)) {
      if (schema?.default !== undefined) defaults[key] = schema.default;
    }
    setNewSettings(defaults);
    setSelectedIntegration(integration);
  };

  const handleAddIntegration = async () => {
    if (!selectedIntegration) return;

    setAddingIntegration(true);
    setError('');

    try {
      // Split the form values: anything in auth_fields goes to the /connect
      // payload (becomes credentials), everything else stays in settings.
      const authFields = selectedIntegration.auth_fields || [];
      const authData = {};
      const settingsOnly = {};
      for (const [k, v] of Object.entries(newSettings)) {
        if (authFields.includes(k)) authData[k] = v;
        else settingsOnly[k] = v;
      }

      const res = await fetch(`${API_BASE_URL}/api/integrations/patient/${patientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          integration_slug: selectedIntegration.slug,
          settings: settingsOnly,
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to add integration');
      }

      const newIntegration = await res.json();

      if (selectedIntegration.auth_type === 'oauth2') {
        await startOAuthFlow(newIntegration.id);
        return;
      }

      if (selectedIntegration.auth_type === 'local' || selectedIntegration.auth_type === 'api_key') {
        const connectRes = await fetch(
          `${API_BASE_URL}/api/integrations/patient/${patientId}/${newIntegration.id}/connect`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(authData),
          }
        );
        if (!connectRes.ok) {
          const data = await connectRes.json().catch(() => ({}));
          throw new Error(data.detail || 'Failed to connect');
        }

        // Frigate-specific: discover cameras then prompt to pick one.
        if (selectedIntegration.slug === 'frigate') {
          const discoverRes = await fetch(
            `${API_BASE_URL}/api/integrations/patient/${patientId}/${newIntegration.id}/discover`,
            { method: 'POST', credentials: 'include' }
          );
          if (!discoverRes.ok) {
            const data = await discoverRes.json().catch(() => ({}));
            throw new Error(data.detail || 'Failed to discover cameras');
          }
          const camsRes = await fetch(
            `${API_BASE_URL}/api/integrations/frigate/patient/${patientId}/cameras`,
            { credentials: 'include' }
          );
          const cams = camsRes.ok ? await camsRes.json() : [];
          setDiscoveredCameras(cams);
          setPickedCamera(cams[0]?.device_id || '');
          setAddStep('select-camera');
          return;
        }
      }

      setSuccess(`${selectedIntegration.name} integration added successfully`);
      await fetchIntegrations();
      closeAddModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingIntegration(false);
    }
  };

  const handlePickCamera = async () => {
    if (!pickedCamera) return;
    setAddingIntegration(true);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/integrations/frigate/patient/${patientId}/select`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ camera: pickedCamera }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to select camera');
      }
      setSuccess(`Frigate camera "${pickedCamera}" selected`);
      await fetchIntegrations();
      closeAddModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingIntegration(false);
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setSelectedIntegration(null);
    setNewSettings({});
    setAddStep('form');
    setDiscoveredCameras([]);
    setPickedCamera('');
  };

  const startOAuthFlow = async (integrationId) => {
    const redirectUrl = `${window.location.origin}/care/integrations`;
    const res = await fetch(
      `${API_BASE_URL}/api/integrations/patient/${patientId}/${integrationId}/oauth/start?redirect_url=${encodeURIComponent(redirectUrl)}`,
      { credentials: 'include' }
    );

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || 'Failed to start OAuth flow');
    }

    const data = await res.json();
    window.location.href = data.authorization_url;
  };

  const handleSync = async (integration) => {
    setError('');
    setSuccess('');
    setSyncingId(integration.id);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/integrations/patient/${patientId}/${integration.id}/sync`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Sync failed');
      }

      const result = await res.json();
      if (result.success) {
        setSuccess(`Synced ${result.readings_count} readings from ${integration.integration_name}`);
      } else {
        setError(result.error_message || 'Sync failed');
      }

      await fetchIntegrations();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncingId(null);
    }
  };

  const handleToggle = async (integration, enabled) => {
    try {
      if (enabled) {
        const res = await fetch(
          `${API_BASE_URL}/api/integrations/patient/${patientId}/${integration.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(integration.settings || {})
          }
        );
        if (!res.ok) throw new Error('Failed to update integration');
      } else {
        const res = await fetch(
          `${API_BASE_URL}/api/integrations/patient/${patientId}/${integration.id}`,
          {
            method: 'DELETE',
            credentials: 'include'
          }
        );
        if (!res.ok) throw new Error('Failed to disable integration');
      }

      await fetchIntegrations();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (integration) => {
    setDeletingId(integration.id);
    setError('');

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/integrations/patient/${patientId}/${integration.id}/permanent`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Delete failed (${res.status})`);
      }
      setSuccess(`${integration.integration_name} deleted`);
      await fetchIntegrations();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // --- Reader Functions ---

  const stopPairPolling = () => {
    if (pairPollRef.current) {
      clearInterval(pairPollRef.current);
      pairPollRef.current = null;
    }
  };

  // Clean up the status poll if the page unmounts mid-pairing
  useEffect(() => stopPairPolling, []);

  const resetReaderModal = () => {
    stopPairPolling();
    setShowReaderModal(false);
    setPairingReader(null);
    setReaderIp('');
    setReaderPort('8080');
    setReaderName('');
  };

  const PAIR_POLL_MS = 2000;
  const PAIR_POLL_TIMEOUT_MS = 150000;

  const startPairPolling = (readerId, readerName) => {
    stopPairPolling();
    const startedAt = Date.now();
    pairPollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > PAIR_POLL_TIMEOUT_MS) {
        stopPairPolling();
        setPairingReader({ id: readerId, name: readerName, status: 'expired' });
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/readers/${readerId}/pair/status`, {
          credentials: 'include'
        });
        if (!res.ok) return; // transient — keep polling until timeout
        const data = await res.json();
        if (data.status === 'paired') {
          stopPairPolling();
          setSuccess('Reader paired successfully!');
          resetReaderModal();
          await fetchReaders();
        } else if (data.status === 'denied' || data.status === 'expired') {
          stopPairPolling();
          setPairingReader({ id: readerId, name: readerName, status: data.status });
        }
        // 'pending' → keep waiting
      } catch {
        // network hiccup — keep polling until timeout
      }
    }, PAIR_POLL_MS);
  };

  const handleInitiatePairing = async () => {
    if (!readerIp.trim()) {
      setError('Please enter the reader IP address');
      return;
    }

    setPairingLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/readers/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ip_address: readerIp.trim(),
          port: parseInt(readerPort, 10) || 8080,
          patient_id: patientId,
          host_url: getApiBaseUrl()
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to initiate pairing');
      }

      const data = await res.json();
      setPairingReader({
        id: data.reader_id,
        name: data.reader_name,
        status: 'waiting'
      });
      startPairPolling(data.reader_id, data.reader_name);
    } catch (err) {
      setError(err.message);
    } finally {
      setPairingLoading(false);
    }
  };

  const handleUnpairReader = async (readerId) => {
    if (!window.confirm('Are you sure you want to unpair this reader?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/readers/${readerId}/unpair`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to unpair reader');
      }

      setSuccess('Reader unpaired');
      await fetchReaders();
    } catch (err) {
      setError(err.message);
    }
  };

  const getAuthTypeLabel = (authType) => {
    switch (authType) {
      case 'oauth2': return 'OAuth 2.0';
      case 'api_key': return 'API Key';
      case 'local': return 'Local';
      case 'device_pairing': return 'Device Pairing';
      case 'none': return 'No Auth';
      default: return authType;
    }
  };

  const getStatusBadge = (integration) => {
    if (!integration.is_enabled) return <Badge variant="muted">Disabled</Badge>;
    if (integration.last_sync_status === 'failed') return <Badge variant="danger">Error</Badge>;
    if (integration.last_sync_at) return <Badge variant="success">Connected</Badge>;
    if (integration.auth_type === 'none') return <Badge variant="success">Active</Badge>;
    return <Badge variant="warning">Pending Setup</Badge>;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  // Check URL params for OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setSuccess('Integration connected successfully!');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('error')) {
      setError(`OAuth error: ${params.get('error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // SHH Pulse Oximeter integration definition
  const shhPulseOxIntegration = {
    slug: 'shh_pulse_ox',
    name: 'SHH Pulse Oximeter',
    description: 'Connect SHH Reader devices to stream SpO2, heart rate, and perfusion data from pulse oximeters over your local network.',
    auth_type: 'device_pairing',
    supported_vitals: ['spo2', 'bpm', 'perfusion']
  };

  // Filter out "manual" — the app natively supports manual vitals entry
  const externalIntegrations = availableIntegrations.filter(i => i.slug !== 'manual');

  // Get integrations not yet configured for this patient
  const unconfiguredIntegrations = externalIntegrations.filter(
    avail => !patientIntegrations.some(pi => pi.integration_slug === avail.slug)
  );

  // Add SHH Pulse Oximeter to available integrations list
  const allAvailableIntegrations = [shhPulseOxIntegration, ...externalIntegrations];

  // Check if any readers are configured for this patient
  const patientReaders = readers.filter(r => r.patient_id === patientId || !r.patient_id);
  const hasConfiguredReaders = patientReaders.some(r => r.is_paired);

  // Stats - include readers in counts
  const stats = {
    total: patientIntegrations.length + patientReaders.filter(r => r.is_paired).length,
    connected: patientIntegrations.filter(i => i.is_enabled && i.last_sync_at).length + patientReaders.filter(r => r.is_paired && r.connected).length,
    pending: patientIntegrations.filter(i => i.is_enabled && !i.last_sync_at).length + patientReaders.filter(r => r.is_paired && !r.connected).length,
    available: allAvailableIntegrations.length
  };

  // Loading state
  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-empty-state">
          <LinkIcon size={48} />
          <h3>Select a Patient</h3>
          <p className="admin-v2-text-muted">Please select a patient to manage integrations.</p>
        </div>
      </AdminV2Layout>
    );
  }

  const configSchemaProps = selectedIntegration?.config_schema?.properties;

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {/* Alerts */}
        {(error || success) && (
          <div className="tw mb-4 flex flex-col gap-3">
            {error && (
              <Alert variant="destructive" className="flex items-center justify-between gap-3">
                <span>{error}</span>
                <button type="button" className="shrink-0 opacity-70 hover:opacity-100" onClick={() => setError('')}>
                  <XIcon size={16} />
                </button>
              </Alert>
            )}
            {success && (
              <Alert variant="success" className="flex items-center justify-between gap-3">
                <span>{success}</span>
                <button type="button" className="shrink-0 opacity-70 hover:opacity-100" onClick={() => setSuccess('')}>
                  <XIcon size={16} />
                </button>
              </Alert>
            )}
          </div>
        )}

        {/* Stats Row */}
        <div className="admin-v2-stats-row">
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon" style={{ background: 'rgba(88, 166, 255, 0.15)' }}>
              <LinkIcon size={20} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{stats.total}</h4>
              <p>Configured</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon" style={{ background: 'rgba(63, 185, 80, 0.15)' }}>
              <CheckIcon size={20} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{stats.connected}</h4>
              <p>Connected</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon" style={{ background: 'rgba(210, 153, 34, 0.15)' }}>
              <ClockIcon size={20} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{stats.pending}</h4>
              <p>Pending</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon" style={{ background: 'rgba(163, 113, 247, 0.15)' }}>
              <PlusIcon size={20} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{stats.available}</h4>
              <p>Available</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="admin-v2-loading">Loading integrations...</div>
        ) : (
          <div className="tw mt-4 flex flex-col gap-6">
            {/* Configured Integrations */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">
                  Connected Integrations ({patientIntegrations.length})
                </h3>
                {unconfiguredIntegrations.length > 0 && (
                  <Button onClick={() => setShowAddModal(true)}>
                    <PlusIcon size={16} /> Add Integration
                  </Button>
                )}
              </div>

              {patientIntegrations.length === 0 && !hasConfiguredReaders ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
                  <LinkIcon size={48} />
                  <h3 className="text-base font-semibold text-foreground">No Integrations Configured</h3>
                  <p className="text-sm">Connect your first integration to start syncing health data.</p>
                  <Button onClick={() => setShowAddModal(true)}>
                    <PlusIcon size={16} /> Add Your First Integration
                  </Button>
                </div>
              ) : patientIntegrations.length === 0 ? null : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {patientIntegrations.map(integration => (
                    <Card key={integration.id} className={cn(!integration.is_enabled && "opacity-60")}>
                      <CardHeader className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm">{integration.integration_name}</CardTitle>
                          {getStatusBadge(integration)}
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-1.5 py-3 text-sm">
                        {integration.last_sync_error && (
                          <div className="text-xs text-[#ff7b72]">{integration.last_sync_error}</div>
                        )}
                        <CardRow label="Last Sync" value={formatDate(integration.last_sync_at)} />
                        <CardRow label="Syncs" value={integration.sync_count || 0} />
                        <CardRow label="Type" value={integration.integration_slug} />
                      </CardContent>
                      <CardFooter className="flex-wrap justify-start gap-2 py-3">
                        {integration.is_enabled && integration.auth_type === 'oauth2' && !integration.last_sync_at && (
                          <Button size="sm" variant="ghost" onClick={() => startOAuthFlow(integration.id)} title="Connect OAuth">
                            <LinkIcon size={14} /> Connect
                          </Button>
                        )}
                        {integration.is_enabled && integration.integration_slug !== 'ventilator' && (
                          <Button size="sm" variant="ghost" onClick={() => handleSync(integration)} disabled={syncingId === integration.id} title="Sync Now">
                            <RefreshIcon size={14} className={syncingId === integration.id ? 'spinning' : undefined} />
                            {syncingId === integration.id ? 'Syncing...' : 'Sync'}
                          </Button>
                        )}
                        {integration.is_enabled && integration.integration_slug === 'ventilator' && (
                          <Button size="sm" variant="ghost" onClick={() => setImportsPanel({ open: true, integration })} title="Upload + view log exports">
                            Logs
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleToggle(integration, !integration.is_enabled)}>
                          {integration.is_enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto text-[#ff7b72] hover:text-[#ff7b72]"
                          onClick={() => handleDelete(integration)}
                          disabled={deletingId === integration.id}
                          title="Delete integration"
                        >
                          <TrashIcon size={14} />
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Connected Readers */}
            {patientReaders.filter(r => r.is_paired).length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {patientReaders.filter(r => r.is_paired).map(reader => (
                  <Card key={`reader-${reader.id}`}>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{reader.name}</CardTitle>
                        {reader.connected ? (
                          <Badge variant="success">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: '#3fb950' }} />
                            Online
                          </Badge>
                        ) : (
                          <Badge variant="muted">Offline</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1.5 py-3 text-sm">
                      <CardRow label="Type" value="SHH Pulse Oximeter" />
                      <CardRow label="IP" value={<code className="text-xs text-muted-foreground">{reader.ip_address}</code>} />
                      <CardRow label="Last Seen" value={formatDate(reader.last_seen)} />
                    </CardContent>
                    <CardFooter className="justify-start py-3">
                      <Button size="sm" variant="ghost" className="text-[#ff7b72] hover:text-[#ff7b72]" onClick={() => handleUnpairReader(reader.id)}>
                        Disconnect
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}

            {/* Available Integrations */}
            <section className="flex flex-col gap-3">
              <h3 className="text-base font-semibold text-foreground">
                Available Integrations ({allAvailableIntegrations.length})
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {allAvailableIntegrations.map(integration => {
                  const isSHHDevice = integration.slug === 'shh_pulse_ox';
                  const isConfigured = isSHHDevice
                    ? hasConfiguredReaders
                    : patientIntegrations.some(pi => pi.integration_slug === integration.slug);
                  return (
                    <Card key={integration.slug} className={cn(isConfigured && "opacity-60")}>
                      <CardHeader className="gap-2 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm">{integration.name}</CardTitle>
                          {isConfigured && (
                            <Badge variant="success">
                              {isSHHDevice ? `${patientReaders.filter(r => r.is_paired).length} Connected` : 'Configured'}
                            </Badge>
                          )}
                        </div>
                        <Badge variant="info" className="w-fit">{getAuthTypeLabel(integration.auth_type)}</Badge>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-1.5 py-3 text-sm">
                        <p className="text-muted-foreground">{integration.description}</p>
                        <CardRow
                          label="Supports"
                          value={
                            <>
                              {integration.supported_vitals?.slice(0, 4).join(', ')}
                              {integration.supported_vitals?.length > 4 && '...'}
                            </>
                          }
                        />
                      </CardContent>
                      <CardFooter className="justify-start py-3">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (isSHHDevice) {
                              setShowReaderModal(true);
                            } else {
                              pickIntegration(integration);
                              setShowAddModal(true);
                            }
                          }}
                        >
                          <PlusIcon size={14} /> {isSHHDevice ? 'Add Device' : 'Add'}
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* Add Reader Dialog */}
        <Dialog open={showReaderModal} onOpenChange={(o) => { if (!o) resetReaderModal(); }}>
          <DialogContent className="sm:max-w-[520px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{pairingReader ? 'Approve on Reader' : 'Add SHH Reader'}</DialogTitle>
            </DialogHeader>

            {!pairingReader ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Enter the IP address and port of your SHH Reader device. Make sure the reader is powered on and connected to your network.
                </p>
                <div className="flex gap-3">
                  <Field label="Reader IP Address" required className="flex-1">
                    <Input value={readerIp} onChange={(e) => setReaderIp(e.target.value)} placeholder="e.g., 192.168.1.100" autoFocus />
                  </Field>
                  <Field label="Port" className="w-24">
                    <Input type="number" value={readerPort} onChange={(e) => setReaderPort(e.target.value)} placeholder="8080" />
                  </Field>
                </div>
              </div>
            ) : pairingReader.status === 'waiting' ? (
              <div className="flex flex-col gap-4">
                <Alert variant="default">
                  <strong>Waiting for approval</strong>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Approve this hub on <strong className="text-foreground">{pairingReader.name}</strong> — open the reader's screen at <code className="text-foreground">{readerIp}</code> and click <strong className="text-foreground">Allow</strong>.
                  </p>
                </Alert>
                <div className="flex items-center justify-center gap-3 rounded-lg bg-ring/10 py-6">
                  <span className="inline-flex animate-spin text-[#58a6ff]"><RefreshIcon size={20} /></span>
                  <span className="text-sm text-muted-foreground">Waiting for the reader…</span>
                </div>
              </div>
            ) : (
              <Alert variant="destructive">
                <strong>{pairingReader.status === 'denied' ? 'Pairing denied' : 'Pairing request expired'}</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pairingReader.status === 'denied'
                    ? 'The request was denied on the reader.'
                    : 'The reader did not respond in time.'} You can try again.
                </p>
              </Alert>
            )}

            <DialogFooter>
              {pairingReader && pairingReader.status !== 'waiting' && (
                <Button variant="ghost" onClick={() => { stopPairPolling(); setPairingReader(null); }}>Try Again</Button>
              )}
              <Button variant="secondary" onClick={resetReaderModal}>Cancel</Button>
              {!pairingReader && (
                <Button onClick={handleInitiatePairing} disabled={pairingLoading || !readerIp.trim()}>
                  {pairingLoading ? 'Connecting...' : 'Connect Reader'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Integration Dialog */}
        <Dialog open={showAddModal} onOpenChange={(o) => { if (!o) closeAddModal(); }}>
          <DialogContent className="sm:max-w-[560px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{addStep === 'select-camera' ? 'Select Camera' : 'Add Integration'}</DialogTitle>
            </DialogHeader>

            {addStep === 'select-camera' ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Choose which camera covers this patient. You can change this later from the integration settings.
                </p>
                {discoveredCameras.length === 0 ? (
                  <Alert variant="default">No cameras were discovered on this Frigate instance.</Alert>
                ) : (
                  <Field label="Camera">
                    <Select value={pickedCamera || undefined} onValueChange={(v) => setPickedCamera(v)}>
                      <SelectTrigger><SelectValue placeholder="Select a camera" /></SelectTrigger>
                      <SelectContent>
                        {discoveredCameras.map(cam => (
                          <SelectItem key={cam.device_id} value={cam.device_id}>
                            {cam.device_name || cam.device_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
            ) : !selectedIntegration ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary px-3 py-3 text-left transition-colors hover:bg-accent"
                  onClick={() => { setShowAddModal(false); setShowReaderModal(true); }}
                >
                  <div>
                    <strong className="text-sm text-foreground">{shhPulseOxIntegration.name}</strong>
                    <p className="text-xs text-muted-foreground">{shhPulseOxIntegration.description}</p>
                  </div>
                  <Badge variant="secondary">{getAuthTypeLabel(shhPulseOxIntegration.auth_type)}</Badge>
                </button>
                {unconfiguredIntegrations.map(integration => (
                  <button
                    key={integration.slug}
                    type="button"
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary px-3 py-3 text-left transition-colors hover:bg-accent"
                    onClick={() => pickIntegration(integration)}
                  >
                    <div>
                      <strong className="text-sm text-foreground">{integration.name}</strong>
                      <p className="text-xs text-muted-foreground">{integration.description}</p>
                    </div>
                    <Badge variant="secondary">{getAuthTypeLabel(integration.auth_type)}</Badge>
                  </button>
                ))}
                {unconfiguredIntegrations.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    All available integrations have been configured.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{selectedIntegration.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedIntegration.description}</p>
                </div>

                {selectedIntegration.auth_type === 'oauth2' && (
                  <Alert variant="default">
                    You will be redirected to {selectedIntegration.name} to authorize access.
                  </Alert>
                )}

                {configSchemaProps && Object.keys(configSchemaProps).length > 0 && (
                  <div className="flex flex-col gap-4">
                    <h4 className="text-sm font-semibold text-foreground">Settings</h4>
                    {Object.entries(configSchemaProps)
                      // Hide fields whose value is chosen in a later step
                      // (Frigate camera is picked from the discovered list)
                      .filter(([key]) => !(selectedIntegration.slug === 'frigate' && key === 'camera'))
                      .map(([key, schema]) => (
                        <Field key={key} label={schema.title || key}>
                          {schema.type === 'boolean' ? (
                            <label className="flex cursor-pointer items-center gap-2">
                              <Checkbox
                                checked={newSettings[key] ?? schema.default ?? false}
                                onCheckedChange={(v) => setNewSettings({ ...newSettings, [key]: v === true })}
                              />
                              <span className="text-sm text-muted-foreground">{schema.description}</span>
                            </label>
                          ) : Array.isArray(schema.enum) ? (
                            <Select
                              value={(newSettings[key] ?? schema.default) != null ? String(newSettings[key] ?? schema.default) : undefined}
                              onValueChange={(v) => setNewSettings({ ...newSettings, [key]: v })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {schema.enum.map((opt, idx) => (
                                  <SelectItem key={opt} value={String(opt)}>
                                    {(schema.enumLabels && schema.enumLabels[idx]) || opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={newSettings[key] ?? schema.default ?? ''}
                              onChange={(e) => setNewSettings({ ...newSettings, [key]: e.target.value })}
                              placeholder={schema.description}
                            />
                          )}
                        </Field>
                      ))}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              {selectedIntegration && addStep === 'form' && (
                <Button variant="ghost" onClick={() => { setSelectedIntegration(null); setNewSettings({}); }}>Back</Button>
              )}
              <Button variant="secondary" onClick={closeAddModal}>Cancel</Button>
              {addStep === 'select-camera' ? (
                <Button onClick={handlePickCamera} disabled={addingIntegration || !pickedCamera}>
                  {addingIntegration ? 'Saving...' : 'Use this camera'}
                </Button>
              ) : selectedIntegration && (
                <Button onClick={handleAddIntegration} disabled={addingIntegration}>
                  {addingIntegration ? 'Adding...' : (
                    selectedIntegration.auth_type === 'oauth2'
                      ? `Connect to ${selectedIntegration.name}`
                      : 'Add Integration'
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <VentImportPanel
          open={importsPanel.open}
          onClose={() => setImportsPanel({ open: false, integration: null })}
          patientId={selectedPatient?.id}
          integrationId={importsPanel.integration?.id}
          integrationName={importsPanel.integration?.integration_name || 'Ventilator'}
        />
      </div>
    </AdminV2Layout>
  );
}
