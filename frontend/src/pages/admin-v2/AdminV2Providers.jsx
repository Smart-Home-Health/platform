import React, { useState, useEffect } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  UsersIcon,
  CheckIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2Providers = () => {
  const { user } = useAuth();
  const { 
    selectedPatient: contextPatient, 
    loadingPatients 
  } = useAdminPatient();
  
  // Use context patient as the source of truth
  const selectedPatient = contextPatient;
  
  // Providers state
  const [providers, setProviders] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter state
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [providerTypes, setProviderTypes] = useState([]);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    business_id: '',
    first_name: '',
    last_name: '',
    title: '',
    specialty: '',
    provider_type: 'medical',
    phone: '',
    email: '',
    fax: '',
    license_number: '',
    npi_number: '',
    department: '',
    notes: '',
    is_primary: false
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const providerTypeOptions = [
    'medical', 'therapy', 'rehab', 'school', 'pharmacy', 'specialist', 
    'nursing', 'social_worker', 'case_manager', 'other'
  ];

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Fetch businesses and provider types on mount
  useEffect(() => {
    fetchBusinesses();
    fetchProviderTypes();
  }, []);

  // Fetch providers when patient or filters change
  useEffect(() => {
    if (selectedPatient) {
      fetchProviders();
    }
  }, [selectedPatient, activeTab, filterType]);

  const fetchProviders = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      let url = `${config.apiUrl}/api/providers/patient/${selectedPatient.id}?active_only=${activeTab === 'active'}`;
      if (filterType) {
        url += `&provider_type=${encodeURIComponent(filterType)}`;
      }
      
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setProviders(data);
      } else {
        setError('Failed to load providers');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching providers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBusinesses = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses?active_only=true`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setBusinesses(data);
      }
    } catch (err) {
      console.error('Error fetching businesses:', err);
    }
  };

  const fetchProviderTypes = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/types`, {
        credentials: 'include'
      });
      if (response.ok) {
        const types = await response.json();
        setProviderTypes(types);
      }
    } catch (err) {
      console.error('Error fetching provider types:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;

    try {
      setSaving(true);
      setFormError(null);

      const providerData = {
        ...formData,
        patient_id: selectedPatient.id,
        business_id: formData.business_id ? parseInt(formData.business_id) : null
      };

      const endpoint = selectedProvider 
        ? `${config.apiUrl}/api/providers/${selectedProvider.id}`
        : `${config.apiUrl}/api/providers`;
      
      const method = selectedProvider ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(providerData)
      });

      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchProviders();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to save provider');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (provider) => {
    setFormData({
      business_id: provider.business_id || '',
      first_name: provider.first_name || '',
      last_name: provider.last_name || '',
      title: provider.title || '',
      specialty: provider.specialty || '',
      provider_type: provider.provider_type || 'medical',
      phone: provider.phone || '',
      email: provider.email || '',
      fax: provider.fax || '',
      license_number: provider.license_number || '',
      npi_number: provider.npi_number || '',
      department: provider.department || '',
      notes: provider.notes || '',
      is_primary: provider.is_primary || false
    });
    setSelectedProvider(provider);
    setShowCreateModal(true);
  };

  const handleDelete = async (providerId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/${providerId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        fetchProviders();
        setShowDeleteModal(false);
        setSelectedProvider(null);
      }
    } catch (err) {
      console.error('Error deleting provider:', err);
    }
  };

  const handleActivate = async (providerId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/${providerId}/activate`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        fetchProviders();
      }
    } catch (err) {
      console.error('Error activating provider:', err);
    }
  };

  const handleSetPrimary = async (providerId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/${providerId}/set-primary`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        fetchProviders();
      }
    } catch (err) {
      console.error('Error setting primary provider:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      business_id: '',
      first_name: '',
      last_name: '',
      title: '',
      specialty: '',
      provider_type: 'medical',
      phone: '',
      email: '',
      fax: '',
      license_number: '',
      npi_number: '',
      department: '',
      notes: '',
      is_primary: false
    });
    setFormError(null);
    setSelectedProvider(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const filteredProviders = providers.filter(provider =>
    provider.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.specialty?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.provider_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (provider.business && provider.business.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Loading state
  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  // Create/Edit modal
  const renderFormModal = () => (
    <div className="admin-v2-modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) {
        setShowCreateModal(false);
        resetForm();
      }
    }}>
      <div className="admin-v2-modal admin-v2-modal-lg">
        <div className="admin-v2-modal-header">
          <h3>{selectedProvider ? 'Edit Provider' : 'Add New Provider'}</h3>
          <button 
            className="admin-v2-modal-close"
            onClick={() => {
              setShowCreateModal(false);
              resetForm();
            }}
          >
            <XIcon size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="admin-v2-modal-body">
            {formError && (
              <div className="admin-v2-form-error">{formError}</div>
            )}
            
            <div className="admin-v2-form-grid">
              <div className="admin-v2-form-group">
                <label>First Name *</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Last Name *</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Dr., RN, PT, OT, etc."
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Provider Type *</label>
                <select
                  value={formData.provider_type}
                  onChange={(e) => setFormData({ ...formData, provider_type: e.target.value })}
                  required
                >
                  {providerTypeOptions.map(type => (
                    <option key={type} value={type}>
                      {type.replace('_', ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-v2-form-group">
                <label>Specialty</label>
                <input
                  type="text"
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  placeholder="Cardiologist, Physical Therapist, etc."
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Associated Business</label>
                <select
                  value={formData.business_id}
                  onChange={(e) => setFormData({ ...formData, business_id: e.target.value })}
                >
                  <option value="">No Business Association</option>
                  {businesses.map(business => (
                    <option key={business.id} value={business.id}>
                      {business.name} ({business.business_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-v2-form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Fax</label>
                <input
                  type="tel"
                  value={formData.fax}
                  onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>License Number</label>
                <input
                  type="text"
                  value={formData.license_number}
                  onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>NPI Number</label>
                <input
                  type="text"
                  value={formData.npi_number}
                  onChange={(e) => setFormData({ ...formData, npi_number: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Department</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group admin-v2-form-full">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="3"
                />
              </div>

              <div className="admin-v2-form-group admin-v2-form-full">
                <label className="admin-v2-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.is_primary}
                    onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                  />
                  Primary provider for this type
                </label>
              </div>
            </div>
          </div>
          <div className="admin-v2-modal-footer">
            <button 
              type="button" 
              className="admin-v2-btn admin-v2-btn-secondary"
              onClick={() => {
                setShowCreateModal(false);
                resetForm();
              }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="admin-v2-btn admin-v2-btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : (selectedProvider ? 'Update Provider' : 'Add Provider')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {/* Section Title */}
            <h1 className="schedule-section-title">Care Team & Providers</h1>

            {error && (
              <div className="admin-v2-error-banner">{error}</div>
            )}

            {/* Tabs and Filters */}
            <div className="admin-v2-controls-bar">
              <div className="admin-v2-tabs">
                <button 
                  className={`admin-v2-tab ${activeTab === 'active' ? 'active' : ''}`}
                  onClick={() => setActiveTab('active')}
                >
                  Active ({providers.filter(p => p.active).length})
                </button>
                <button 
                  className={`admin-v2-tab ${activeTab === 'inactive' ? 'active' : ''}`}
                  onClick={() => setActiveTab('inactive')}
                >
                  Inactive ({providers.filter(p => !p.active).length})
                </button>
              </div>

              <div className="admin-v2-filters">
                <input
                  type="text"
                  placeholder="Search providers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="admin-v2-search-input"
                />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="admin-v2-filter-select"
                >
                  <option value="">All Types</option>
                  {providerTypes.map(type => (
                    <option key={type} value={type}>{type.replace('_', ' ').toUpperCase()}</option>
                  ))}
                </select>
              </div>

              {hasPermission('providers.create') && (
                <button 
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={openCreateModal}
                >
                  <PlusIcon size={16} /> Add Provider
                </button>
              )}
            </div>

            {/* Provider Cards Grid */}
            {loading ? (
              <div className="admin-v2-loading">Loading providers...</div>
            ) : filteredProviders.length === 0 ? (
              <div className="admin-v2-empty-state">
                <UsersIcon size={48} />
                <h3>{searchTerm ? 'No providers found matching your search.' : 'No providers found for this patient.'}</h3>
                {hasPermission('providers.create') && (
                  <button 
                    className="admin-v2-btn admin-v2-btn-primary"
                    onClick={openCreateModal}
                  >
                    <PlusIcon size={16} /> Add First Provider
                  </button>
                )}
              </div>
            ) : (
              <div className="admin-v2-cards-grid">
                {filteredProviders.map(provider => (
                  <div key={provider.id} className={`admin-v2-card ${!provider.active ? 'inactive' : ''}`}>
                    <div className="admin-v2-card-header">
                      <div className="admin-v2-card-title-row">
                        <h3>
                          {provider.title} {provider.first_name} {provider.last_name}
                        </h3>
                        {provider.is_primary && (
                          <span className="admin-v2-badge admin-v2-badge-primary">PRIMARY</span>
                        )}
                      </div>
                      <span className={`admin-v2-badge admin-v2-badge-type-${provider.provider_type}`}>
                        {provider.provider_type.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="admin-v2-card-body">
                      {provider.specialty && (
                        <div className="admin-v2-card-row">
                          <span className="label">Specialty:</span>
                          <span className="value">{provider.specialty}</span>
                        </div>
                      )}
                      {provider.business && (
                        <div className="admin-v2-card-row">
                          <span className="label">Business:</span>
                          <span className="value">{provider.business.name}</span>
                        </div>
                      )}
                      {provider.department && (
                        <div className="admin-v2-card-row">
                          <span className="label">Department:</span>
                          <span className="value">{provider.department}</span>
                        </div>
                      )}
                      {provider.phone && (
                        <div className="admin-v2-card-row">
                          <span className="label">Phone:</span>
                          <span className="value">{provider.phone}</span>
                        </div>
                      )}
                      {provider.email && (
                        <div className="admin-v2-card-row">
                          <span className="label">Email:</span>
                          <span className="value">{provider.email}</span>
                        </div>
                      )}
                      {provider.license_number && (
                        <div className="admin-v2-card-row">
                          <span className="label">License:</span>
                          <span className="value">{provider.license_number}</span>
                        </div>
                      )}
                    </div>

                    <div className="admin-v2-card-actions">
                      {hasPermission('providers.update') && (
                        <button 
                          className="admin-v2-action-btn admin-v2-action-btn-edit"
                          onClick={() => handleEdit(provider)}
                        >
                          <EditIcon size={14} />
                          <span>Edit</span>
                        </button>
                      )}
                      {!provider.is_primary && provider.active && hasPermission('providers.update') && (
                        <button 
                          className="admin-v2-action-btn admin-v2-action-btn-primary-set"
                          onClick={() => handleSetPrimary(provider.id)}
                        >
                          <CheckIcon size={14} />
                          <span>Set Primary</span>
                        </button>
                      )}
                      {provider.active ? (
                        hasPermission('providers.delete') && (
                          <button 
                            className="admin-v2-action-btn admin-v2-action-btn-delete"
                            onClick={() => handleDelete(provider.id)}
                          >
                            <TrashIcon size={14} />
                            <span>Deactivate</span>
                          </button>
                        )
                      ) : (
                        hasPermission('providers.update') && (
                          <button 
                            className="admin-v2-action-btn admin-v2-action-btn-success"
                            onClick={() => handleActivate(provider.id)}
                          >
                            <CheckIcon size={14} />
                            <span>Activate</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="admin-v2-placeholder-page">
            <UsersIcon size={64} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view and manage their care team.</p>
          </div>
        )}

        {/* Modals */}
        {showCreateModal && renderFormModal()}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Providers;
