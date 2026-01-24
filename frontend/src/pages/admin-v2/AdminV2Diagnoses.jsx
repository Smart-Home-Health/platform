import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  CheckIcon,
  ClipboardListIcon,
  NotesIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2Diagnoses = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);
  
  // Diagnoses state
  const [diagnoses, setDiagnoses] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter state
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  
  // Lookup data
  const [diagnosisTypes, setDiagnosisTypes] = useState([]);
  const [diagnosisStatuses, setDiagnosisStatuses] = useState([]);
  const [diagnosisCategories, setDiagnosisCategories] = useState([]);
  const [severityLevels, setSeverityLevels] = useState([]);
  const [noteTypes, setNoteTypes] = useState([]);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    icd10_code: '',
    icd10_description: '',
    diagnosis_type: 'primary',
    category: '',
    severity: '',
    status: 'active',
    onset_date: '',
    diagnosis_date: '',
    resolved_date: '',
    diagnosing_provider_id: '',
    managing_provider_id: '',
    notes: '',
    treatment_plan: '',
    is_primary_diagnosis: false
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Notes state
  const [diagnosisNotes, setDiagnosisNotes] = useState([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteType, setNewNoteType] = useState('follow_up');
  const [newNoteProviderId, setNewNoteProviderId] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Permission helper - diagnoses permissions fall back to providers permissions
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    if (user.permissions?.includes(permission)) return true;
    // Fallback: map diagnoses permissions to providers permissions
    if (permission.startsWith('diagnoses.')) {
      const providerPermission = permission.replace('diagnoses.', 'providers.');
      return user.permissions?.includes(providerPermission) || false;
    }
    return false;
  };

  // Fetch lookup data on mount
  useEffect(() => {
    fetchLookupData();
  }, []);

  // Check URL params for patient ID
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient && patient.id !== contextPatient?.id) {
        setContextPatient(patient);
      }
    } else if (!patientId && !contextPatient && patients.length > 0 && !loadingPatients) {
      setShowPatientModal(true);
    }
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

  // Fetch diagnoses when patient changes
  useEffect(() => {
    if (selectedPatient) {
      fetchDiagnoses();
      fetchProviders();
    }
  }, [selectedPatient, activeTab, filterStatus, filterCategory]);

  const fetchLookupData = async () => {
    try {
      const [typesRes, statusesRes, categoriesRes, severityRes, noteTypesRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/diagnoses/types`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/diagnoses/statuses`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/diagnoses/categories`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/diagnoses/severity-levels`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/diagnoses/note-types`, { credentials: 'include' })
      ]);
      
      if (typesRes.ok) setDiagnosisTypes(await typesRes.json());
      if (statusesRes.ok) setDiagnosisStatuses(await statusesRes.json());
      if (categoriesRes.ok) setDiagnosisCategories(await categoriesRes.json());
      if (severityRes.ok) setSeverityLevels(await severityRes.json());
      if (noteTypesRes.ok) setNoteTypes(await noteTypesRes.json());
    } catch (err) {
      console.error('Error fetching lookup data:', err);
    }
  };

  const fetchDiagnoses = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      let url = `${config.apiUrl}/api/diagnoses/patient/${selectedPatient.id}?active_only=${activeTab === 'active'}`;
      if (filterStatus) url += `&status=${encodeURIComponent(filterStatus)}`;
      if (filterCategory) url += `&category=${encodeURIComponent(filterCategory)}`;
      
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        setDiagnoses(await response.json());
      } else {
        setError('Failed to load diagnoses');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching diagnoses:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProviders = async () => {
    if (!selectedPatient) return;
    
    try {
      const response = await fetch(
        `${config.apiUrl}/api/providers/patient/${selectedPatient.id}?active_only=true`,
        { credentials: 'include' }
      );
      if (response.ok) {
        setProviders(await response.json());
      }
    } catch (err) {
      console.error('Error fetching providers:', err);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setShowPatientModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;

    try {
      setSaving(true);
      setFormError(null);

      const diagnosisData = {
        ...formData,
        patient_id: selectedPatient.id,
        diagnosing_provider_id: formData.diagnosing_provider_id ? parseInt(formData.diagnosing_provider_id) : null,
        managing_provider_id: formData.managing_provider_id ? parseInt(formData.managing_provider_id) : null,
        onset_date: formData.onset_date || null,
        diagnosis_date: formData.diagnosis_date || null,
        resolved_date: formData.resolved_date || null,
        category: formData.category || null,
        severity: formData.severity || null
      };

      const endpoint = selectedDiagnosis 
        ? `${config.apiUrl}/api/diagnoses/${selectedDiagnosis.id}`
        : `${config.apiUrl}/api/diagnoses`;
      
      const method = selectedDiagnosis ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(diagnosisData)
      });

      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchDiagnoses();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to save diagnosis');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (diagnosis) => {
    setFormData({
      name: diagnosis.name || '',
      icd10_code: diagnosis.icd10_code || '',
      icd10_description: diagnosis.icd10_description || '',
      diagnosis_type: diagnosis.diagnosis_type || 'primary',
      category: diagnosis.category || '',
      severity: diagnosis.severity || '',
      status: diagnosis.status || 'active',
      onset_date: diagnosis.onset_date || '',
      diagnosis_date: diagnosis.diagnosis_date || '',
      resolved_date: diagnosis.resolved_date || '',
      diagnosing_provider_id: diagnosis.diagnosing_provider_id || '',
      managing_provider_id: diagnosis.managing_provider_id || '',
      notes: diagnosis.notes || '',
      treatment_plan: diagnosis.treatment_plan || '',
      is_primary_diagnosis: diagnosis.is_primary_diagnosis || false
    });
    setSelectedDiagnosis(diagnosis);
    setShowCreateModal(true);
  };

  const handleDelete = async (diagnosisId) => {
    if (!confirm('Are you sure you want to deactivate this diagnosis?')) return;
    
    try {
      const response = await fetch(`${config.apiUrl}/api/diagnoses/${diagnosisId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        fetchDiagnoses();
      }
    } catch (err) {
      console.error('Error deleting diagnosis:', err);
    }
  };

  const handleActivate = async (diagnosisId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/diagnoses/${diagnosisId}/activate`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        fetchDiagnoses();
      }
    } catch (err) {
      console.error('Error activating diagnosis:', err);
    }
  };

  const handleSetPrimary = async (diagnosisId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/diagnoses/${diagnosisId}/set-primary`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        fetchDiagnoses();
      }
    } catch (err) {
      console.error('Error setting primary diagnosis:', err);
    }
  };

  const openNotesModal = async (diagnosis) => {
    setSelectedDiagnosis(diagnosis);
    setShowNotesModal(true);
    
    try {
      const response = await fetch(
        `${config.apiUrl}/api/diagnoses/${diagnosis.id}/notes`,
        { credentials: 'include' }
      );
      if (response.ok) {
        setDiagnosisNotes(await response.json());
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  };

  const handleAddNote = async () => {
    if (!newNoteContent.trim() || !selectedDiagnosis) return;
    
    try {
      setAddingNote(true);
      const response = await fetch(
        `${config.apiUrl}/api/diagnoses/${selectedDiagnosis.id}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            diagnosis_id: selectedDiagnosis.id,
            note_type: newNoteType,
            content: newNoteContent,
            provider_id: newNoteProviderId ? parseInt(newNoteProviderId) : null
          })
        }
      );
      
      if (response.ok) {
        const note = await response.json();
        setDiagnosisNotes([note, ...diagnosisNotes]);
        setNewNoteContent('');
        setNewNoteType('follow_up');
        setNewNoteProviderId('');
        fetchDiagnoses(); // Refresh to update note count
      }
    } catch (err) {
      console.error('Error adding note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    
    try {
      const response = await fetch(`${config.apiUrl}/api/diagnoses/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        setDiagnosisNotes(diagnosisNotes.filter(n => n.id !== noteId));
        fetchDiagnoses();
      }
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      icd10_code: '',
      icd10_description: '',
      diagnosis_type: 'primary',
      category: '',
      severity: '',
      status: 'active',
      onset_date: '',
      diagnosis_date: '',
      resolved_date: '',
      diagnosing_provider_id: '',
      managing_provider_id: '',
      notes: '',
      treatment_plan: '',
      is_primary_diagnosis: false
    });
    setFormError(null);
    setSelectedDiagnosis(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const filteredDiagnoses = diagnoses.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.icd10_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadgeClass = (status) => {
    const statusClasses = {
      active: 'admin-v2-badge-success',
      resolved: 'admin-v2-badge-muted',
      chronic: 'admin-v2-badge-warning',
      in_remission: 'admin-v2-badge-info',
      ruled_out: 'admin-v2-badge-danger'
    };
    return statusClasses[status] || 'admin-v2-badge-muted';
  };

  const getSeverityBadgeClass = (severity) => {
    const severityClasses = {
      mild: 'admin-v2-badge-success',
      moderate: 'admin-v2-badge-warning',
      severe: 'admin-v2-badge-danger',
      critical: 'admin-v2-badge-critical'
    };
    return severityClasses[severity] || 'admin-v2-badge-muted';
  };

  const formatLabel = (str) => {
    if (!str) return '';
    return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

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
          <h3>{selectedDiagnosis ? 'Edit Diagnosis' : 'Add New Diagnosis'}</h3>
          <button 
            className="admin-v2-modal-close"
            onClick={() => { setShowCreateModal(false); resetForm(); }}
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
              <div className="admin-v2-form-group admin-v2-form-full">
                <label>Diagnosis Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Type 2 Diabetes Mellitus"
                  required
                />
              </div>

              <div className="admin-v2-form-group">
                <label>ICD-10 Code</label>
                <input
                  type="text"
                  value={formData.icd10_code}
                  onChange={(e) => setFormData({ ...formData, icd10_code: e.target.value })}
                  placeholder="e.g., E11.9"
                />
              </div>

              <div className="admin-v2-form-group">
                <label>ICD-10 Description</label>
                <input
                  type="text"
                  value={formData.icd10_description}
                  onChange={(e) => setFormData({ ...formData, icd10_description: e.target.value })}
                  placeholder="Official ICD-10 description"
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Diagnosis Type *</label>
                <select
                  value={formData.diagnosis_type}
                  onChange={(e) => setFormData({ ...formData, diagnosis_type: e.target.value })}
                  required
                >
                  {diagnosisTypes.map(type => (
                    <option key={type} value={type}>{formatLabel(type)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-v2-form-group">
                <label>Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="">Select Category</option>
                  {diagnosisCategories.map(cat => (
                    <option key={cat} value={cat}>{formatLabel(cat)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-v2-form-group">
                <label>Severity</label>
                <select
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                >
                  <option value="">Select Severity</option>
                  {severityLevels.map(level => (
                    <option key={level} value={level}>{formatLabel(level)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-v2-form-group">
                <label>Status *</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  required
                >
                  {diagnosisStatuses.map(status => (
                    <option key={status} value={status}>{formatLabel(status)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-v2-form-group">
                <label>Onset Date</label>
                <input
                  type="date"
                  value={formData.onset_date}
                  onChange={(e) => setFormData({ ...formData, onset_date: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Diagnosis Date</label>
                <input
                  type="date"
                  value={formData.diagnosis_date}
                  onChange={(e) => setFormData({ ...formData, diagnosis_date: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Resolved Date</label>
                <input
                  type="date"
                  value={formData.resolved_date}
                  onChange={(e) => setFormData({ ...formData, resolved_date: e.target.value })}
                />
              </div>

              <div className="admin-v2-form-group">
                <label>Diagnosing Provider</label>
                <select
                  value={formData.diagnosing_provider_id}
                  onChange={(e) => setFormData({ ...formData, diagnosing_provider_id: e.target.value })}
                >
                  <option value="">Select Provider</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} {p.first_name} {p.last_name} ({p.specialty || p.provider_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-v2-form-group">
                <label>Managing Provider</label>
                <select
                  value={formData.managing_provider_id}
                  onChange={(e) => setFormData({ ...formData, managing_provider_id: e.target.value })}
                >
                  <option value="">Select Provider</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} {p.first_name} {p.last_name} ({p.specialty || p.provider_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-v2-form-group admin-v2-form-full">
                <label>Clinical Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="3"
                  placeholder="Additional clinical notes..."
                />
              </div>

              <div className="admin-v2-form-group admin-v2-form-full">
                <label>Treatment Plan</label>
                <textarea
                  value={formData.treatment_plan}
                  onChange={(e) => setFormData({ ...formData, treatment_plan: e.target.value })}
                  rows="3"
                  placeholder="Brief treatment approach..."
                />
              </div>

              <div className="admin-v2-form-group admin-v2-form-full">
                <label className="admin-v2-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.is_primary_diagnosis}
                    onChange={(e) => setFormData({ ...formData, is_primary_diagnosis: e.target.checked })}
                  />
                  Primary/Principal Diagnosis
                </label>
              </div>
            </div>
          </div>
          <div className="admin-v2-modal-footer">
            <button 
              type="button" 
              className="admin-v2-btn admin-v2-btn-secondary"
              onClick={() => { setShowCreateModal(false); resetForm(); }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="admin-v2-btn admin-v2-btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : (selectedDiagnosis ? 'Update Diagnosis' : 'Add Diagnosis')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Notes modal
  const renderNotesModal = () => (
    <div className="admin-v2-modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) {
        setShowNotesModal(false);
        setSelectedDiagnosis(null);
        setDiagnosisNotes([]);
      }
    }}>
      <div className="admin-v2-modal admin-v2-modal-lg">
        <div className="admin-v2-modal-header">
          <h3>Follow-up Notes: {selectedDiagnosis?.name}</h3>
          <button 
            className="admin-v2-modal-close"
            onClick={() => {
              setShowNotesModal(false);
              setSelectedDiagnosis(null);
              setDiagnosisNotes([]);
            }}
          >
            <XIcon size={20} />
          </button>
        </div>
        <div className="admin-v2-modal-body">
          {/* Add Note Form */}
          <div className="admin-v2-notes-form">
            <div className="admin-v2-form-grid">
              <div className="admin-v2-form-group">
                <label>Note Type</label>
                <select
                  value={newNoteType}
                  onChange={(e) => setNewNoteType(e.target.value)}
                >
                  {noteTypes.map(type => (
                    <option key={type} value={type}>{formatLabel(type)}</option>
                  ))}
                </select>
              </div>
              <div className="admin-v2-form-group">
                <label>Provider (Optional)</label>
                <select
                  value={newNoteProviderId}
                  onChange={(e) => setNewNoteProviderId(e.target.value)}
                >
                  <option value="">Select Provider</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} {p.first_name} {p.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-v2-form-group admin-v2-form-full">
                <label>Note Content</label>
                <textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  rows="3"
                  placeholder="Enter note content..."
                />
              </div>
            </div>
            <button 
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={handleAddNote}
              disabled={addingNote || !newNoteContent.trim()}
            >
              {addingNote ? 'Adding...' : 'Add Note'}
            </button>
          </div>

          {/* Notes List */}
          <div className="admin-v2-notes-list">
            {diagnosisNotes.length === 0 ? (
              <div className="admin-v2-empty-state admin-v2-empty-state-sm">
                <p>No notes yet for this diagnosis.</p>
              </div>
            ) : (
              diagnosisNotes.map(note => (
                <div key={note.id} className="admin-v2-note-card">
                  <div className="admin-v2-note-header">
                    <div className="admin-v2-note-meta">
                      <span className={`admin-v2-badge admin-v2-badge-${note.note_type}`}>
                        {formatLabel(note.note_type)}
                      </span>
                      {note.provider_name && (
                        <span className="admin-v2-note-provider">{note.provider_name}</span>
                      )}
                      <span className="admin-v2-note-date">
                        {new Date(note.created_at).toLocaleString()}
                      </span>
                    </div>
                    <button 
                      className="admin-v2-action-btn admin-v2-action-btn-delete"
                      onClick={() => handleDeleteNote(note.id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                  <div className="admin-v2-note-content">
                    {note.content}
                  </div>
                  {note.created_by_name && (
                    <div className="admin-v2-note-footer">
                      Added by: {note.created_by_name}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            <h1 className="schedule-section-title">Diagnoses</h1>

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
                  Active ({diagnoses.filter(d => d.active).length})
                </button>
                <button 
                  className={`admin-v2-tab ${activeTab === 'inactive' ? 'active' : ''}`}
                  onClick={() => setActiveTab('inactive')}
                >
                  Inactive ({diagnoses.filter(d => !d.active).length})
                </button>
              </div>

              <div className="admin-v2-filters">
                <input
                  type="text"
                  placeholder="Search diagnoses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="admin-v2-search-input"
                />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="admin-v2-filter-select"
                >
                  <option value="">All Statuses</option>
                  {diagnosisStatuses.map(status => (
                    <option key={status} value={status}>{formatLabel(status)}</option>
                  ))}
                </select>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="admin-v2-filter-select"
                >
                  <option value="">All Categories</option>
                  {diagnosisCategories.map(cat => (
                    <option key={cat} value={cat}>{formatLabel(cat)}</option>
                  ))}
                </select>
              </div>

              {hasPermission('diagnoses.create') && (
                <button 
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={openCreateModal}
                >
                  <PlusIcon size={16} /> Add Diagnosis
                </button>
              )}
            </div>

            {/* Diagnoses Cards Grid */}
            {loading ? (
              <div className="admin-v2-loading">Loading diagnoses...</div>
            ) : filteredDiagnoses.length === 0 ? (
              <div className="admin-v2-empty-state">
                <ClipboardListIcon size={48} />
                <h3>{searchTerm ? 'No diagnoses found matching your search.' : 'No diagnoses found for this patient.'}</h3>
                {hasPermission('diagnoses.create') && (
                  <button 
                    className="admin-v2-btn admin-v2-btn-primary"
                    onClick={openCreateModal}
                  >
                    <PlusIcon size={16} /> Add First Diagnosis
                  </button>
                )}
              </div>
            ) : (
              <div className="admin-v2-cards-grid">
                {filteredDiagnoses.map(diagnosis => (
                  <div key={diagnosis.id} className={`admin-v2-card ${!diagnosis.active ? 'inactive' : ''}`}>
                    <div className="admin-v2-card-header">
                      <div className="admin-v2-card-title-row">
                        <h3>{diagnosis.name}</h3>
                        {diagnosis.is_primary_diagnosis && (
                          <span className="admin-v2-badge admin-v2-badge-primary">PRIMARY</span>
                        )}
                      </div>
                      <div className="admin-v2-card-badges">
                        <span className={`admin-v2-badge ${getStatusBadgeClass(diagnosis.status)}`}>
                          {formatLabel(diagnosis.status)}
                        </span>
                        {diagnosis.severity && (
                          <span className={`admin-v2-badge ${getSeverityBadgeClass(diagnosis.severity)}`}>
                            {formatLabel(diagnosis.severity)}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="admin-v2-card-body">
                      {diagnosis.icd10_code && (
                        <div className="admin-v2-card-row">
                          <span className="label">ICD-10:</span>
                          <span className="value">{diagnosis.icd10_code}</span>
                        </div>
                      )}
                      {diagnosis.diagnosis_type && (
                        <div className="admin-v2-card-row">
                          <span className="label">Type:</span>
                          <span className="value">{formatLabel(diagnosis.diagnosis_type)}</span>
                        </div>
                      )}
                      {diagnosis.category && (
                        <div className="admin-v2-card-row">
                          <span className="label">Category:</span>
                          <span className="value">{formatLabel(diagnosis.category)}</span>
                        </div>
                      )}
                      {diagnosis.diagnosis_date && (
                        <div className="admin-v2-card-row">
                          <span className="label">Diagnosed:</span>
                          <span className="value">
                            {new Date(diagnosis.diagnosis_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {diagnosis.diagnosing_provider_name && (
                        <div className="admin-v2-card-row">
                          <span className="label">Diagnosed by:</span>
                          <span className="value">{diagnosis.diagnosing_provider_name}</span>
                        </div>
                      )}
                      {diagnosis.managing_provider_name && (
                        <div className="admin-v2-card-row">
                          <span className="label">Managed by:</span>
                          <span className="value">{diagnosis.managing_provider_name}</span>
                        </div>
                      )}
                      {diagnosis.notes_count > 0 && (
                        <div className="admin-v2-card-row">
                          <span className="label">Notes:</span>
                          <span className="value">{diagnosis.notes_count} follow-up note{diagnosis.notes_count !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>

                    <div className="admin-v2-card-actions">
                      <button 
                        className="admin-v2-action-btn admin-v2-action-btn-notes"
                        onClick={() => openNotesModal(diagnosis)}
                      >
                        <NotesIcon size={14} />
                        <span>Notes</span>
                      </button>
                      {hasPermission('diagnoses.update') && (
                        <button 
                          className="admin-v2-action-btn admin-v2-action-btn-edit"
                          onClick={() => handleEdit(diagnosis)}
                        >
                          <EditIcon size={14} />
                          <span>Edit</span>
                        </button>
                      )}
                      {!diagnosis.is_primary_diagnosis && diagnosis.active && hasPermission('diagnoses.update') && (
                        <button 
                          className="admin-v2-action-btn admin-v2-action-btn-primary-set"
                          onClick={() => handleSetPrimary(diagnosis.id)}
                        >
                          <CheckIcon size={14} />
                          <span>Set Primary</span>
                        </button>
                      )}
                      {diagnosis.active ? (
                        hasPermission('diagnoses.delete') && (
                          <button 
                            className="admin-v2-action-btn admin-v2-action-btn-delete"
                            onClick={() => handleDelete(diagnosis.id)}
                          >
                            <TrashIcon size={14} />
                            <span>Deactivate</span>
                          </button>
                        )
                      ) : (
                        hasPermission('diagnoses.update') && (
                          <button 
                            className="admin-v2-action-btn admin-v2-action-btn-success"
                            onClick={() => handleActivate(diagnosis.id)}
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
            <ClipboardListIcon size={64} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view and manage their diagnoses.</p>
          </div>
        )}

        {/* Modals */}
        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}
        {showCreateModal && renderFormModal()}
        {showNotesModal && selectedDiagnosis && renderNotesModal()}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Diagnoses;
