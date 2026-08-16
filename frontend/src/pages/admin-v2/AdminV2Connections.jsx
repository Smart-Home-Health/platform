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
import React, { useState, useEffect, useRef } from 'react';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, getApiBaseUrl, isIngress } from '../../config';
import AdminV2Layout from './AdminV2Layout';
import { timeAgo } from '../../utils/timezone';
import {
  PlusIcon,
  RefreshIcon,
  XIcon,
  LinkIcon,
  WifiIcon,
  ClockIcon,
  GlobeIcon,
  VitalsIcon,
  AlertIcon,
  FileTextIcon
} from '../../components/Icons';
import EntityCard from '../../components/vc/EntityCard';
import EntityModal, { EmField, EmRow, EmSelect } from '../../components/vc/EntityModal';
import { VentImportPanel } from './components';
import { Button } from '@/components/ui/button';
import './AdminV2.css';

export default function AdminV2Connections() {
  const { selectedPatient, loadingPatients } = useAdminPatient();
  const { user } = useAuth() || {};
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient change only
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

      setSuccess(`${selectedIntegration.name} added`);
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
    const redirectUrl = `${window.location.origin}/care/profile/connections`;
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
          // Headless readers can't dial an ingress URL (session-scoped token,
          // cookie-gated). Behind HA ingress, hand them the add-on's LAN port
          // on the same host instead (plain HTTP by design there).
          host_url: isIngress()
            ? `http://${window.location.hostname}:8000`
            : getApiBaseUrl()
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

  // Plain-English status wording — technical detail lives behind the error
  // line, not the tag.
  const getStatusTag = (integration) => {
    if (!integration.is_enabled) return { label: 'Paused', tone: 'idle' };
    if (integration.last_sync_status === 'failed') return { label: 'Needs attention', tone: 'due' };
    if (integration.last_sync_at) return { label: 'Working', tone: 'complete' };
    if (integration.auth_type === 'none') return { label: 'Working', tone: 'complete' };
    if (integration.auth_type === 'oauth2') return { label: 'Waiting for sign-in', tone: 'accent' };
    return { label: 'Finishing setup', tone: 'accent' };
  };

  const integrationMenu = (integration) => [
    {
      label: integration.is_enabled ? 'Pause' : 'Resume',
      onClick: () => handleToggle(integration, !integration.is_enabled),
    },
    {
      label: 'Delete',
      danger: true,
      onClick: () => { if (deletingId !== integration.id) handleDelete(integration); },
    },
  ];

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

  const pairedReaderCount = patientReaders.filter(r => r.is_paired).length;

  // Loading state
  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  // Profile is visible to every user, so gate this tab in-page (the API
  // endpoints enforce the real security).
  if (user && !user.is_system_admin) {
    return (
      <AdminV2Layout>
        <div style={{ padding: '2rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
          <h3 style={{ color: 'var(--foreground)' }}>Access Denied</h3>
          <p>Connections are only available to system administrators.</p>
        </div>
      </AdminV2Layout>
    );
  }

  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-empty-state">
          <LinkIcon size={48} />
          <h3>Select a Patient</h3>
          <p className="admin-v2-text-muted">Please select a patient to manage their connections.</p>
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
          <div className="ec-page-alerts">
            {error && (
              <div className="em-error em-alert-row">
                <span>{error}</span>
                <button type="button" className="em-dismiss" aria-label="Dismiss" onClick={() => setError('')}>
                  <XIcon size={16} />
                </button>
              </div>
            )}
            {success && (
              <div className="em-success em-alert-row">
                <span>{success}</span>
                <button type="button" className="em-dismiss" aria-label="Dismiss" onClick={() => setSuccess('')}>
                  <XIcon size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="admin-v2-loading">Loading connections...</div>
        ) : (
          <div className="tw flex flex-col gap-6">
            {/* Configured Integrations */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">
                  Connected ({patientIntegrations.length + pairedReaderCount})
                </h3>
                {unconfiguredIntegrations.length > 0 && (
                  <Button onClick={() => setShowAddModal(true)}>
                    <PlusIcon size={16} /> Add a connection
                  </Button>
                )}
              </div>

              {patientIntegrations.length === 0 && !hasConfiguredReaders ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
                  <LinkIcon size={48} />
                  <h3 className="text-base font-semibold text-foreground">Nothing connected yet</h3>
                  <p className="text-sm">Add a device or service to start collecting health data.</p>
                  <Button onClick={() => setShowAddModal(true)}>
                    <PlusIcon size={16} /> Add your first connection
                  </Button>
                </div>
              ) : patientIntegrations.length === 0 ? null : (
                <div className="ec-grid">
                  {patientIntegrations.map(integration => (
                    <EntityCard
                      key={integration.id}
                      icon={<LinkIcon size={22} />}
                      title={integration.integration_name}
                      tag={getStatusTag(integration)}
                      inactive={!integration.is_enabled}
                      details={[
                        {
                          icon: <ClockIcon size={18} />,
                          label: 'Last sync',
                          value: integration.last_sync_at
                            ? `Synced ${timeAgo(integration.last_sync_at)}`
                            : 'Not synced yet',
                        },
                        ...(integration.last_sync_status === 'failed' && integration.last_sync_error
                          ? [{
                              icon: <AlertIcon size={18} />,
                              label: 'Something went wrong',
                              value: integration.last_sync_error,
                            }]
                          : []),
                      ]}
                      quickActions={[
                        ...(integration.is_enabled && integration.auth_type === 'oauth2' && !integration.last_sync_at
                          ? [{
                              icon: <LinkIcon size={18} />,
                              label: 'Connect',
                              onClick: () => startOAuthFlow(integration.id),
                            }]
                          : []),
                        ...(integration.is_enabled && integration.integration_slug !== 'ventilator'
                          ? [{
                              icon: <RefreshIcon size={18} />,
                              label: syncingId === integration.id ? 'Syncing...' : 'Sync now',
                              onClick: () => { if (syncingId !== integration.id) handleSync(integration); },
                            }]
                          : []),
                        ...(integration.is_enabled && integration.integration_slug === 'ventilator'
                          ? [{
                              icon: <FileTextIcon size={18} />,
                              label: 'Upload + view log exports',
                              onClick: () => setImportsPanel({ open: true, integration }),
                            }]
                          : []),
                      ]}
                      menu={integrationMenu(integration)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Connected Readers */}
            {patientReaders.filter(r => r.is_paired).length > 0 && (
              <div className="ec-grid">
                {patientReaders.filter(r => r.is_paired).map(reader => (
                  <EntityCard
                    key={`reader-${reader.id}`}
                    icon={<WifiIcon size={22} />}
                    title={reader.name}
                    badges={['Pulse oximeter reader']}
                    tag={reader.connected
                      ? { label: 'Online', tone: 'complete' }
                      : { label: 'Offline', tone: 'idle' }}
                    details={[
                      {
                        icon: <ClockIcon size={18} />,
                        label: 'Last seen',
                        value: reader.last_seen ? timeAgo(reader.last_seen) : 'Never seen',
                      },
                      {
                        icon: <GlobeIcon size={18} />,
                        label: 'Address',
                        value: reader.ip_address,
                      },
                    ]}
                    menu={[
                      { label: 'Disconnect', danger: true, onClick: () => handleUnpairReader(reader.id) },
                    ]}
                  />
                ))}
              </div>
            )}

            {/* Available Integrations */}
            <section className="flex flex-col gap-3">
              <h3 className="text-base font-semibold text-foreground">
                Available to add ({allAvailableIntegrations.length})
              </h3>
              <div className="ec-grid">
                {allAvailableIntegrations.map(integration => {
                  const isSHHDevice = integration.slug === 'shh_pulse_ox';
                  const isConfigured = isSHHDevice
                    ? hasConfiguredReaders
                    : patientIntegrations.some(pi => pi.integration_slug === integration.slug);
                  return (
                    <EntityCard
                      key={integration.slug}
                      icon={isSHHDevice ? <WifiIcon size={22} /> : <LinkIcon size={22} />}
                      title={integration.name}
                      badges={[getAuthTypeLabel(integration.auth_type)]}
                      tag={isConfigured
                        ? {
                            label: isSHHDevice ? `${pairedReaderCount} Connected` : 'Configured',
                            tone: 'complete',
                          }
                        : undefined}
                      inactive={isConfigured}
                      details={[
                        {
                          icon: <VitalsIcon size={18} />,
                          label: 'Supports',
                          value: integration.supported_vitals
                            ? integration.supported_vitals.slice(0, 4).join(', ')
                              + (integration.supported_vitals.length > 4 ? '...' : '')
                            : undefined,
                        },
                      ]}
                      quickActions={[
                        {
                          icon: <PlusIcon size={18} />,
                          label: isSHHDevice ? 'Add Device' : `Add ${integration.name}`,
                          onClick: () => {
                            if (isSHHDevice) {
                              setShowReaderModal(true);
                            } else {
                              pickIntegration(integration);
                              setShowAddModal(true);
                            }
                          },
                        },
                      ]}
                    >
                      <div className="ec-body">
                        <span className="ec-detail-label">{integration.description}</span>
                      </div>
                    </EntityCard>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* Add Reader Dialog */}
        <EntityModal
          open={showReaderModal}
          onOpenChange={(o) => { if (!o) resetReaderModal(); }}
          title={pairingReader ? 'Approve on reader' : 'Add SHH reader'}
        >
          <div className="em-form">
            {!pairingReader ? (
              <>
                <p className="ec-detail-label">
                  Enter the IP address and port of your SHH Reader device. Make sure the reader is powered on and connected to your network.
                </p>
                <EmRow>
                  <EmField label="Reader IP address" required htmlFor="reader-ip">
                    <input id="reader-ip" className="em-input" value={readerIp} onChange={(e) => setReaderIp(e.target.value)} placeholder="e.g., 192.168.1.100" autoFocus />
                  </EmField>
                  <EmField label="Port" htmlFor="reader-port">
                    <input id="reader-port" className="em-input" type="number" value={readerPort} onChange={(e) => setReaderPort(e.target.value)} placeholder="8080" />
                  </EmField>
                </EmRow>
              </>
            ) : pairingReader.status === 'waiting' ? (
              <>
                <div>
                  <strong>Waiting for approval</strong>
                  <p className="ec-detail-label">
                    Approve this hub on <strong>{pairingReader.name}</strong> — open the reader's screen at <code>{readerIp}</code> and click <strong>Allow</strong>.
                  </p>
                </div>
                <p className="ec-detail-label">Waiting for the reader…</p>
              </>
            ) : (
              <div className="em-error">
                <strong>{pairingReader.status === 'denied' ? 'Pairing denied' : 'Pairing request expired'}</strong>
                <p className="ec-detail-label">
                  {pairingReader.status === 'denied'
                    ? 'The request was denied on the reader.'
                    : 'The reader did not respond in time.'} You can try again.
                </p>
              </div>
            )}

            <div className="em-footer">
              {pairingReader && pairingReader.status !== 'waiting' && (
                <button type="button" className="em-cancel" onClick={() => { stopPairPolling(); setPairingReader(null); }}>Try Again</button>
              )}
              <button type="button" className="em-cancel" onClick={resetReaderModal}>Cancel</button>
              {!pairingReader && (
                <button type="button" className="em-submit" onClick={handleInitiatePairing} disabled={pairingLoading || !readerIp.trim()}>
                  {pairingLoading ? 'Connecting…' : 'Connect Reader'}
                </button>
              )}
            </div>
          </div>
        </EntityModal>

        {/* Add Integration Dialog */}
        <EntityModal
          open={showAddModal}
          onOpenChange={(o) => { if (!o) closeAddModal(); }}
          title={addStep === 'select-camera' ? 'Select camera' : 'Add a connection'}
        >
          <div className="em-form">
            {addStep === 'select-camera' ? (
              <>
                <p className="ec-detail-label">
                  Choose which camera covers this patient. You can change this later from the integration settings.
                </p>
                {discoveredCameras.length === 0 ? (
                  <p className="ec-detail-label">No cameras were discovered on this Frigate instance.</p>
                ) : (
                  <EmField label="Camera" htmlFor="int-camera">
                    <EmSelect id="int-camera" value={pickedCamera} onChange={(e) => setPickedCamera(e.target.value)}>
                      {discoveredCameras.map(cam => (
                        <option key={cam.device_id} value={cam.device_id}>
                          {cam.device_name || cam.device_id}
                        </option>
                      ))}
                    </EmSelect>
                  </EmField>
                )}
              </>
            ) : !selectedIntegration ? (
              <>
                <button
                  type="button"
                  className="em-cancel"
                  onClick={() => { setShowAddModal(false); setShowReaderModal(true); }}
                >
                  <div><strong>{shhPulseOxIntegration.name}</strong> <span className="ec-badge">{getAuthTypeLabel(shhPulseOxIntegration.auth_type)}</span></div>
                  <div className="ec-detail-label">{shhPulseOxIntegration.description}</div>
                </button>
                {unconfiguredIntegrations.map(integration => (
                  <button
                    key={integration.slug}
                    type="button"
                    className="em-cancel"
                    onClick={() => pickIntegration(integration)}
                  >
                    <div><strong>{integration.name}</strong> <span className="ec-badge">{getAuthTypeLabel(integration.auth_type)}</span></div>
                    <div className="ec-detail-label">{integration.description}</div>
                  </button>
                ))}
                {unconfiguredIntegrations.length === 0 && (
                  <p className="ec-detail-label">
                    Everything available is already connected.
                  </p>
                )}
              </>
            ) : (
              <>
                <div>
                  <strong>{selectedIntegration.name}</strong>
                  <p className="ec-detail-label">{selectedIntegration.description}</p>
                </div>

                {selectedIntegration.auth_type === 'oauth2' && (
                  <p className="ec-detail-label">
                    You will be redirected to {selectedIntegration.name} to authorize access.
                  </p>
                )}

                {configSchemaProps && Object.keys(configSchemaProps).length > 0 && (
                  <>
                    <strong>Settings</strong>
                    {Object.entries(configSchemaProps)
                      // Hide fields whose value is chosen in a later step
                      // (Frigate camera is picked from the discovered list)
                      .filter(([key]) => !(selectedIntegration.slug === 'frigate' && key === 'camera'))
                      .map(([key, schema]) => (
                        <EmField key={key} label={schema.title || key} htmlFor={`int-set-${key}`}>
                          {schema.type === 'boolean' ? (
                            <label className="em-check-row">
                              <input
                                id={`int-set-${key}`}
                                type="checkbox"
                                className="em-check"
                                checked={newSettings[key] ?? schema.default ?? false}
                                onChange={(e) => setNewSettings({ ...newSettings, [key]: e.target.checked })}
                              />
                              <span className="em-check-label">{schema.description}</span>
                            </label>
                          ) : Array.isArray(schema.enum) ? (
                            <EmSelect
                              id={`int-set-${key}`}
                              value={(newSettings[key] ?? schema.default) != null ? String(newSettings[key] ?? schema.default) : ''}
                              onChange={(e) => setNewSettings({ ...newSettings, [key]: e.target.value })}
                            >
                              {(newSettings[key] ?? schema.default) == null && <option value="" />}
                              {schema.enum.map((opt, idx) => (
                                <option key={opt} value={String(opt)}>
                                  {(schema.enumLabels && schema.enumLabels[idx]) || opt}
                                </option>
                              ))}
                            </EmSelect>
                          ) : (
                            <input
                              id={`int-set-${key}`}
                              className="em-input"
                              value={newSettings[key] ?? schema.default ?? ''}
                              onChange={(e) => setNewSettings({ ...newSettings, [key]: e.target.value })}
                              placeholder={schema.description}
                            />
                          )}
                        </EmField>
                      ))}
                  </>
                )}
              </>
            )}

            <div className="em-footer">
              {selectedIntegration && addStep === 'form' && (
                <button type="button" className="em-cancel" onClick={() => { setSelectedIntegration(null); setNewSettings({}); }}>Back</button>
              )}
              <button type="button" className="em-cancel" onClick={closeAddModal}>Cancel</button>
              {addStep === 'select-camera' ? (
                <button type="button" className="em-submit" onClick={handlePickCamera} disabled={addingIntegration || !pickedCamera}>
                  {addingIntegration ? 'Saving…' : 'Use this camera'}
                </button>
              ) : selectedIntegration && (
                <button type="button" className="em-submit" onClick={handleAddIntegration} disabled={addingIntegration}>
                  {addingIntegration ? 'Adding…' : (
                    selectedIntegration.auth_type === 'oauth2'
                      ? `Connect to ${selectedIntegration.name}`
                      : 'Add'
                  )}
                </button>
              )}
            </div>
          </div>
        </EntityModal>

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
