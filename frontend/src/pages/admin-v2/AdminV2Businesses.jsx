import React, { useState, useEffect } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  BuildingIcon,
  CheckIcon,
  SearchIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2Businesses = () => {
  const { user } = useAuth();
  
  // State
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter state
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [businessTypes, setBusinessTypes] = useState([]);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    business_types: [],
    phone: '',
    fax: '',
    email: '',
    website: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    notes: ''
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const businessTypeOptions = [
    'hospital', 'clinic', 'pharmacy', 'dme', 'school', 'therapy', 
    'insurance', 'lab', 'imaging', 'home_health', 'hospice', 'rehab', 'other'
  ];

  // Toggle a type in the business_types array
  const toggleBusinessType = (type) => {
    setFormData(prev => {
      const types = prev.business_types || [];
      if (types.includes(type)) {
        return { ...prev, business_types: types.filter(t => t !== type) };
      } else {
        return { ...prev, business_types: [...types, type] };
      }
    });
  };

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Fetch businesses on mount
  useEffect(() => {
    fetchBusinesses();
    fetchBusinessTypes();
  }, [activeTab, filterType]);

  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let url = `${config.apiUrl}/api/businesses?active_only=${activeTab === 'active'}`;
      if (filterType) {
        url += `&business_type=${encodeURIComponent(filterType)}`;
      }
      
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setBusinesses(data);
      } else {
        setError('Failed to load businesses');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching businesses:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBusinessTypes = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses/types`, {
        credentials: 'include'
      });
      if (response.ok) {
        const types = await response.json();
        setBusinessTypes(types);
      }
    } catch (err) {
      console.error('Error fetching business types:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate at least one type selected
    if (!formData.business_types || formData.business_types.length === 0) {
      setFormError('Please select at least one business type');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      const endpoint = selectedBusiness 
        ? `${config.apiUrl}/api/businesses/${selectedBusiness.id}`
        : `${config.apiUrl}/api/businesses`;
      
      const method = selectedBusiness ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchBusinesses();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to save business');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (business) => {
    setFormData({
      name: business.name || '',
      business_types: business.business_types || (business.business_type ? [business.business_type] : []),
      phone: business.phone || '',
      fax: business.fax || '',
      email: business.email || '',
      website: business.website || '',
      address_line1: business.address_line1 || '',
      address_line2: business.address_line2 || '',
      city: business.city || '',
      state: business.state || '',
      zip_code: business.zip_code || '',
      notes: business.notes || ''
    });
    setSelectedBusiness(business);
    setShowCreateModal(true);
  };

  const handleDelete = async (businessId) => {
    if (!window.confirm('Are you sure you want to deactivate this business?')) return;
    
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses/${businessId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        fetchBusinesses();
      }
    } catch (err) {
      console.error('Error deleting business:', err);
    }
  };

  const handleActivate = async (businessId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses/${businessId}/activate`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        fetchBusinesses();
      }
    } catch (err) {
      console.error('Error activating business:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      business_types: [],
      phone: '',
      fax: '',
      email: '',
      website: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      zip_code: '',
      notes: ''
    });
    setFormError(null);
    setSelectedBusiness(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const filteredBusinesses = businesses.filter(business => {
    const typesStr = (business.business_types || []).join(' ').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    return business.name.toLowerCase().includes(searchLower) ||
      typesStr.includes(searchLower) ||
      business.city?.toLowerCase().includes(searchLower) ||
      business.state?.toLowerCase().includes(searchLower);
  });

  // Stats
  const activeCount = businesses.filter(b => b.active).length;
  const inactiveCount = businesses.filter(b => !b.active).length;

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
          <h3>{selectedBusiness ? 'Edit Business' : 'Add New Business'}</h3>
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
            
            <div className="admin-v2-form-group" style={{marginBottom: '1.25rem'}}>
              <label>Business Types * <span style={{fontWeight: 'normal', fontSize: '0.85em'}}>(select all that apply)</span></label>
              <div className="admin-v2-checkbox-grid">
                {businessTypeOptions.map(type => (
                  <label key={type} className="admin-v2-checkbox-label">
                    <input
                      type="checkbox"
                      checked={(formData.business_types || []).includes(type)}
                      onChange={() => toggleBusinessType(type)}
                    />
                    {type.replace('_', ' ').toUpperCase()}
                  </label>
                ))}
              </div>
              {formData.business_types?.length === 0 && (
                <span style={{color: '#f44336', fontSize: '0.85em'}}>Please select at least one type</span>
              )}
            </div>

            <div className="admin-v2-form-grid">
              <div className="admin-v2-form-group">
                <label>Business Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
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
                <label>Fax</label>
                <input
                  type="tel"
                  value={formData.fax}
                  onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
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
                <label>Website</label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://"
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Address Line 1</label>
                <input
                  type="text"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Address Line 2</label>
                <input
                  type="text"
                  value={formData.address_line2}
                  onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  maxLength="2"
                />
              </div>

              <div className="admin-v2-form-group">
                <label>ZIP Code</label>
                <input
                  type="text"
                  value={formData.zip_code}
                  onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                />
              </div>
            </div>

            <div className="admin-v2-form-group" style={{marginTop: '1rem'}}>
              <label>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows="4"
                placeholder="Additional notes about this business..."
                style={{width: '100%', resize: 'vertical'}}
              />
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
              {saving ? 'Saving...' : (selectedBusiness ? 'Update Business' : 'Add Business')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <h1 className="schedule-section-title">Businesses & Organizations</h1>

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
              Active ({activeCount})
            </button>
            <button 
              className={`admin-v2-tab ${activeTab === 'inactive' ? 'active' : ''}`}
              onClick={() => setActiveTab('inactive')}
            >
              Inactive ({inactiveCount})
            </button>
          </div>

          <div className="admin-v2-filters">
            <div className="admin-v2-search-wrapper">
              <SearchIcon size={16} />
              <input
                type="text"
                placeholder="Search businesses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="admin-v2-search-input"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="admin-v2-filter-select"
            >
              <option value="">All Types</option>
              {businessTypes.map(type => (
                <option key={type} value={type}>{type.replace('_', ' ').toUpperCase()}</option>
              ))}
            </select>
          </div>

          {hasPermission('businesses.create') && (
            <button 
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={openCreateModal}
            >
              <PlusIcon size={16} /> Add Business
            </button>
          )}
        </div>

        {/* Business Cards Grid */}
        {loading ? (
          <div className="admin-v2-loading">Loading businesses...</div>
        ) : filteredBusinesses.length === 0 ? (
          <div className="admin-v2-empty-state">
            <BuildingIcon size={48} />
            <h3>{searchTerm ? 'No businesses found matching your search.' : 'No businesses found.'}</h3>
            {hasPermission('businesses.create') && (
              <button 
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={openCreateModal}
              >
                <PlusIcon size={16} /> Add First Business
              </button>
            )}
          </div>
        ) : (
          <div className="admin-v2-cards-grid">
            {filteredBusinesses.map(business => (
              <div key={business.id} className={`admin-v2-card ${!business.active ? 'inactive' : ''}`}>
                <div className="admin-v2-card-header">
                  <div className="admin-v2-card-title-row">
                    <h3>{business.name}</h3>
                  </div>
                  <div className="admin-v2-badge-group">
                    {(business.business_types || [business.business_type]).filter(Boolean).map(type => (
                      <span key={type} className={`admin-v2-badge admin-v2-badge-type-${type}`}>
                        {type.replace('_', ' ').toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="admin-v2-card-body">
                  {(business.address_line1 || business.city) && (
                    <div className="admin-v2-card-row">
                      <span className="label">Address:</span>
                      <span className="value">
                        {business.address_line1 && <>{business.address_line1}<br /></>}
                        {business.address_line2 && <>{business.address_line2}<br /></>}
                        {business.city && `${business.city}, `}
                        {business.state} {business.zip_code}
                      </span>
                    </div>
                  )}
                  {business.phone && (
                    <div className="admin-v2-card-row">
                      <span className="label">Phone:</span>
                      <span className="value">{business.phone}</span>
                    </div>
                  )}
                  {business.fax && (
                    <div className="admin-v2-card-row">
                      <span className="label">Fax:</span>
                      <span className="value">{business.fax}</span>
                    </div>
                  )}
                  {business.email && (
                    <div className="admin-v2-card-row">
                      <span className="label">Email:</span>
                      <span className="value">{business.email}</span>
                    </div>
                  )}
                  {business.website && (
                    <div className="admin-v2-card-row">
                      <span className="label">Website:</span>
                      <span className="value">
                        <a href={business.website} target="_blank" rel="noopener noreferrer">
                          {business.website.replace('https://', '').replace('http://', '')}
                        </a>
                      </span>
                    </div>
                  )}
                  {business.provider_count > 0 && (
                    <div className="admin-v2-card-row">
                      <span className="label">Providers:</span>
                      <span className="value">{business.provider_count}</span>
                    </div>
                  )}
                </div>

                <div className="admin-v2-card-actions">
                  {hasPermission('businesses.update') && (
                    <button 
                      className="admin-v2-action-btn admin-v2-action-btn-edit"
                      onClick={() => handleEdit(business)}
                    >
                      <EditIcon size={14} />
                      <span>Edit</span>
                    </button>
                  )}
                  {business.active ? (
                    hasPermission('businesses.delete') && (
                      <button 
                        className="admin-v2-action-btn admin-v2-action-btn-delete"
                        onClick={() => handleDelete(business.id)}
                      >
                        <TrashIcon size={14} />
                        <span>Deactivate</span>
                      </button>
                    )
                  ) : (
                    hasPermission('businesses.update') && (
                      <button 
                        className="admin-v2-action-btn admin-v2-action-btn-success"
                        onClick={() => handleActivate(business.id)}
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

        {/* Modals */}
        {showCreateModal && renderFormModal()}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Businesses;
