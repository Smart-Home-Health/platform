import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../config';
import AdminV2Layout from './AdminV2Layout';
import './AdminV2.css';

export default function AdminV2Integrations() {
  const { user } = useAuth();
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

  // Get patient ID from user context or first patient
  const patientId = user?.patient_id || 1;

  useEffect(() => {
    fetchIntegrations();
  }, [patientId]);

  const fetchIntegrations = async () => {
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
      // Redirect to OAuth provider
      window.location.href = data.authorization_url;
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSync = async (integration) => {
    setError('');
    setSuccess('');
    
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
    }
  };

  const handleToggle = async (integration, enabled) => {
    try {
      if (enabled) {
        // Re-enable
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
        // Disable
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

  const getAuthTypeLabel = (authType) => {
    switch (authType) {
      case 'oauth2': return 'OAuth 2.0';
      case 'api_key': return 'API Key';
      case 'local': return 'Local';
      case 'none': return 'No Auth';
      default: return authType;
    }
  };

  const getStatusBadge = (integration) => {
    if (!integration.is_enabled) {
      return <span className="badge badge-secondary">Disabled</span>;
    }
    if (integration.last_sync_status === 'failed') {
      return <span className="badge badge-danger">Error</span>;
    }
    if (integration.last_sync_at) {
      return <span className="badge badge-success">Connected</span>;
    }
    return <span className="badge badge-warning">Pending Setup</span>;
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
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('error')) {
      setError(`OAuth error: ${params.get('error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Get integrations not yet configured for this patient
  const unconfiguredIntegrations = availableIntegrations.filter(
    avail => !patientIntegrations.some(pi => pi.integration_slug === avail.slug)
  );

  return (
    <AdminV2Layout>
      <div className="admin-page">
        <div className="page-header">
          <h1>Integrations</h1>
          <p className="text-muted">Connect smart devices and health services</p>
        </div>

        {error && (
          <div className="alert alert-danger alert-dismissible">
            {error}
            <button type="button" className="btn-close" onClick={() => setError('')}></button>
          </div>
        )}

        {success && (
          <div className="alert alert-success alert-dismissible">
            {success}
            <button type="button" className="btn-close" onClick={() => setSuccess('')}></button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Configured Integrations */}
            <div className="card mb-4">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Connected Integrations</h5>
                {unconfiguredIntegrations.length > 0 && (
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowAddModal(true)}
                  >
                    + Add Integration
                  </button>
                )}
              </div>
              <div className="card-body">
                {patientIntegrations.length === 0 ? (
                  <div className="text-center py-4 text-muted">
                    <p>No integrations configured yet.</p>
                    <button 
                      className="btn btn-outline-primary"
                      onClick={() => setShowAddModal(true)}
                    >
                      Add Your First Integration
                    </button>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover">
                      <thead>
                        <tr>
                          <th>Integration</th>
                          <th>Status</th>
                          <th>Last Sync</th>
                          <th>Sync Count</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {patientIntegrations.map(integration => (
                          <tr key={integration.id} className={!integration.is_enabled ? 'table-secondary' : ''}>
                            <td>
                              <strong>{integration.integration_name}</strong>
                              <br />
                              <small className="text-muted">{integration.integration_slug}</small>
                            </td>
                            <td>{getStatusBadge(integration)}</td>
                            <td>
                              {formatDate(integration.last_sync_at)}
                              {integration.last_sync_error && (
                                <div className="text-danger small">{integration.last_sync_error}</div>
                              )}
                            </td>
                            <td>{integration.sync_count || 0}</td>
                            <td>
                              <div className="btn-group btn-group-sm">
                                {integration.is_enabled && (
                                  <button 
                                    className="btn btn-outline-primary"
                                    onClick={() => handleSync(integration)}
                                    title="Sync Now"
                                  >
                                    🔄 Sync
                                  </button>
                                )}
                                <button
                                  className={`btn ${integration.is_enabled ? 'btn-outline-danger' : 'btn-outline-success'}`}
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
              </div>
            </div>

            {/* Available Integrations Info */}
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">Available Integrations</h5>
              </div>
              <div className="card-body">
                <div className="row">
                  {availableIntegrations.map(integration => (
                    <div key={integration.slug} className="col-md-4 mb-3">
                      <div className="card h-100">
                        <div className="card-body">
                          <h6 className="card-title">{integration.name}</h6>
                          <p className="card-text small text-muted">
                            {integration.description}
                          </p>
                          <div className="mb-2">
                            <span className="badge badge-info me-1">
                              {getAuthTypeLabel(integration.auth_type)}
                            </span>
                          </div>
                          <div className="small text-muted">
                            <strong>Supports:</strong>{' '}
                            {integration.supported_vitals?.slice(0, 3).join(', ')}
                            {integration.supported_vitals?.length > 3 && '...'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Add Integration Modal */}
        {showAddModal && (
          <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Add Integration</h5>
                  <button 
                    type="button" 
                    className="btn-close" 
                    onClick={() => {
                      setShowAddModal(false);
                      setSelectedIntegration(null);
                      setNewSettings({});
                    }}
                  ></button>
                </div>
                <div className="modal-body">
                  {!selectedIntegration ? (
                    <div className="list-group">
                      {unconfiguredIntegrations.map(integration => (
                        <button
                          key={integration.slug}
                          className="list-group-item list-group-item-action"
                          onClick={() => setSelectedIntegration(integration)}
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <strong>{integration.name}</strong>
                              <p className="mb-0 small text-muted">{integration.description}</p>
                            </div>
                            <span className="badge badge-secondary">
                              {getAuthTypeLabel(integration.auth_type)}
                            </span>
                          </div>
                        </button>
                      ))}
                      {unconfiguredIntegrations.length === 0 && (
                        <p className="text-muted text-center py-3">
                          All available integrations have been configured.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h6>{selectedIntegration.name}</h6>
                      <p className="text-muted">{selectedIntegration.description}</p>
                      
                      {selectedIntegration.auth_type === 'oauth2' && (
                        <div className="alert alert-info">
                          You will be redirected to {selectedIntegration.name} to authorize access.
                        </div>
                      )}

                      {selectedIntegration.config_schema?.properties && 
                       Object.keys(selectedIntegration.config_schema.properties).length > 0 && (
                        <div className="mb-3">
                          <h6>Settings</h6>
                          {Object.entries(selectedIntegration.config_schema.properties).map(([key, schema]) => (
                            <div key={key} className="mb-2">
                              <label className="form-label">{schema.title || key}</label>
                              {schema.type === 'boolean' ? (
                                <div className="form-check">
                                  <input
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={newSettings[key] ?? schema.default ?? false}
                                    onChange={(e) => setNewSettings({
                                      ...newSettings,
                                      [key]: e.target.checked
                                    })}
                                  />
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  className="form-control"
                                  value={newSettings[key] ?? schema.default ?? ''}
                                  onChange={(e) => setNewSettings({
                                    ...newSettings,
                                    [key]: e.target.value
                                  })}
                                  placeholder={schema.description}
                                />
                              )}
                              {schema.description && (
                                <small className="text-muted">{schema.description}</small>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  {selectedIntegration && (
                    <button 
                      className="btn btn-secondary"
                      onClick={() => {
                        setSelectedIntegration(null);
                        setNewSettings({});
                      }}
                    >
                      Back
                    </button>
                  )}
                  <button 
                    className="btn btn-outline-secondary"
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
                      className="btn btn-primary"
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
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
}
