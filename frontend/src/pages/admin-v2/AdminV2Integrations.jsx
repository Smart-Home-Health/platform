import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { API_BASE_URL, getApiBaseUrl } from '../../config';
import AdminV2Layout from './AdminV2Layout';
import {
  PlusIcon,
  RefreshIcon,
  XIcon,
  CheckIcon,
  ClockIcon,
  LinkIcon
} from '../../components/Icons';
import './AdminV2.css';

export default function AdminV2Integrations() {
  const { user } = useAuth();
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
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [addingIntegration, setAddingIntegration] = useState(false);
  
  // Settings for new integration
  const [newSettings, setNewSettings] = useState({});
  
  // Syncing state
  const [syncingId, setSyncingId] = useState(null);

  // Reader state
  const [readers, setReaders] = useState([]);
  const [showReaderModal, setShowReaderModal] = useState(false);
  const [readerIp, setReaderIp] = useState('');
  const [readerPort, setReaderPort] = useState('8080');
  const [readerName, setReaderName] = useState('');
  const [pairingReader, setPairingReader] = useState(null); // { id, name, code }
  const [pairingCode, setPairingCode] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);

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

  const handleAddIntegration = async () => {
    if (!selectedIntegration) return;
    
    setAddingIntegration(true);
    setError('');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/integrations/patient/${patientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          integration_slug: selectedIntegration.slug,
          settings: newSettings
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to add integration');
      }

      const newIntegration = await res.json();
      
      // If OAuth integration, start OAuth flow
      if (selectedIntegration.auth_type === 'oauth2') {
        await startOAuthFlow(newIntegration.id);
      } else {
        setSuccess(`${selectedIntegration.name} integration added successfully`);
        await fetchIntegrations();
      }
      
      setShowAddModal(false);
      setSelectedIntegration(null);
      setNewSettings({});
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingIntegration(false);
    }
  };

  const startOAuthFlow = async (integrationId) => {
    try {
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
    } catch (err) {
      setError(err.message);
    }
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

  // --- Reader Functions ---

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
        code: data.code
      });
      setSuccess('Pairing initiated. Enter the code shown on the reader device.');
    } catch (err) {
      setError(err.message);
    } finally {
      setPairingLoading(false);
    }
  };

  const handleConfirmPairing = async () => {
    if (!pairingCode.trim() || pairingCode.length !== 6) {
      setError('Please enter the 6-digit code from the reader');
      return;
    }

    setPairingLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/readers/pair/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reader_id: pairingReader.id,
          code: pairingCode.trim(),
          host_url: getApiBaseUrl()
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to confirm pairing');
      }

      setSuccess('Reader paired successfully!');
      setShowReaderModal(false);
      setPairingReader(null);
      setPairingCode('');
      setReaderIp('');
      setReaderPort('8080');
      setReaderName('');
      await fetchReaders();
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

  const handleDeleteReader = async (readerId) => {
    if (!window.confirm('Are you sure you want to delete this reader?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/readers/${readerId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to delete reader');
      }

      setSuccess('Reader deleted');
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
    if (!integration.is_enabled) {
      return <span className="admin-v2-badge admin-v2-badge-muted">Disabled</span>;
    }
    if (integration.last_sync_status === 'failed') {
      return <span className="admin-v2-badge admin-v2-badge-danger">Error</span>;
    }
    if (integration.last_sync_at) {
      return <span className="admin-v2-badge admin-v2-badge-success">Connected</span>;
    }
    return <span className="admin-v2-badge admin-v2-badge-warning">Pending Setup</span>;
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

  // Get integrations not yet configured for this patient
  const unconfiguredIntegrations = availableIntegrations.filter(
    avail => !patientIntegrations.some(pi => pi.integration_slug === avail.slug)
  );

  // Add SHH Pulse Oximeter to available integrations list
  const allAvailableIntegrations = [shhPulseOxIntegration, ...availableIntegrations];

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

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {/* Section Title */}
        <h1 className="schedule-section-title">Integrations</h1>
        <p className="admin-v2-text-muted" style={{ marginTop: '-0.5rem', marginBottom: '1.5rem' }}>
          Connect smart devices and health services for {selectedPatient.name}
        </p>

        {/* Alerts */}
        {error && (
          <div className="admin-v2-alert admin-v2-alert-danger">
            <span>{error}</span>
            <button className="admin-v2-alert-close" onClick={() => setError('')}>
              <XIcon size={16} />
            </button>
          </div>
        )}

        {success && (
          <div className="admin-v2-alert admin-v2-alert-success">
            <span>{success}</span>
            <button className="admin-v2-alert-close" onClick={() => setSuccess('')}>
              <XIcon size={16} />
            </button>
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
          <>
            {/* Configured Integrations */}
            <div className="admin-v2-page-header">
              <h3 style={{ margin: 0, color: '#e6edf3' }}>
                Connected Integrations ({patientIntegrations.length})
              </h3>
              {unconfiguredIntegrations.length > 0 && (
                <button 
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={() => setShowAddModal(true)}
                >
                  <PlusIcon size={16} /> Add Integration
                </button>
              )}
            </div>

            {patientIntegrations.length === 0 ? (
              <div className="admin-v2-empty-state">
                <LinkIcon size={48} />
                <h3>No Integrations Configured</h3>
                <p className="admin-v2-text-muted">Connect your first integration to start syncing health data.</p>
                <button 
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={() => setShowAddModal(true)}
                >
                  <PlusIcon size={16} /> Add Your First Integration
                </button>
              </div>
            ) : (
              <div className="admin-v2-table-container">
                <table className="admin-v2-table">
                  <thead>
                    <tr>
                      <th>Integration</th>
                      <th>Status</th>
                      <th>Last Sync</th>
                      <th>Syncs</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientIntegrations.map(integration => (
                      <tr key={integration.id} className={!integration.is_enabled ? 'admin-v2-row-disabled' : ''}>
                        <td>
                          <span className="admin-v2-integration-name">{integration.integration_name}</span>
                          <div className="admin-v2-text-muted admin-v2-text-small">{integration.integration_slug}</div>
                        </td>
                        <td>{getStatusBadge(integration)}</td>
                        <td>
                          <span>{formatDate(integration.last_sync_at)}</span>
                          {integration.last_sync_error && (
                            <div className="admin-v2-text-danger admin-v2-text-small">{integration.last_sync_error}</div>
                          )}
                        </td>
                        <td>{integration.sync_count || 0}</td>
                        <td>
                          <div className="admin-v2-table-actions">
                            {integration.is_enabled && (
                              <button 
                                className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-ghost"
                                onClick={() => handleSync(integration)}
                                disabled={syncingId === integration.id}
                                title="Sync Now"
                              >
                                <RefreshIcon size={14} className={syncingId === integration.id ? 'spinning' : ''} />
                                {syncingId === integration.id ? 'Syncing...' : 'Sync'}
                              </button>
                            )}
                            <button
                              className={`admin-v2-btn admin-v2-btn-sm ${integration.is_enabled ? 'admin-v2-btn-danger-ghost' : 'admin-v2-btn-success-ghost'}`}
                              onClick={() => handleToggle(integration, !integration.is_enabled)}
                            >
                              {integration.is_enabled ? 'Disable' : 'Enable'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Connected Readers - shown in same table style */}
            {patientReaders.filter(r => r.is_paired).length > 0 && (
              <div className="admin-v2-table-container" style={{ marginTop: '1rem' }}>
                <table className="admin-v2-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Status</th>
                      <th>Last Seen</th>
                      <th>IP Address</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientReaders.filter(r => r.is_paired).map(reader => (
                      <tr key={`reader-${reader.id}`}>
                        <td>
                          <span className="admin-v2-integration-name">{reader.name}</span>
                          <div className="admin-v2-text-muted admin-v2-text-small">SHH Pulse Oximeter</div>
                        </td>
                        <td>
                          {reader.connected ? (
                            <span className="admin-v2-badge admin-v2-badge-success">
                              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3fb950', marginRight: 6 }}></span>
                              Online
                            </span>
                          ) : (
                            <span className="admin-v2-badge admin-v2-badge-muted">Offline</span>
                          )}
                        </td>
                        <td>{formatDate(reader.last_seen)}</td>
                        <td>
                          <code style={{ fontSize: '0.85rem', color: '#8b949e' }}>{reader.ip_address}</code>
                        </td>
                        <td>
                          <div className="admin-v2-table-actions">
                            <button 
                              className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-danger-ghost"
                              onClick={() => handleUnpairReader(reader.id)}
                              title="Disconnect"
                            >
                              Disconnect
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Available Integrations */}
            <div className="admin-v2-page-header" style={{ marginTop: '2rem' }}>
              <h3 style={{ margin: 0, color: '#e6edf3' }}>
                Available Integrations ({allAvailableIntegrations.length})
              </h3>
            </div>

            <div className="admin-v2-cards-grid">
              {allAvailableIntegrations.map(integration => {
                const isSHHDevice = integration.slug === 'shh_pulse_ox';
                const isConfigured = isSHHDevice 
                  ? hasConfiguredReaders 
                  : patientIntegrations.some(pi => pi.integration_slug === integration.slug);
                return (
                  <div key={integration.slug} className={`admin-v2-card ${isConfigured ? 'inactive' : ''}`}>
                    <div className="admin-v2-card-header">
                      <div className="admin-v2-card-title-row">
                        <h3>{integration.name}</h3>
                        {isConfigured && (
                          <span className="admin-v2-badge admin-v2-badge-success">
                            {isSHHDevice ? `${patientReaders.filter(r => r.is_paired).length} Connected` : 'Configured'}
                          </span>
                        )}
                      </div>
                      <span className="admin-v2-badge admin-v2-badge-info">
                        {getAuthTypeLabel(integration.auth_type)}
                      </span>
                    </div>
                    <div className="admin-v2-card-body">
                      <p className="admin-v2-text-muted">{integration.description}</p>
                      <div className="admin-v2-card-row">
                        <span className="label">Supports:</span>
                        <span className="value">
                          {integration.supported_vitals?.slice(0, 4).join(', ')}
                          {integration.supported_vitals?.length > 4 && '...'}
                        </span>
                      </div>
                    </div>
                    <div className="admin-v2-card-actions">
                      <button 
                        className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-primary"
                        onClick={() => {
                          if (isSHHDevice) {
                            setShowReaderModal(true);
                          } else {
                            setSelectedIntegration(integration);
                            setShowAddModal(true);
                          }
                        }}
                      >
                        <PlusIcon size={14} /> {isSHHDevice ? 'Add Device' : 'Add'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Add Reader Modal */}
        {showReaderModal && (
          <div className="admin-v2-modal-overlay" onClick={() => {
            setShowReaderModal(false);
            setPairingReader(null);
            setPairingCode('');
            setReaderIp('');
            setReaderPort('8080');
            setReaderName('');
          }}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>{pairingReader ? 'Confirm Pairing' : 'Add SHH Reader'}</h2>
                <button 
                  className="admin-v2-modal-close"
                  onClick={() => {
                    setShowReaderModal(false);
                    setPairingReader(null);
                    setPairingCode('');
                    setReaderIp('');
                    setReaderPort('8080');
                    setReaderName('');
                  }}
                >
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                {!pairingReader ? (
                  <>
                    <p className="admin-v2-text-muted" style={{ marginBottom: '1.5rem' }}>
                      Enter the IP address and port of your SHH Reader device. Make sure the reader is powered on and connected to your network.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <div className="admin-v2-form-group" style={{ flex: 1 }}>
                        <label className="admin-v2-label">Reader IP Address *</label>
                        <input
                          type="text"
                          className="admin-v2-input"
                          value={readerIp}
                          onChange={(e) => setReaderIp(e.target.value)}
                          placeholder="e.g., 192.168.1.100"
                          autoFocus
                        />
                      </div>
                      <div className="admin-v2-form-group" style={{ width: '100px' }}>
                        <label className="admin-v2-label">Port</label>
                        <input
                          type="number"
                          className="admin-v2-input"
                          value={readerPort}
                          onChange={(e) => setReaderPort(e.target.value)}
                          placeholder="8080"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="admin-v2-alert admin-v2-alert-info" style={{ marginBottom: '1.5rem' }}>
                      <strong>Pairing Code Required</strong>
                      <p style={{ margin: '0.5rem 0 0 0' }}>
                        Look at the <strong>{pairingReader.name}</strong> device screen and enter the 6-digit pairing code shown.
                      </p>
                    </div>
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '1.5rem', 
                      background: 'rgba(88, 166, 255, 0.1)', 
                      borderRadius: '8px',
                      marginBottom: '1.5rem'
                    }}>
                      <p style={{ margin: '0 0 1rem 0', color: '#8b949e' }}>Code shown on reader:</p>
                      <div style={{ 
                        fontSize: '2rem', 
                        fontFamily: 'monospace', 
                        letterSpacing: '0.5rem',
                        color: '#58a6ff',
                        fontWeight: 'bold'
                      }}>
                        {pairingReader.code}
                      </div>
                    </div>
                    <div className="admin-v2-form-group">
                      <label className="admin-v2-label">Enter Pairing Code *</label>
                      <input
                        type="text"
                        className="admin-v2-input"
                        value={pairingCode}
                        onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        style={{ 
                          textAlign: 'center', 
                          fontSize: '1.5rem', 
                          letterSpacing: '0.5rem',
                          fontFamily: 'monospace'
                        }}
                        autoFocus
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="admin-v2-modal-footer">
                {pairingReader && (
                  <button 
                    className="admin-v2-btn admin-v2-btn-ghost"
                    onClick={() => {
                      setPairingReader(null);
                      setPairingCode('');
                    }}
                  >
                    Back
                  </button>
                )}
                <button 
                  className="admin-v2-btn admin-v2-btn-secondary"
                  onClick={() => {
                    setShowReaderModal(false);
                    setPairingReader(null);
                    setPairingCode('');
                    setReaderIp('');
                    setReaderPort('8080');
                    setReaderName('');
                  }}
                >
                  Cancel
                </button>
                {!pairingReader ? (
                  <button 
                    className="admin-v2-btn admin-v2-btn-primary"
                    onClick={handleInitiatePairing}
                    disabled={pairingLoading || !readerIp.trim()}
                  >
                    {pairingLoading ? 'Connecting...' : 'Connect Reader'}
                  </button>
                ) : (
                  <button 
                    className="admin-v2-btn admin-v2-btn-primary"
                    onClick={handleConfirmPairing}
                    disabled={pairingLoading || pairingCode.length !== 6}
                  >
                    {pairingLoading ? 'Pairing...' : 'Confirm Pairing'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add Integration Modal */}
        {showAddModal && (
          <div className="admin-v2-modal-overlay" onClick={() => {
            setShowAddModal(false);
            setSelectedIntegration(null);
            setNewSettings({});
          }}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Add Integration</h2>
                <button 
                  className="admin-v2-modal-close"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedIntegration(null);
                    setNewSettings({});
                  }}
                >
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                {!selectedIntegration ? (
                  <div className="admin-v2-integration-list">
                    {/* SHH Pulse Oximeter option */}
                    <button
                      className="admin-v2-integration-option"
                      onClick={() => {
                        setShowAddModal(false);
                        setShowReaderModal(true);
                      }}
                    >
                      <div className="admin-v2-integration-option-info">
                        <strong>{shhPulseOxIntegration.name}</strong>
                        <p className="admin-v2-text-muted admin-v2-text-small">{shhPulseOxIntegration.description}</p>
                      </div>
                      <span className="admin-v2-badge admin-v2-badge-secondary">
                        {getAuthTypeLabel(shhPulseOxIntegration.auth_type)}
                      </span>
                    </button>
                    {unconfiguredIntegrations.map(integration => (
                      <button
                        key={integration.slug}
                        className="admin-v2-integration-option"
                        onClick={() => setSelectedIntegration(integration)}
                      >
                        <div className="admin-v2-integration-option-info">
                          <strong>{integration.name}</strong>
                          <p className="admin-v2-text-muted admin-v2-text-small">{integration.description}</p>
                        </div>
                        <span className="admin-v2-badge admin-v2-badge-secondary">
                          {getAuthTypeLabel(integration.auth_type)}
                        </span>
                      </button>
                    ))}
                    {unconfiguredIntegrations.length === 0 && (
                      <p className="admin-v2-text-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                        All available integrations have been configured.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <h3 style={{ marginBottom: '0.5rem', color: '#e6edf3' }}>{selectedIntegration.name}</h3>
                    <p className="admin-v2-text-muted">{selectedIntegration.description}</p>
                    
                    {selectedIntegration.auth_type === 'oauth2' && (
                      <div className="admin-v2-alert admin-v2-alert-info" style={{ marginTop: '1rem' }}>
                        You will be redirected to {selectedIntegration.name} to authorize access.
                      </div>
                    )}

                    {selectedIntegration.config_schema?.properties && 
                     Object.keys(selectedIntegration.config_schema.properties).length > 0 && (
                      <div style={{ marginTop: '1.5rem' }}>
                        <h4 style={{ color: '#e6edf3', marginBottom: '1rem' }}>Settings</h4>
                        {Object.entries(selectedIntegration.config_schema.properties).map(([key, schema]) => (
                          <div key={key} className="admin-v2-form-group">
                            <label className="admin-v2-label">{schema.title || key}</label>
                            {schema.type === 'boolean' ? (
                              <label className="admin-v2-checkbox">
                                <input
                                  type="checkbox"
                                  checked={newSettings[key] ?? schema.default ?? false}
                                  onChange={(e) => setNewSettings({
                                    ...newSettings,
                                    [key]: e.target.checked
                                  })}
                                />
                                <span>{schema.description}</span>
                              </label>
                            ) : (
                              <input
                                type="text"
                                className="admin-v2-input"
                                value={newSettings[key] ?? schema.default ?? ''}
                                onChange={(e) => setNewSettings({
                                  ...newSettings,
                                  [key]: e.target.value
                                })}
                                placeholder={schema.description}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="admin-v2-modal-footer">
                {selectedIntegration && (
                  <button 
                    className="admin-v2-btn admin-v2-btn-ghost"
                    onClick={() => {
                      setSelectedIntegration(null);
                      setNewSettings({});
                    }}
                  >
                    Back
                  </button>
                )}
                <button 
                  className="admin-v2-btn admin-v2-btn-secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedIntegration(null);
                    setNewSettings({});
                  }}
                >
                  Cancel
                </button>
                {selectedIntegration && (
                  <button 
                    className="admin-v2-btn admin-v2-btn-primary"
                    onClick={handleAddIntegration}
                    disabled={addingIntegration}
                  >
                    {addingIntegration ? 'Adding...' : (
                      selectedIntegration.auth_type === 'oauth2' 
                        ? `Connect to ${selectedIntegration.name}`
                        : 'Add Integration'
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
}
