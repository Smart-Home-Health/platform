import React, { useState, useEffect } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  PatientsIcon,
  SearchIcon,
  CheckIcon,
  RefreshIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2Patients = () => {
  const { user } = useAuth();
  
  // Patients state
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    medical_record_number: '',
    notes: '',
    is_active: true
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Fetch patients on mount and when filter changes
  useEffect(() => {
    fetchPatients();
  }, [showInactive]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `${config.apiUrl}/api/patients?active_only=${!showInactive}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      } else {
        setError('Failed to load patients');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching patients:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      date_of_birth: '',
      medical_record_number: '',
      notes: '',
      is_active: true
    });
    setFormError(null);
  };

  const handleCreatePatient = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    
    try {
      const payload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        is_active: formData.is_active
      };
      
      if (formData.date_of_birth) {
        payload.date_of_birth = formData.date_of_birth;
      }
      if (formData.medical_record_number) {
        payload.medical_record_number = formData.medical_record_number;
      }
      if (formData.notes) {
        payload.notes = formData.notes;
      }
      
      const response = await fetch(`${config.apiUrl}/api/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchPatients();
      } else {
        const errorData = await response.json();
        setFormError(errorData.detail || 'Failed to create patient');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleEditPatient = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    
    try {
      const payload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        is_active: formData.is_active
      };
      
      if (formData.date_of_birth) {
        payload.date_of_birth = formData.date_of_birth;
      }
      if (formData.medical_record_number) {
        payload.medical_record_number = formData.medical_record_number;
      }
      payload.notes = formData.notes || null;
      
      const response = await fetch(`${config.apiUrl}/api/patients/${selectedPatient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        setShowEditModal(false);
        setSelectedPatient(null);
        resetForm();
        fetchPatients();
      } else {
        const errorData = await response.json();
        setFormError(errorData.detail || 'Failed to update patient');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivatePatient = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/patients/${selectedPatient.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        setShowDeleteModal(false);
        setSelectedPatient(null);
        fetchPatients();
      } else {
        alert('Failed to deactivate patient');
      }
    } catch (err) {
      alert('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleActivatePatient = async (patient) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/patients/${patient.id}/activate`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        fetchPatients();
      } else {
        alert('Failed to activate patient');
      }
    } catch (err) {
      alert('Error connecting to server');
    }
  };

  const openEditModal = (patient) => {
    setSelectedPatient(patient);
    setFormData({
      first_name: patient.first_name,
      last_name: patient.last_name,
      date_of_birth: patient.date_of_birth ? patient.date_of_birth.split('T')[0] : '',
      medical_record_number: patient.medical_record_number || '',
      notes: patient.notes || '',
      is_active: patient.is_active
    });
    setShowEditModal(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const getAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const getInitials = (firstName, lastName) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  // Filter patients by search query
  const filteredPatients = patients.filter(patient => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      patient.first_name.toLowerCase().includes(query) ||
      patient.last_name.toLowerCase().includes(query) ||
      (patient.medical_record_number && patient.medical_record_number.toLowerCase().includes(query))
    );
  });

  // Stats
  const stats = {
    total: patients.length,
    active: patients.filter(p => p.is_active).length,
    inactive: patients.filter(p => !p.is_active).length
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {/* Page Header */}
        <div className="admin-v2-page-header">
          <div className="admin-v2-header-content">
            <div className="admin-v2-header-icon">
              <PatientsIcon size={32} />
            </div>
            <div className="admin-v2-header-text">
              <h1>Patients</h1>
              <p>Manage patient records and health information</p>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="admin-v2-stats-row">
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon" style={{ background: 'rgba(88, 166, 255, 0.15)' }}>
              <PatientsIcon size={20} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{stats.total}</h4>
              <p>Total Patients</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon" style={{ background: 'rgba(63, 185, 80, 0.15)' }}>
              <CheckIcon size={20} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{stats.active}</h4>
              <p>Active</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon" style={{ background: 'rgba(139, 148, 158, 0.15)' }}>
              <XIcon size={20} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{stats.inactive}</h4>
              <p>Inactive</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="admin-v2-filter-bar">
          <div className="admin-v2-search-box">
            <SearchIcon size={16} />
            <input
              type="text"
              placeholder="Search by name or MRN..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="admin-v2-search-clear" onClick={() => setSearchQuery('')}>
                <XIcon size={14} />
              </button>
            )}
          </div>
          <label className="admin-v2-checkbox">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
            />
            <span>Show inactive patients</span>
          </label>
          <button
            className="admin-v2-btn admin-v2-btn-sm"
            onClick={fetchPatients}
            disabled={loading}
          >
            <RefreshIcon size={14} /> Refresh
          </button>
          {hasPermission('patients.create') && (
            <button
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={() => { resetForm(); setShowCreateModal(true); }}
            >
              <PlusIcon size={16} /> Add Patient
            </button>
          )}
        </div>

        {/* Patients Table */}
        {loading ? (
          <div className="admin-v2-loading">Loading patients...</div>
        ) : error ? (
          <div className="admin-v2-error">{error}</div>
        ) : filteredPatients.length === 0 ? (
          <div className="admin-v2-empty-state">
            <PatientsIcon size={48} />
            <h3>No Patients Found</h3>
            <p className="admin-v2-text-muted">
              {searchQuery 
                ? 'No patients match your search criteria'
                : 'Add a patient to get started'}
            </p>
            {hasPermission('patients.create') && !searchQuery && (
              <button
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={() => { resetForm(); setShowCreateModal(true); }}
              >
                <PlusIcon size={16} /> Add Patient
              </button>
            )}
          </div>
        ) : (
          <div className="admin-v2-table-container">
            <table className="admin-v2-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>MRN</th>
                  <th>Date of Birth</th>
                  <th>Age</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map(patient => {
                  const age = getAge(patient.date_of_birth);
                  
                  return (
                    <tr key={patient.id} className={!patient.is_active ? 'admin-v2-row-inactive' : ''}>
                      <td>
                        <div className="admin-v2-patient-cell">
                          <div className="admin-v2-patient-avatar-sm">
                            {getInitials(patient.first_name, patient.last_name)}
                          </div>
                          <span className="admin-v2-patient-name">
                            {patient.first_name} {patient.last_name}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="admin-v2-mrn">
                          {patient.medical_record_number || '-'}
                        </span>
                      </td>
                      <td>{formatDate(patient.date_of_birth)}</td>
                      <td>{age !== null ? `${age} yrs` : '-'}</td>
                      <td>
                        {patient.is_active ? (
                          <span className="admin-v2-badge admin-v2-badge-success">Active</span>
                        ) : (
                          <span className="admin-v2-badge admin-v2-badge-secondary">Inactive</span>
                        )}
                      </td>
                      <td>
                        <span className="admin-v2-notes-preview">
                          {patient.notes ? (patient.notes.length > 50 ? patient.notes.substring(0, 50) + '...' : patient.notes) : '-'}
                        </span>
                      </td>
                      <td>
                        <div className="admin-v2-action-buttons">
                          {!patient.is_active && hasPermission('patients.update') && (
                            <button
                              className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-success"
                              onClick={() => handleActivatePatient(patient)}
                              title="Activate"
                            >
                              Activate
                            </button>
                          )}
                          {hasPermission('patients.update') && (
                            <button
                              className="admin-v2-btn admin-v2-btn-sm"
                              onClick={() => openEditModal(patient)}
                              title="Edit"
                            >
                              <EditIcon size={14} />
                            </button>
                          )}
                          {patient.is_active && hasPermission('patients.delete') && (
                            <button
                              className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-danger"
                              onClick={() => { setSelectedPatient(patient); setShowDeleteModal(true); }}
                              title="Deactivate"
                            >
                              <TrashIcon size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Create Patient Modal */}
        {showCreateModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-lg" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Add Patient</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCreateModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleCreatePatient}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>First Name *</label>
                      <input
                        type="text"
                        value={formData.first_name}
                        onChange={e => setFormData({...formData, first_name: e.target.value})}
                        required
                        placeholder="John"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Last Name *</label>
                      <input
                        type="text"
                        value={formData.last_name}
                        onChange={e => setFormData({...formData, last_name: e.target.value})}
                        required
                        placeholder="Doe"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Date of Birth</label>
                      <input
                        type="date"
                        value={formData.date_of_birth}
                        onChange={e => setFormData({...formData, date_of_birth: e.target.value})}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Medical Record Number</label>
                      <input
                        type="text"
                        value={formData.medical_record_number}
                        onChange={e => setFormData({...formData, medical_record_number: e.target.value})}
                        placeholder="MRN-12345"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                      placeholder="Any additional notes about the patient..."
                      rows={3}
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label className="admin-v2-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={e => setFormData({...formData, is_active: e.target.checked})}
                      />
                      <span>Active</span>
                    </label>
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button type="button" className="admin-v2-btn" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="admin-v2-btn admin-v2-btn-primary" disabled={saving}>
                    {saving ? 'Creating...' : 'Create Patient'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Patient Modal */}
        {showEditModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-lg" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Edit Patient</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowEditModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleEditPatient}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>First Name *</label>
                      <input
                        type="text"
                        value={formData.first_name}
                        onChange={e => setFormData({...formData, first_name: e.target.value})}
                        required
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Last Name *</label>
                      <input
                        type="text"
                        value={formData.last_name}
                        onChange={e => setFormData({...formData, last_name: e.target.value})}
                        required
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Date of Birth</label>
                      <input
                        type="date"
                        value={formData.date_of_birth}
                        onChange={e => setFormData({...formData, date_of_birth: e.target.value})}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Medical Record Number</label>
                      <input
                        type="text"
                        value={formData.medical_record_number}
                        onChange={e => setFormData({...formData, medical_record_number: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                      placeholder="Any additional notes about the patient..."
                      rows={3}
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label className="admin-v2-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={e => setFormData({...formData, is_active: e.target.checked})}
                      />
                      <span>Active</span>
                    </label>
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button type="button" className="admin-v2-btn" onClick={() => setShowEditModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="admin-v2-btn admin-v2-btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Deactivate Confirmation Modal */}
        {showDeleteModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Deactivate Patient</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowDeleteModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                <p>Are you sure you want to deactivate <strong>{selectedPatient?.first_name} {selectedPatient?.last_name}</strong>?</p>
                <p className="admin-v2-text-muted">The patient record will be preserved but marked as inactive. You can reactivate the patient later.</p>
              </div>
              <div className="admin-v2-modal-footer">
                <button className="admin-v2-btn" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </button>
                <button className="admin-v2-btn admin-v2-btn-danger" onClick={handleDeactivatePatient} disabled={saving}>
                  {saving ? 'Deactivating...' : 'Deactivate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Patients;
