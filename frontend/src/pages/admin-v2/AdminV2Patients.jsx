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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import './AdminV2.css';

// Shared create/edit form body. Only one patient dialog is open at a time,
// so the field ids never collide in the DOM.
function PatientFormFields({ formData, setFormData }) {
  return (
    <>
      <FormRow>
        <Field label="First Name" required htmlFor="pf-first">
          <Input
            id="pf-first"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            required
            placeholder="John"
          />
        </Field>
        <Field label="Last Name" required htmlFor="pf-last">
          <Input
            id="pf-last"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            required
            placeholder="Doe"
          />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Date of Birth" htmlFor="pf-dob">
          <Input
            id="pf-dob"
            type="date"
            value={formData.date_of_birth}
            onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
          />
        </Field>
        <Field label="Medical Record Number" htmlFor="pf-mrn">
          <Input
            id="pf-mrn"
            value={formData.medical_record_number}
            onChange={(e) => setFormData({ ...formData, medical_record_number: e.target.value })}
            placeholder="MRN-12345"
          />
        </Field>
      </FormRow>

      <Field label="Notes" htmlFor="pf-notes">
        <Textarea
          id="pf-notes"
          rows={3}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Any additional notes about the patient..."
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox
          checked={formData.is_active}
          onCheckedChange={(v) => setFormData({ ...formData, is_active: v === true })}
        />
        <span className="text-sm text-foreground">Active</span>
      </label>
    </>
  );
}

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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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

        {/* Create Patient Dialog */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) setShowCreateModal(false); }}>
          <DialogContent className="sm:max-w-[600px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Add Patient</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreatePatient} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <PatientFormFields formData={formData} setFormData={setFormData} />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Creating...' : 'Create Patient'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Patient Dialog */}
        <Dialog open={showEditModal} onOpenChange={(o) => { if (!o) setShowEditModal(false); }}>
          <DialogContent className="sm:max-w-[600px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit Patient</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditPatient} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <PatientFormFields formData={formData} setFormData={setFormData} />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Deactivate Confirmation Dialog */}
        <Dialog open={showDeleteModal} onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Deactivate Patient</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground">
                Are you sure you want to deactivate{' '}
                <strong>{selectedPatient?.first_name} {selectedPatient?.last_name}</strong>?
              </p>
              <p className="text-muted-foreground">
                The patient record will be preserved but marked as inactive. You can reactivate the patient later.
              </p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeactivatePatient} disabled={saving}>
                {saving ? 'Deactivating...' : 'Deactivate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Patients;
