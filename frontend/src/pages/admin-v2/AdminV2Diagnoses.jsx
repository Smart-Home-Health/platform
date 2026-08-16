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
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  TrashIcon,
  ClipboardListIcon,
  NotesIcon,
  FileTextIcon,
  CalendarIcon,
  AlertIcon,
  StethoscopeIcon,
} from '../../components/Icons';
import EntityCard from '../../components/vc/EntityCard';
import EntityToolbar from '../../components/vc/EntityToolbar';
import EntityModal, { EmField, EmRow, EmSelect } from '../../components/vc/EntityModal';
import './AdminV2.css';

// Tag tones per the vc color roles: amber = ongoing concern, green = resolved,
// accent = in remission, muted for historical/ruled-out.
const statusTone = (status) => (
  { active: 'due', chronic: 'due', in_remission: 'accent', resolved: 'complete', ruled_out: 'idle' }[status] || 'idle'
);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way URL→context sync; adding contextPatient would re-run on selection change and revert it to the stale URL param
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way context→URL sync; runs only when the selection changes
  }, [contextPatient]);

  // Fetch diagnoses when patient changes
  useEffect(() => {
    if (selectedPatient) {
      fetchDiagnoses();
      fetchProviders();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helpers are recreated each render; effect is keyed on patient/filter changes only
  }, [selectedPatient, filterStatus, filterCategory]);

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

      // Fetch active + inactive together so the count tabs are accurate;
      // the tab split happens client-side.
      let url = `${config.apiUrl}/api/diagnoses/patient/${selectedPatient.id}?active_only=false`;
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

  const matchesSearch = (d) =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.icd10_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.category?.toLowerCase().includes(searchTerm.toLowerCase());

  const activeCount = diagnoses.filter((d) => d.active).length;
  const inactiveCount = diagnoses.length - activeCount;
  const filteredDiagnoses = diagnoses.filter(
    (d) => (activeTab === 'active' ? d.active : !d.active) && matchesSearch(d)
  );

  const formatLabel = (str) => {
    if (!str) return '';
    return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const badgeLabel = (str) => str.replace(/_/g, ' ').toUpperCase();

  // People-style avatar: first letters of the first two words of the name.
  const diagnosisInitials = (name) =>
    (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  // The Primary tag occupies the card's single tag slot, so status joins the
  // badges on primary diagnoses to stay visible. A 'primary' diagnosis_type
  // badge is dropped there — the tag already says it.
  const diagnosisBadges = (d) => [
    ...(d.is_primary_diagnosis && d.status ? [badgeLabel(d.status)] : []),
    ...(d.diagnosis_type && !(d.is_primary_diagnosis && d.diagnosis_type === 'primary')
      ? [badgeLabel(d.diagnosis_type)]
      : []),
    ...(d.category ? [badgeLabel(d.category)] : []),
  ];

  const diagnosisDetails = (d) => [
    { icon: <FileTextIcon size={18} />, label: 'ICD-10 code', value: d.icd10_code },
    {
      icon: <CalendarIcon size={18} />,
      label: 'Diagnosed',
      value: d.diagnosis_date ? new Date(d.diagnosis_date).toLocaleDateString() : null,
    },
    ...(d.severity
      ? [{ icon: <AlertIcon size={18} />, label: 'Severity', value: formatLabel(d.severity) }]
      : []),
    ...(d.diagnosing_provider_name
      ? [{ icon: <StethoscopeIcon size={18} />, label: 'Diagnosed by', value: d.diagnosing_provider_name }]
      : []),
    ...(d.managing_provider_name
      ? [{ icon: <StethoscopeIcon size={18} />, label: 'Managed by', value: d.managing_provider_name }]
      : []),
    ...(d.notes_count > 0
      ? [{
          icon: <NotesIcon size={18} />,
          label: 'Notes',
          value: `${d.notes_count} follow-up note${d.notes_count !== 1 ? 's' : ''}`,
        }]
      : []),
  ];

  const diagnosisMenu = (d) => {
    const items = [];
    if (hasPermission('diagnoses.update')) {
      items.push({ label: 'Edit', onClick: () => handleEdit(d) });
      if (!d.is_primary_diagnosis && d.active) {
        items.push({ label: 'Set primary', onClick: () => handleSetPrimary(d.id) });
      }
      if (!d.active) {
        items.push({ label: 'Activate', onClick: () => handleActivate(d.id) });
      }
    }
    if (d.active && hasPermission('diagnoses.delete')) {
      items.push({ label: 'Deactivate', onClick: () => handleDelete(d.id), danger: true });
    }
    return items;
  };

  // Provider select options, shared by the form + notes dialogs.
  const providerOptions = providers.map(p => (
    <option key={p.id} value={String(p.id)}>
      {p.title} {p.first_name} {p.last_name} ({p.specialty || p.provider_type})
    </option>
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
            {error && <div className="em-error ec-page-alert">{error}</div>}

            <EntityToolbar
              counts={[
                { key: 'active', label: 'Active', count: activeCount },
                { key: 'inactive', label: 'Inactive', count: inactiveCount },
              ]}
              activeCount={activeTab}
              onCountChange={setActiveTab}
              search={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Search diagnoses"
              filter={[
                {
                  value: filterStatus,
                  onChange: setFilterStatus,
                  label: 'Status',
                  options: [
                    { value: '', label: 'All statuses' },
                    ...diagnosisStatuses.map((s) => ({ value: s, label: formatLabel(s) })),
                  ],
                },
                {
                  value: filterCategory,
                  onChange: setFilterCategory,
                  label: 'Category',
                  options: [
                    { value: '', label: 'All categories' },
                    ...diagnosisCategories.map((c) => ({ value: c, label: formatLabel(c) })),
                  ],
                },
              ]}
              onAdd={hasPermission('diagnoses.create') ? openCreateModal : undefined}
              addLabel="Add diagnosis"
            />

            {loading ? (
              <div className="ec-empty">Loading diagnoses…</div>
            ) : filteredDiagnoses.length === 0 ? (
              <div className="ec-empty">
                {searchTerm
                  ? 'No diagnoses match your search.'
                  : `No ${activeTab} diagnoses for this patient.`}
              </div>
            ) : (
              <div className="ec-grid">
                {filteredDiagnoses.map((diagnosis) => (
                  <EntityCard
                    key={diagnosis.id}
                    initials={diagnosisInitials(diagnosis.name)}
                    title={diagnosis.name}
                    badges={diagnosisBadges(diagnosis)}
                    tag={diagnosis.is_primary_diagnosis
                      ? { label: 'Primary' }
                      : { label: formatLabel(diagnosis.status), tone: statusTone(diagnosis.status) }}
                    inactive={!diagnosis.active}
                    details={diagnosisDetails(diagnosis)}
                    quickActions={[
                      {
                        icon: <NotesIcon size={18} />,
                        label: diagnosis.notes_count > 0 ? `Notes (${diagnosis.notes_count})` : 'Notes',
                        onClick: () => openNotesModal(diagnosis),
                      },
                    ]}
                    menu={diagnosisMenu(diagnosis)}
                  />
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
        <EntityModal
          open={showCreateModal}
          onOpenChange={(o) => { if (!o) { setShowCreateModal(false); resetForm(); } }}
          title={selectedDiagnosis ? 'Edit diagnosis' : 'Add diagnosis'}
          wide
        >
          <form onSubmit={handleSubmit} className="em-form">
            {formError && <div className="em-error">{formError}</div>}

            <EmField label="Diagnosis name" required htmlFor="dx-name">
              <input id="dx-name" className="em-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Type 2 Diabetes Mellitus" required />
            </EmField>

            <EmRow>
              <EmField label="ICD-10 code" htmlFor="dx-icd">
                <input id="dx-icd" className="em-input" value={formData.icd10_code} onChange={(e) => setFormData({ ...formData, icd10_code: e.target.value })} placeholder="e.g., E11.9" />
              </EmField>
              <EmField label="ICD-10 description" htmlFor="dx-icd-desc">
                <input id="dx-icd-desc" className="em-input" value={formData.icd10_description} onChange={(e) => setFormData({ ...formData, icd10_description: e.target.value })} placeholder="Official ICD-10 description" />
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Diagnosis type" required htmlFor="dx-type">
                <EmSelect id="dx-type" value={formData.diagnosis_type} onChange={(e) => setFormData({ ...formData, diagnosis_type: e.target.value })}>
                  {diagnosisTypes.map(type => (
                    <option key={type} value={type}>{formatLabel(type)}</option>
                  ))}
                </EmSelect>
              </EmField>
              <EmField label="Status" required htmlFor="dx-status">
                <EmSelect id="dx-status" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  {diagnosisStatuses.map(status => (
                    <option key={status} value={status}>{formatLabel(status)}</option>
                  ))}
                </EmSelect>
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Category" htmlFor="dx-category">
                <EmSelect id="dx-category" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                  <option value="">Select category</option>
                  {diagnosisCategories.map(cat => (
                    <option key={cat} value={cat}>{formatLabel(cat)}</option>
                  ))}
                </EmSelect>
              </EmField>
              <EmField label="Severity" htmlFor="dx-severity">
                <EmSelect id="dx-severity" value={formData.severity} onChange={(e) => setFormData({ ...formData, severity: e.target.value })}>
                  <option value="">Select severity</option>
                  {severityLevels.map(level => (
                    <option key={level} value={level}>{formatLabel(level)}</option>
                  ))}
                </EmSelect>
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Onset date" htmlFor="dx-onset">
                <input id="dx-onset" className="em-input" type="date" value={formData.onset_date} onChange={(e) => setFormData({ ...formData, onset_date: e.target.value })} />
              </EmField>
              <EmField label="Diagnosis date" htmlFor="dx-date">
                <input id="dx-date" className="em-input" type="date" value={formData.diagnosis_date} onChange={(e) => setFormData({ ...formData, diagnosis_date: e.target.value })} />
              </EmField>
            </EmRow>

            <EmRow>
              <EmField label="Resolved date" htmlFor="dx-resolved">
                <input id="dx-resolved" className="em-input" type="date" value={formData.resolved_date} onChange={(e) => setFormData({ ...formData, resolved_date: e.target.value })} />
              </EmField>
              <EmField label="Diagnosing provider" htmlFor="dx-diag-provider">
                <EmSelect
                  id="dx-diag-provider"
                  value={formData.diagnosing_provider_id ? String(formData.diagnosing_provider_id) : ''}
                  onChange={(e) => setFormData({ ...formData, diagnosing_provider_id: e.target.value })}
                >
                  <option value="">Select provider</option>
                  {providerOptions}
                </EmSelect>
              </EmField>
            </EmRow>

            <EmField label="Managing provider" htmlFor="dx-mgr-provider">
              <EmSelect
                id="dx-mgr-provider"
                value={formData.managing_provider_id ? String(formData.managing_provider_id) : ''}
                onChange={(e) => setFormData({ ...formData, managing_provider_id: e.target.value })}
              >
                <option value="">Select provider</option>
                {providerOptions}
              </EmSelect>
            </EmField>

            <EmField label="Clinical notes" htmlFor="dx-notes">
              <textarea id="dx-notes" className="em-input" rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional clinical notes..." />
            </EmField>

            <EmField label="Treatment plan" htmlFor="dx-plan">
              <textarea id="dx-plan" className="em-input" rows={3} value={formData.treatment_plan} onChange={(e) => setFormData({ ...formData, treatment_plan: e.target.value })} placeholder="Brief treatment approach..." />
            </EmField>

            <label className="em-check-row">
              <input type="checkbox" className="em-check" checked={formData.is_primary_diagnosis} onChange={(e) => setFormData({ ...formData, is_primary_diagnosis: e.target.checked })} />
              <span className="em-check-label">Primary/principal diagnosis</span>
            </label>

            <div className="em-footer">
              <button type="button" className="em-cancel" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                Cancel
              </button>
              <button type="submit" className="em-submit" disabled={saving}>
                {saving ? 'Saving…' : (selectedDiagnosis ? 'Update diagnosis' : 'Add diagnosis')}
              </button>
            </div>
          </form>
        </EntityModal>

        {/* Notes Dialog */}
        <EntityModal
          open={showNotesModal && !!selectedDiagnosis}
          onOpenChange={(o) => { if (!o) { setShowNotesModal(false); setSelectedDiagnosis(null); setDiagnosisNotes([]); } }}
          title={`Follow-up notes: ${selectedDiagnosis?.name || ''}`}
          wide
        >
          <div className="em-form">
            {/* Add Note Form */}
            <EmRow>
              <EmField label="Note type" htmlFor="dx-note-type">
                <EmSelect id="dx-note-type" value={newNoteType} onChange={(e) => setNewNoteType(e.target.value)}>
                  {noteTypes.map(type => (
                    <option key={type} value={type}>{formatLabel(type)}</option>
                  ))}
                </EmSelect>
              </EmField>
              <EmField label="Provider" optional htmlFor="dx-note-provider">
                <EmSelect
                  id="dx-note-provider"
                  value={newNoteProviderId ? String(newNoteProviderId) : ''}
                  onChange={(e) => setNewNoteProviderId(e.target.value)}
                >
                  <option value="">Select provider</option>
                  {providers.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.title} {p.first_name} {p.last_name}</option>
                  ))}
                </EmSelect>
              </EmField>
            </EmRow>
            <EmField label="Note content" htmlFor="dx-note-content">
              <textarea id="dx-note-content" className="em-input" rows={3} value={newNoteContent} onChange={(e) => setNewNoteContent(e.target.value)} placeholder="Enter note content..." />
            </EmField>
            <div className="em-footer">
              <button type="button" className="em-submit" onClick={handleAddNote} disabled={addingNote || !newNoteContent.trim()}>
                {addingNote ? 'Adding…' : 'Add note'}
              </button>
            </div>

            {/* Notes List */}
            {diagnosisNotes.length === 0 ? (
              <div className="ec-empty">No notes yet for this diagnosis.</div>
            ) : (
              diagnosisNotes.map(note => (
                <div key={note.id} className="em-field">
                  <div className="ec-detail">
                    <span className="ec-badge">{formatLabel(note.note_type)}</span>
                    {note.provider_name && <span className="ec-detail-label">{note.provider_name}</span>}
                    <span className="ec-detail-label">{new Date(note.created_at).toLocaleString()}</span>
                    <button
                      type="button"
                      className="em-cancel"
                      style={{ marginLeft: 'auto' }}
                      aria-label="Delete note"
                      onClick={() => handleDeleteNote(note.id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{note.content}</div>
                  {note.created_by_name && (
                    <div className="ec-detail-label">Added by: {note.created_by_name}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </EntityModal>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Diagnoses;
