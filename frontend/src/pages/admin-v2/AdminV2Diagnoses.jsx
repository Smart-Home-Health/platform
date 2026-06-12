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
  CheckIcon,
  ClipboardListIcon,
  NotesIcon
} from '../../components/Icons';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import './AdminV2.css';

// Radix Select forbids an empty-string value, so use a sentinel for "none".
const NONE = '__none__';

const statusVariant = (status) => (
  { active: 'success', resolved: 'muted', chronic: 'warning', in_remission: 'info', ruled_out: 'danger' }[status] || 'muted'
);
const severityVariant = (severity) => (
  { mild: 'success', moderate: 'warning', severe: 'danger', critical: 'danger' }[severity] || 'muted'
);

// Label/value row used inside the diagnosis cards.
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

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
    } catch {
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

  const formatLabel = (str) => {
    if (!str) return '';
    return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Provider <Select> options, shared by the form + notes dialogs.
  const providerOptions = providers.map(p => (
    <SelectItem key={p.id} value={String(p.id)}>
      {p.title} {p.first_name} {p.last_name} ({p.specialty || p.provider_type})
    </SelectItem>
  ));

  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {error && (
              <div className="tw mb-4">
                <Alert variant="destructive">{error}</Alert>
              </div>
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
            <div className="tw mt-4">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading diagnoses...</p>
              ) : filteredDiagnoses.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
                  <ClipboardListIcon size={48} />
                  <h3 className="text-base font-semibold text-foreground">
                    {searchTerm ? 'No diagnoses found matching your search.' : 'No diagnoses found for this patient.'}
                  </h3>
                  {hasPermission('diagnoses.create') && (
                    <Button onClick={openCreateModal}>
                      <PlusIcon size={16} /> Add First Diagnosis
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredDiagnoses.map(diagnosis => (
                    <Card key={diagnosis.id} className={cn(!diagnosis.active && "opacity-60")}>
                      <CardHeader className="gap-2 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm">{diagnosis.name}</CardTitle>
                          {diagnosis.is_primary_diagnosis && <Badge variant="info">PRIMARY</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={statusVariant(diagnosis.status)}>{formatLabel(diagnosis.status)}</Badge>
                          {diagnosis.severity && (
                            <Badge variant={severityVariant(diagnosis.severity)}>{formatLabel(diagnosis.severity)}</Badge>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="flex flex-col gap-1.5 py-3 text-sm">
                        {diagnosis.icd10_code && <Row label="ICD-10" value={diagnosis.icd10_code} />}
                        {diagnosis.diagnosis_type && <Row label="Type" value={formatLabel(diagnosis.diagnosis_type)} />}
                        {diagnosis.category && <Row label="Category" value={formatLabel(diagnosis.category)} />}
                        {diagnosis.diagnosis_date && (
                          <Row label="Diagnosed" value={new Date(diagnosis.diagnosis_date).toLocaleDateString()} />
                        )}
                        {diagnosis.diagnosing_provider_name && <Row label="Diagnosed by" value={diagnosis.diagnosing_provider_name} />}
                        {diagnosis.managing_provider_name && <Row label="Managed by" value={diagnosis.managing_provider_name} />}
                        {diagnosis.notes_count > 0 && (
                          <Row label="Notes" value={`${diagnosis.notes_count} follow-up note${diagnosis.notes_count !== 1 ? 's' : ''}`} />
                        )}
                      </CardContent>

                      <CardFooter className="flex-wrap justify-start gap-2 py-3">
                        <Button size="sm" variant="ghost" onClick={() => openNotesModal(diagnosis)}>
                          <NotesIcon size={14} /> Notes
                        </Button>
                        {hasPermission('diagnoses.update') && (
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(diagnosis)}>
                            <EditIcon size={14} /> Edit
                          </Button>
                        )}
                        {!diagnosis.is_primary_diagnosis && diagnosis.active && hasPermission('diagnoses.update') && (
                          <Button size="sm" variant="ghost" onClick={() => handleSetPrimary(diagnosis.id)}>
                            <CheckIcon size={14} /> Set Primary
                          </Button>
                        )}
                        {diagnosis.active ? (
                          hasPermission('diagnoses.delete') && (
                            <Button size="sm" variant="ghost" className="text-[#ff7b72] hover:text-[#ff7b72]" onClick={() => handleDelete(diagnosis.id)}>
                              <TrashIcon size={14} /> Deactivate
                            </Button>
                          )
                        ) : (
                          hasPermission('diagnoses.update') && (
                            <Button size="sm" variant="ghost" className="text-[#3fb950] hover:text-[#3fb950]" onClick={() => handleActivate(diagnosis.id)}>
                              <CheckIcon size={14} /> Activate
                            </Button>
                          )
                        )}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="admin-v2-placeholder-page">
            <ClipboardListIcon size={64} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view and manage their diagnoses.</p>
          </div>
        )}

        {/* Patient selector */}
        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) { setShowCreateModal(false); resetForm(); } }}>
          <DialogContent className="sm:max-w-[720px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{selectedDiagnosis ? 'Edit Diagnosis' : 'Add New Diagnosis'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}

              <Field label="Diagnosis Name" required htmlFor="dx-name">
                <Input id="dx-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Type 2 Diabetes Mellitus" required />
              </Field>

              <FormRow>
                <Field label="ICD-10 Code" htmlFor="dx-icd">
                  <Input id="dx-icd" value={formData.icd10_code} onChange={(e) => setFormData({ ...formData, icd10_code: e.target.value })} placeholder="e.g., E11.9" />
                </Field>
                <Field label="ICD-10 Description" htmlFor="dx-icd-desc">
                  <Input id="dx-icd-desc" value={formData.icd10_description} onChange={(e) => setFormData({ ...formData, icd10_description: e.target.value })} placeholder="Official ICD-10 description" />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Diagnosis Type" required>
                  <Select value={formData.diagnosis_type} onValueChange={(v) => setFormData({ ...formData, diagnosis_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {diagnosisTypes.map(type => <SelectItem key={type} value={type}>{formatLabel(type)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Status" required>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {diagnosisStatuses.map(status => <SelectItem key={status} value={status}>{formatLabel(status)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Category">
                  <Select value={formData.category || NONE} onValueChange={(v) => setFormData({ ...formData, category: v === NONE ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select Category</SelectItem>
                      {diagnosisCategories.map(cat => <SelectItem key={cat} value={cat}>{formatLabel(cat)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Severity">
                  <Select value={formData.severity || NONE} onValueChange={(v) => setFormData({ ...formData, severity: v === NONE ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select Severity" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select Severity</SelectItem>
                      {severityLevels.map(level => <SelectItem key={level} value={level}>{formatLabel(level)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Onset Date" htmlFor="dx-onset">
                  <Input id="dx-onset" type="date" value={formData.onset_date} onChange={(e) => setFormData({ ...formData, onset_date: e.target.value })} />
                </Field>
                <Field label="Diagnosis Date" htmlFor="dx-date">
                  <Input id="dx-date" type="date" value={formData.diagnosis_date} onChange={(e) => setFormData({ ...formData, diagnosis_date: e.target.value })} />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Resolved Date" htmlFor="dx-resolved">
                  <Input id="dx-resolved" type="date" value={formData.resolved_date} onChange={(e) => setFormData({ ...formData, resolved_date: e.target.value })} />
                </Field>
                <Field label="Diagnosing Provider">
                  <Select
                    value={formData.diagnosing_provider_id ? String(formData.diagnosing_provider_id) : NONE}
                    onValueChange={(v) => setFormData({ ...formData, diagnosing_provider_id: v === NONE ? '' : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select Provider" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select Provider</SelectItem>
                      {providerOptions}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>

              <Field label="Managing Provider">
                <Select
                  value={formData.managing_provider_id ? String(formData.managing_provider_id) : NONE}
                  onValueChange={(v) => setFormData({ ...formData, managing_provider_id: v === NONE ? '' : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select Provider" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Select Provider</SelectItem>
                    {providerOptions}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Clinical Notes" htmlFor="dx-notes">
                <Textarea id="dx-notes" rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional clinical notes..." />
              </Field>

              <Field label="Treatment Plan" htmlFor="dx-plan">
                <Textarea id="dx-plan" rows={3} value={formData.treatment_plan} onChange={(e) => setFormData({ ...formData, treatment_plan: e.target.value })} placeholder="Brief treatment approach..." />
              </Field>

              <label className="flex w-fit cursor-pointer items-center gap-2">
                <Checkbox checked={formData.is_primary_diagnosis} onCheckedChange={(v) => setFormData({ ...formData, is_primary_diagnosis: v === true })} />
                <span className="text-sm text-foreground">Primary/Principal Diagnosis</span>
              </label>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => { setShowCreateModal(false); resetForm(); }}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : (selectedDiagnosis ? 'Update Diagnosis' : 'Add Diagnosis')}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Notes Dialog */}
        <Dialog
          open={showNotesModal && !!selectedDiagnosis}
          onOpenChange={(o) => { if (!o) { setShowNotesModal(false); setSelectedDiagnosis(null); setDiagnosisNotes([]); } }}
        >
          <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Follow-up Notes: {selectedDiagnosis?.name}</DialogTitle>
            </DialogHeader>

            {/* Add Note Form */}
            <div className="flex flex-col gap-3 rounded-md border border-border p-3">
              <FormRow>
                <Field label="Note Type">
                  <Select value={newNoteType} onValueChange={setNewNoteType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {noteTypes.map(type => <SelectItem key={type} value={type}>{formatLabel(type)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Provider (Optional)">
                  <Select
                    value={newNoteProviderId ? String(newNoteProviderId) : NONE}
                    onValueChange={(v) => setNewNoteProviderId(v === NONE ? '' : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Select Provider" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Select Provider</SelectItem>
                      {providers.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.title} {p.first_name} {p.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>
              <Field label="Note Content">
                <Textarea rows={3} value={newNoteContent} onChange={(e) => setNewNoteContent(e.target.value)} placeholder="Enter note content..." />
              </Field>
              <div className="flex justify-end">
                <Button onClick={handleAddNote} disabled={addingNote || !newNoteContent.trim()}>
                  {addingNote ? 'Adding...' : 'Add Note'}
                </Button>
              </div>
            </div>

            {/* Notes List */}
            <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
              {diagnosisNotes.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No notes yet for this diagnosis.</p>
              ) : (
                diagnosisNotes.map(note => (
                  <div key={note.id} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{formatLabel(note.note_type)}</Badge>
                        {note.provider_name && <span className="text-xs text-muted-foreground">{note.provider_name}</span>}
                        <span className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString()}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="text-[#ff7b72] hover:text-[#ff7b72]" onClick={() => handleDeleteNote(note.id)}>
                        <TrashIcon size={14} />
                      </Button>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">{note.content}</div>
                    {note.created_by_name && (
                      <div className="mt-2 text-xs text-muted-foreground">Added by: {note.created_by_name}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Diagnoses;
