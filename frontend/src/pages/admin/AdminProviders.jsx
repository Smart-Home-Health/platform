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
import { useAdminPatient } from '../../contexts/AdminPatientContext';

const AdminProviders = () => {
  const { selectedPatientId, setPatientId } = useAdminPatient();
  const [providers, setProviders] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [patients, setPatients] = useState([]);
  const [currentPatientId, setCurrentPatientId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // 'active', 'inactive'
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [providerTypes, setProviderTypes] = useState([]);
  
  const [newProvider, setNewProvider] = useState({
    patient_id: '',
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

  useEffect(() => {
    fetchPatients();
    fetchCurrentPatient();
    fetchBusinesses();
    fetchProviderTypes();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      fetchProviders();
    }
  }, [activeTab, filterType, selectedPatientId]);

  const fetchCurrentPatient = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/patients/current`);
      if (response.ok) {
        const currentPatient = await response.json();
        setCurrentPatientId(currentPatient.id);
        
        // If no patient is selected in admin context, default to current patient
        if (!selectedPatientId && currentPatient.id) {
          setPatientId(String(currentPatient.id));
        }
      }
    } catch (error) {
      console.error('Error fetching current patient:', error);
    }
  };

  const fetchPatients = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/patients/`);
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  };

  const fetchProviders = async () => {
    if (!selectedPatientId) return;
    
    try {
      setLoading(true);
      let url = `${config.apiUrl}/api/providers/patient/${selectedPatientId}?active_only=${activeTab === 'active'}`;
      if (filterType) {
        url += `&provider_type=${encodeURIComponent(filterType)}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setProviders(data);
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBusinesses = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/businesses?active_only=true`);
      if (response.ok) {
        const data = await response.json();
        setBusinesses(data);
      }
    } catch (error) {
      console.error('Error fetching businesses:', error);
    }
  };

  const fetchProviderTypes = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/types`);
      if (response.ok) {
        const types = await response.json();
        setProviderTypes(types);
      }
    } catch (error) {
      console.error('Error fetching provider types:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatientId) {
      alert('Please select a patient first');
      return;
    }

    try {
      const providerData = {
        ...newProvider,
        patient_id: parseInt(selectedPatientId),
        business_id: newProvider.business_id ? parseInt(newProvider.business_id) : null
      };

      const endpoint = editingProvider 
        ? `${config.apiUrl}/api/providers/${editingProvider.id}`
        : `${config.apiUrl}/api/providers`;
      
      const method = editingProvider ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerData)
      });

      if (response.ok) {
        setShowAddForm(false);
        setEditingProvider(null);
        setNewProvider({
          patient_id: '',
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
        fetchProviders();
      }
    } catch (error) {
      console.error('Error saving provider:', error);
    }
  };

  const handleEdit = (provider) => {
    setNewProvider({
      ...provider,
      business_id: provider.business_id || ''
    });
    setEditingProvider(provider);
    setShowAddForm(true);
  };

  const handleDelete = async (providerId) => {
    if (window.confirm('Are you sure you want to deactivate this provider?')) {
      try {
        const response = await fetch(`${config.apiUrl}/api/providers/${providerId}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          fetchProviders();
        }
      } catch (error) {
        console.error('Error deleting provider:', error);
      }
    }
  };

  const handleActivate = async (providerId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/${providerId}/activate`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchProviders();
      }
    } catch (error) {
      console.error('Error activating provider:', error);
    }
  };

  const handleSetPrimary = async (providerId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/providers/${providerId}/set-primary`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchProviders();
      }
    } catch (error) {
      console.error('Error setting primary provider:', error);
    }
  };

  const filteredProviders = providers.filter(provider =>
    provider.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.specialty?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.provider_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (provider.business && provider.business.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const providerTypeOptions = [
    'medical', 'therapy', 'rehab', 'school', 'pharmacy', 'specialist', 
    'nursing', 'social_worker', 'case_manager', 'other'
  ];

  const selectedPatient = patients.find(p => p.id === parseInt(selectedPatientId));

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Provider Management</h1>
        <p className="admin-page-description">
          Manage healthcare providers, therapists, and other care team members
        </p>
      </div>

      <div className="patient-selector">
        <label>Select Patient:</label>
        <select
          value={selectedPatientId || ''}
          onChange={(e) => setPatientId(e.target.value)}
          className="patient-select"
        >
          <option value="">Choose a patient...</option>
          {patients.map(patient => (
            <option key={patient.id} value={patient.id}>
              {patient.first_name} {patient.last_name}
              {patient.id === currentPatientId && ' (Current)'}
            </option>
          ))}
        </select>
      </div>

      {selectedPatientId ? (
        <>
          <div className="admin-controls">
            <div className="admin-tabs">
              <button 
                className={`tab ${activeTab === 'active' ? 'active' : ''}`}
                onClick={() => setActiveTab('active')}
              >
                Active Providers ({providers.filter(p => p.active).length})
              </button>
              <button 
                className={`tab ${activeTab === 'inactive' ? 'active' : ''}`}
                onClick={() => setActiveTab('inactive')}
              >
                Inactive Providers ({providers.filter(p => !p.active).length})
              </button>
            </div>

            <div className="admin-filters">
              <input
                type="text"
                placeholder="Search providers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="filter-select"
              >
                <option value="">All Types</option>
                {providerTypes.map(type => (
                  <option key={type} value={type}>{type.replace('_', ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>

            <button 
              className="btn btn-primary"
              onClick={() => {
                setShowAddForm(true);
                setEditingProvider(null);
                setNewProvider({
                  patient_id: '',
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
              }}
            >
              Add Provider
            </button>
          </div>

      {showAddForm && (
        <div className="provider-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowAddForm(false);
            setEditingProvider(null);
          }
        }}>
          <div className="provider-modal-container">
            <form onSubmit={handleSubmit} className="provider-form">
              <h3>
                {editingProvider ? 'Edit Provider' : 'Add New Provider'}
                <button 
                  type="button" 
                  className="modal-close-btn"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingProvider(null);
                  }}
                >
                  ×
                </button>
              </h3>                  <div className="form-grid">
                    <div className="form-group">
                      <label>First Name *</label>
                      <input
                        type="text"
                        value={newProvider.first_name}
                        onChange={(e) => setNewProvider({ ...newProvider, first_name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Last Name *</label>
                      <input
                        type="text"
                        value={newProvider.last_name}
                        onChange={(e) => setNewProvider({ ...newProvider, last_name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Title</label>
                      <input
                        type="text"
                        value={newProvider.title}
                        onChange={(e) => setNewProvider({ ...newProvider, title: e.target.value })}
                        placeholder="Dr., RN, PT, OT, etc."
                      />
                    </div>

                    <div className="form-group">
                      <label>Provider Type *</label>
                      <select
                        value={newProvider.provider_type}
                        onChange={(e) => setNewProvider({ ...newProvider, provider_type: e.target.value })}
                        required
                      >
                        {providerTypeOptions.map(type => (
                          <option key={type} value={type}>
                            {type.replace('_', ' ').toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Specialty</label>
                      <input
                        type="text"
                        value={newProvider.specialty}
                        onChange={(e) => setNewProvider({ ...newProvider, specialty: e.target.value })}
                        placeholder="Cardiologist, Physical Therapist, etc."
                      />
                    </div>

                    <div className="form-group">
                      <label>Associated Business</label>
                      <select
                        value={newProvider.business_id}
                        onChange={(e) => setNewProvider({ ...newProvider, business_id: e.target.value })}
                      >
                        <option value="">No Business Association</option>
                        {businesses.map(business => (
                          <option key={business.id} value={business.id}>
                            {business.name} ({business.business_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Phone</label>
                      <input
                        type="tel"
                        value={newProvider.phone}
                        onChange={(e) => setNewProvider({ ...newProvider, phone: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={newProvider.email}
                        onChange={(e) => setNewProvider({ ...newProvider, email: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Fax</label>
                      <input
                        type="tel"
                        value={newProvider.fax}
                        onChange={(e) => setNewProvider({ ...newProvider, fax: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>License Number</label>
                      <input
                        type="text"
                        value={newProvider.license_number}
                        onChange={(e) => setNewProvider({ ...newProvider, license_number: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>NPI Number</label>
                      <input
                        type="text"
                        value={newProvider.npi_number}
                        onChange={(e) => setNewProvider({ ...newProvider, npi_number: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Department</label>
                      <input
                        type="text"
                        value={newProvider.department}
                        onChange={(e) => setNewProvider({ ...newProvider, department: e.target.value })}
                      />
                    </div>

                    <div className="form-group full-width">
                      <label>Notes</label>
                      <textarea
                        value={newProvider.notes}
                        onChange={(e) => setNewProvider({ ...newProvider, notes: e.target.value })}
                        rows="3"
                      />
                    </div>

                    <div className="form-group checkbox-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={newProvider.is_primary}
                          onChange={(e) => setNewProvider({ ...newProvider, is_primary: e.target.checked })}
                        />
                        Primary provider for this type
                      </label>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      {editingProvider ? 'Update Provider' : 'Add Provider'}
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowAddForm(false);
                        setEditingProvider(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="providers-grid">
            {loading ? (
              <div className="loading">Loading providers...</div>
            ) : filteredProviders.length === 0 ? (
              <div className="no-data">
                {searchTerm ? 'No providers found matching your search.' : 'No providers found for this patient.'}
              </div>
            ) : (
              filteredProviders.map(provider => (
                <div key={provider.id} className="provider-card">
                  <div className="provider-header">
                    <h3>
                      {provider.title} {provider.first_name} {provider.last_name}
                      {provider.is_primary && <span className="primary-badge">PRIMARY</span>}
                    </h3>
                    <span className={`provider-type ${provider.provider_type}`}>
                      {provider.provider_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="provider-info">
                    {provider.specialty && (
                      <div className="info-item">
                        <strong>Specialty:</strong> {provider.specialty}
                      </div>
                    )}
                    {provider.business && (
                      <div className="info-item">
                        <strong>Business:</strong> {provider.business.name}
                      </div>
                    )}
                    {provider.department && (
                      <div className="info-item">
                        <strong>Department:</strong> {provider.department}
                      </div>
                    )}
                    {provider.phone && (
                      <div className="info-item">
                        <strong>Phone:</strong> {provider.phone}
                      </div>
                    )}
                    {provider.email && (
                      <div className="info-item">
                        <strong>Email:</strong> {provider.email}
                      </div>
                    )}
                    {provider.license_number && (
                      <div className="info-item">
                        <strong>License:</strong> {provider.license_number}
                      </div>
                    )}
                    {provider.notes && (
                      <div className="info-item">
                        <strong>Notes:</strong> {provider.notes}
                      </div>
                    )}
                  </div>

                  <div className="provider-actions">
                    <button 
                      className="btn btn-sm btn-primary"
                      onClick={() => handleEdit(provider)}
                    >
                      Edit
                    </button>
                    {!provider.is_primary && provider.active && (
                      <button 
                        className="btn btn-sm btn-info"
                        onClick={() => handleSetPrimary(provider.id)}
                      >
                        Set Primary
                      </button>
                    )}
                    {provider.active ? (
                      <button 
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(provider.id)}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button 
                        className="btn btn-sm btn-success"
                        onClick={() => handleActivate(provider.id)}
                      >
                        Activate
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="no-patient-selected">
          <p>Please select a patient to view and manage their providers.</p>
        </div>
      )}
    </div>
  );
};

export default AdminProviders;
