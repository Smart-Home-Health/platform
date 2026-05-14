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
  MedicationsIcon,
  ClockIcon
} from '../../components/Icons';
import { localTimeToUTC, utcTimeToLocal, parseCronExpression } from '../../utils/timezone';
import './AdminV2.css';

const AdminV2MedicationsManage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  // Use context patient as the source of truth
  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);
  
  // Medications state
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Status filter (default to active-only; user can include inactives)
  const [showInactive, setShowInactive] = useState(false);
  
  // Providers state (for prescriber dropdown)
  const [providers, setProviders] = useState([]);
  
  // Pharmacies state (for pharmacy dropdown)
  const [pharmacies, setPharmacies] = useState([]);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState(null);
  
  // Schedule form state
  const [scheduleMode, setScheduleMode] = useState('weekly');
  const [selectedDays, setSelectedDays] = useState([]);
  const [selectedDayOfMonth, setSelectedDayOfMonth] = useState(1);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [doseAmount, setDoseAmount] = useState('1.000');
  const [schedulePatientId, setSchedulePatientId] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    concentration: '',
    quantity: 1,
    quantity_unit: 'tablets',
    instructions: '',
    start_date: new Date().toISOString().split('T')[0],
    as_needed: false,
    notes: '',
    active: true,
    is_global: false,
    prescriber_id: '',
    pharmacy_id: ''
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Check URL params for patient ID or use context patient
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

  // Fetch medications and providers when patient is selected
  useEffect(() => {
    if (selectedPatient) {
      fetchMedications();
      fetchProviders();
      fetchPharmacies();
    }
  }, [selectedPatient]);

  const fetchMedications = async () => {
    if (!selectedPatient) return [];
    
    try {
      setLoading(true);
      setError(null);
      
      // Fetch both active and inactive medications
      const [activeRes, inactiveRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/admin/medications/active?patient_id=${selectedPatient.id}`, {
          credentials: 'include'
        }),
        fetch(`${config.apiUrl}/api/admin/medications/inactive?patient_id=${selectedPatient.id}`, {
          credentials: 'include'
        })
      ]);

      if (activeRes.ok && inactiveRes.ok) {
        const activeMeds = await activeRes.json();
        const inactiveMeds = await inactiveRes.json();
        
        // Combine and sort: active first (alphabetically), then inactive (alphabetically)
        const allMeds = [
          ...activeMeds.sort((a, b) => a.name.localeCompare(b.name)),
          ...inactiveMeds.sort((a, b) => a.name.localeCompare(b.name))
        ];
        
        setMedications(allMeds);
        return allMeds;
      } else {
        setError('Failed to load medications');
        return [];
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching medications:', err);
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
        const data = await response.json();
        setProviders(data);
      }
    } catch (err) {
      console.error('Error fetching providers:', err);
    }
  };

  const fetchPharmacies = async () => {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/medications/pharmacies`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setPharmacies(data.pharmacies || []);
      }
    } catch (err) {
      console.error('Error fetching pharmacies:', err);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setSearchParams({ patient: patient.id });
    setShowPatientModal(false);
  };

  const handleChangePatient = () => {
    setShowPatientModal(true);
  };

  const handleCreateMedication = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const payload = {
        ...formData,
        prescriber_id: formData.prescriber_id ? parseInt(formData.prescriber_id) : null,
        pharmacy_id: formData.pharmacy_id ? parseInt(formData.pharmacy_id) : null,
        is_patient_specific: !formData.is_global,
        admin_patient_id: formData.is_global ? null : selectedPatient.id
      };

      const response = await fetch(`${config.apiUrl}/api/add/medication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchMedications();
      } else {
        const data = await response.json();
        if (Array.isArray(data.detail)) {
          setFormError(data.detail.map(err => err.msg).join(', '));
        } else {
          setFormError(data.detail || 'Failed to create medication');
        }
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMedication = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const payload = {
        ...formData,
        prescriber_id: formData.prescriber_id ? parseInt(formData.prescriber_id) : null,
        pharmacy_id: formData.pharmacy_id ? parseInt(formData.pharmacy_id) : null
      };
      
      const response = await fetch(`${config.apiUrl}/api/medications/${selectedMedication.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowEditModal(false);
        resetForm();
        fetchMedications();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to update medication');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMedication = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/${selectedMedication.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setShowDeleteModal(false);
        setSelectedMedication(null);
        fetchMedications();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to delete medication');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (medication) => {
    setSelectedMedication(medication);
    setFormData({
      name: medication.name,
      concentration: medication.concentration || '',
      quantity: medication.quantity,
      quantity_unit: medication.quantity_unit,
      instructions: medication.instructions || '',
      start_date: medication.start_date ? medication.start_date.split('T')[0] : new Date().toISOString().split('T')[0],
      as_needed: medication.as_needed,
      notes: medication.notes || '',
      active: medication.active,
      is_global: medication.is_global || false,
      prescriber_id: medication.prescriber_id ? String(medication.prescriber_id) : '',
      pharmacy_id: medication.pharmacy_id ? String(medication.pharmacy_id) : ''
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const openDeleteModal = (medication) => {
    setSelectedMedication(medication);
    setFormError(null);
    setShowDeleteModal(true);
  };

  const openScheduleModal = (medication) => {
    setSelectedMedication(medication);
    setScheduleMode('weekly');
    setSelectedDays([]);
    setSelectedDayOfMonth(1);
    setScheduleTime('08:00');
    setDoseAmount('1.000');
    // For global meds, default to current patient if available
    setSchedulePatientId(medication.is_global && selectedPatient ? String(selectedPatient.id) : '');
    setFormError(null);
    setShowScheduleModal(true);
  };

  // Get schedules relevant to current patient
  const getRelevantSchedules = (schedules) => {
    if (!schedules || schedules.length === 0) return [];
    if (!selectedMedication?.is_global && selectedPatient) {
      return schedules.filter(s => s.patient_id === selectedPatient.id);
    }
    return schedules;
  };

  const handleAddSchedule = async () => {
    if (scheduleMode === 'weekly' && selectedDays.length === 0) {
      setFormError('Please select at least one day');
      return;
    }
    
    if (selectedMedication?.is_global && !schedulePatientId) {
      setFormError('Please select a patient for this global medication');
      return;
    }
    
    setScheduleSaving(true);
    setFormError(null);
    
    try {
      let cron = '';
      let description = '';
      // Convert local time to UTC for cron expression (DB stores in UTC)
      const utc = localTimeToUTC(scheduleTime);
      const [localHour, localMinute] = scheduleTime.split(':').map(Number);
      
      if (scheduleMode === 'weekly') {
        const dow = selectedDays.sort((a,b) => parseInt(a) - parseInt(b)).join(',');
        cron = `${utc.minute} ${utc.hour} * * ${dow}`;
        const dayNames = selectedDays.map(d => daysOfWeek[parseInt(d)]).join(', ');
        description = `${dayNames} at ${scheduleTime}`;
      } else {
        cron = `${utc.minute} ${utc.hour} ${selectedDayOfMonth} * *`;
        description = `Day ${selectedDayOfMonth} of each month at ${scheduleTime}`;
      }
      
      const scheduleData = {
        type: 'med',
        cron_expression: cron,
        description: description,
        dose_amount: parseFloat(doseAmount) || 1.0,
        active: true,
        notes: ''
      };
      
      if (selectedMedication?.is_global && schedulePatientId) {
        scheduleData.patient_id = parseInt(schedulePatientId);
      }
      
      const response = await fetch(`${config.apiUrl}/api/add/schedule/${selectedMedication.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(scheduleData)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add schedule');
      }
      
      // Refresh medications and reset form
      const updatedMeds = await fetchMedications();
      setSelectedDays([]);
      setSelectedDayOfMonth(1);
      setScheduleTime('08:00');
      setDoseAmount('1.000');
      setScheduleMode('weekly');
      
      // Update the selected medication with refreshed data
      const refreshedMed = updatedMeds.find(m => m.id === selectedMedication.id);
      if (refreshedMed) {
        setSelectedMedication(refreshedMed);
      }
    } catch (err) {
      setFormError(err.message || 'Error adding schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    
    setScheduleSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/schedules/${scheduleId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete schedule');
      }
      
      const updatedMeds = await fetchMedications();
      const refreshedMed = updatedMeds.find(m => m.id === selectedMedication?.id);
      if (refreshedMed) {
        setSelectedMedication(refreshedMed);
      }
    } catch (err) {
      setFormError('Error deleting schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleToggleSchedule = async (scheduleId) => {
    setScheduleSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/schedules/${scheduleId}/toggle-active`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to toggle schedule');
      }
      
      const updatedMeds = await fetchMedications();
      const refreshedMed = updatedMeds.find(m => m.id === selectedMedication?.id);
      if (refreshedMed) {
        setSelectedMedication(refreshedMed);
      }
    } catch (err) {
      setFormError('Error updating schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      concentration: '',
      quantity: 1,
      quantity_unit: 'tablets',
      instructions: '',
      start_date: new Date().toISOString().split('T')[0],
      as_needed: false,
      notes: '',
      active: true,
      is_global: false,
      prescriber_id: '',
      pharmacy_id: ''
    });
    setFormError(null);
    setSelectedMedication(null);
  };

  // Loading state
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
            {/* Section Title */}
            <h1 className="schedule-section-title">Manage Medications</h1>

            {error && (
              <div className="admin-v2-error-banner">{error}</div>
            )}

            {/* Summary Stats */}
            <div className="admin-v2-summary-stats admin-v2-medications-summary" style={{ marginBottom: '1.5rem' }}>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon medications">
                  <MedicationsIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{medications.filter(m => m.active).length}</h4>
                  <p>Active Medications</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon equipment">
                  <MedicationsIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{medications.filter(m => m.as_needed).length}</h4>
                  <p>PRN (As Needed)</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon tasks">
                  <MedicationsIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{medications.filter(m => !m.active).length}</h4>
                  <p>Inactive</p>
                </div>
              </div>
            </div>

            {/* Add Medication Button + Filter */}
            <div className="admin-v2-table-header" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {hasPermission('medications.create') && (
                <button
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={openCreateModal}
                >
                  <PlusIcon size={16} /> Add Medication
                </button>
              )}
              <label className="admin-v2-checkbox-label" style={{ marginLeft: 'auto' }}>
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={e => setShowInactive(e.target.checked)}
                />
                Show inactive
              </label>
            </div>

            {/* Medications list — table on desktop, stacked cards on mobile */}
            {loading ? (
              <div className="admin-v2-loading">Loading medications...</div>
            ) : (() => {
              const visibleMeds = showInactive
                ? medications
                : medications.filter(m => m.active);
              if (visibleMeds.length === 0) {
                return (
                  <div className="admin-v2-empty-state">
                    <MedicationsIcon size={32} />
                    <p>
                      {showInactive
                        ? 'No medications found for this patient'
                        : 'No active medications. Enable "Show inactive" to see inactive ones.'}
                    </p>
                  </div>
                );
              }
              return (
                <>
                  {/* Desktop: table */}
                  <div className="admin-v2-table-container admin-v2-meds-desktop">
                    <table className="admin-v2-table">
                      <thead>
                        <tr>
                          <th>Medication</th>
                          <th>Concentration</th>
                          <th>Qty</th>
                          <th>Instructions</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleMeds.map(med => (
                          <tr key={med.id} className={!med.active ? 'admin-v2-row-inactive' : ''}>
                            <td>
                              <div className="admin-v2-med-name">
                                <strong>{med.name}</strong>
                                {med.is_global && (
                                  <span className="admin-v2-badge admin-v2-badge-info">Global</span>
                                )}
                              </div>
                            </td>
                            <td>{med.concentration || '-'}</td>
                            <td>{med.quantity} {med.quantity_unit}</td>
                            <td className="admin-v2-instructions-cell">
                              {med.instructions || '-'}
                            </td>
                            <td>
                              {med.as_needed ? (
                                <span className="admin-v2-badge admin-v2-badge-warning">PRN</span>
                              ) : (
                                <span className="admin-v2-badge admin-v2-badge-secondary">Scheduled</span>
                              )}
                            </td>
                            <td>
                              <span className={`admin-v2-status-badge ${med.active ? 'active' : 'inactive'}`}>
                                {med.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <div className="admin-v2-table-actions">
                                {hasPermission('medications.update') && (
                                  <button
                                    className="admin-v2-action-btn admin-v2-action-btn-schedule"
                                    onClick={() => openScheduleModal(med)}
                                    title="Manage schedules"
                                  >
                                    <ClockIcon size={14} />
                                    <span>Schedule</span>
                                    {med.schedules && med.schedules.length > 0 && (
                                      <span className="admin-v2-schedule-count">{med.schedules.length}</span>
                                    )}
                                  </button>
                                )}
                                {hasPermission('medications.update') && (
                                  <button
                                    className="admin-v2-action-btn admin-v2-action-btn-edit"
                                    onClick={() => openEditModal(med)}
                                    title="Edit medication"
                                  >
                                    <EditIcon size={14} />
                                    <span>Edit</span>
                                  </button>
                                )}
                                {hasPermission('medications.delete') && !med.is_global && (
                                  <button
                                    className="admin-v2-action-btn admin-v2-action-btn-delete"
                                    onClick={() => openDeleteModal(med)}
                                    title="Delete medication"
                                  >
                                    <TrashIcon size={14} />
                                    <span>Delete</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: stacked cards */}
                  <div className="admin-v2-meds-cards">
                    {visibleMeds.map(med => (
                      <div
                        key={med.id}
                        className={`admin-v2-med-card ${!med.active ? 'admin-v2-med-card-inactive' : ''}`}
                      >
                        <div className="admin-v2-med-card-row admin-v2-med-card-header">
                          <div className="admin-v2-med-card-title">
                            <strong>{med.name}</strong>
                            {med.concentration && (
                              <span className="admin-v2-med-card-concentration">{med.concentration}</span>
                            )}
                          </div>
                          <div className="admin-v2-med-card-badges">
                            {med.as_needed ? (
                              <span className="admin-v2-badge admin-v2-badge-warning">PRN</span>
                            ) : (
                              <span className="admin-v2-badge admin-v2-badge-secondary">SCH</span>
                            )}
                            {med.is_global && (
                              <span className="admin-v2-badge admin-v2-badge-info">Global</span>
                            )}
                            <span className={`admin-v2-status-badge ${med.active ? 'active' : 'inactive'}`}>
                              {med.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>

                        {med.instructions && (
                          <div className="admin-v2-med-card-instructions">{med.instructions}</div>
                        )}

                        <div className="admin-v2-med-card-row admin-v2-med-card-meta">
                          <div className="admin-v2-med-card-meta-item">
                            <span className="admin-v2-med-card-label">Qty</span>
                            <span>{med.quantity} {med.quantity_unit}</span>
                          </div>
                          {med.schedules && med.schedules.length > 0 && (
                            <div className="admin-v2-med-card-meta-item">
                              <span className="admin-v2-med-card-label">Schedules</span>
                              <span>{med.schedules.length}</span>
                            </div>
                          )}
                        </div>

                        <div className="admin-v2-med-card-actions">
                          {hasPermission('medications.update') && (
                            <button
                              className="admin-v2-action-btn admin-v2-action-btn-schedule"
                              onClick={() => openScheduleModal(med)}
                            >
                              <ClockIcon size={14} />
                              <span>Schedule</span>
                              {med.schedules && med.schedules.length > 0 && (
                                <span className="admin-v2-schedule-count">{med.schedules.length}</span>
                              )}
                            </button>
                          )}
                          {hasPermission('medications.update') && (
                            <button
                              className="admin-v2-action-btn admin-v2-action-btn-edit"
                              onClick={() => openEditModal(med)}
                            >
                              <EditIcon size={14} />
                              <span>Edit</span>
                            </button>
                          )}
                          {hasPermission('medications.delete') && !med.is_global && (
                            <button
                              className="admin-v2-action-btn admin-v2-action-btn-delete"
                              onClick={() => openDeleteModal(med)}
                            >
                              <TrashIcon size={14} />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </>
        ) : (
          <div className="admin-v2-no-patient">
            <MedicationsIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view and manage their medications</p>
            <button 
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={() => setShowPatientModal(true)}
            >
              Select Patient
            </button>
          </div>
        )}

        {/* Patient Selector Modal */}
        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}

        {/* Create Medication Modal */}
        {showCreateModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Add Medication</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCreateModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateMedication}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Medication Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        required
                        placeholder="e.g., Lisinopril"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Concentration *</label>
                      <input
                        type="text"
                        value={formData.concentration}
                        onChange={e => setFormData({...formData, concentration: e.target.value})}
                        required
                        placeholder="e.g., 10mg"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        value={formData.quantity}
                        onChange={e => setFormData({...formData, quantity: parseFloat(e.target.value) || 1})}
                        required
                        min="0.25"
                        step="0.25"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Unit *</label>
                      <select
                        value={formData.quantity_unit}
                        onChange={e => setFormData({...formData, quantity_unit: e.target.value})}
                      >
                        <option value="tablets">Tablets</option>
                        <option value="capsules">Capsules</option>
                        <option value="ml">mL</option>
                        <option value="mg">mg</option>
                        <option value="units">Units</option>
                        <option value="puffs">Puffs</option>
                        <option value="drops">Drops</option>
                        <option value="patches">Patches</option>
                      </select>
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Start Date *</label>
                      <input
                        type="date"
                        value={formData.start_date}
                        onChange={e => setFormData({...formData, start_date: e.target.value})}
                        required
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Prescriber</label>
                      <select
                        value={formData.prescriber_id}
                        onChange={e => setFormData({...formData, prescriber_id: e.target.value})}
                      >
                        <option value="">-- No Prescriber --</option>
                        {providers.map(provider => (
                          <option key={provider.id} value={String(provider.id)}>
                            {provider.title ? `${provider.title} ` : ''}{provider.first_name} {provider.last_name}
                            {provider.specialty ? ` (${provider.specialty})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Pharmacy</label>
                    <select
                      value={formData.pharmacy_id}
                      onChange={e => setFormData({...formData, pharmacy_id: e.target.value})}
                    >
                      <option value="">-- No Pharmacy --</option>
                      {pharmacies.map(pharmacy => (
                        <option key={pharmacy.id} value={String(pharmacy.id)}>
                          {pharmacy.name}
                          {pharmacy.phone ? ` - ${pharmacy.phone}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Instructions *</label>
                    <textarea
                      value={formData.instructions}
                      onChange={e => setFormData({...formData, instructions: e.target.value})}
                      placeholder="e.g., Take with food"
                      rows={2}
                      required
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                      placeholder="Additional notes..."
                      rows={2}
                    />
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label className="admin-v2-checkbox-label">
                        <input
                          type="checkbox"
                          checked={formData.as_needed}
                          onChange={e => setFormData({...formData, as_needed: e.target.checked})}
                        />
                        PRN (As Needed)
                      </label>
                    </div>
                    <div className="admin-v2-form-group">
                      <label className="admin-v2-checkbox-label">
                        <input
                          type="checkbox"
                          checked={formData.is_global}
                          onChange={e => setFormData({...formData, is_global: e.target.checked})}
                        />
                        Global (Available to all patients)
                      </label>
                    </div>
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button 
                    type="button" 
                    className="admin-v2-btn"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="admin-v2-btn admin-v2-btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Creating...' : 'Add Medication'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Medication Modal */}
        {showEditModal && selectedMedication && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Edit Medication: {selectedMedication.name}</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowEditModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleUpdateMedication}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Medication Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        required
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Concentration *</label>
                      <input
                        type="text"
                        value={formData.concentration}
                        onChange={e => setFormData({...formData, concentration: e.target.value})}
                        placeholder="e.g., 10mg"
                        required
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        value={formData.quantity}
                        onChange={e => setFormData({...formData, quantity: parseFloat(e.target.value) || 1})}
                        required
                        min="0.25"
                        step="0.25"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Unit *</label>
                      <select
                        value={formData.quantity_unit}
                        onChange={e => setFormData({...formData, quantity_unit: e.target.value})}
                      >
                        <option value="tablets">Tablets</option>
                        <option value="capsules">Capsules</option>
                        <option value="ml">mL</option>
                        <option value="mg">mg</option>
                        <option value="units">Units</option>
                        <option value="puffs">Puffs</option>
                        <option value="drops">Drops</option>
                        <option value="patches">Patches</option>
                      </select>
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Instructions *</label>
                    <textarea
                      value={formData.instructions}
                      onChange={e => setFormData({...formData, instructions: e.target.value})}
                      placeholder="e.g., Take with food"
                      rows={2}
                      required
                    />
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Start Date *</label>
                      <input
                        type="date"
                        value={formData.start_date}
                        onChange={e => setFormData({...formData, start_date: e.target.value})}
                        required
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Prescriber</label>
                      <select
                        value={formData.prescriber_id}
                        onChange={e => setFormData({...formData, prescriber_id: e.target.value})}
                      >
                        <option value="">-- No Prescriber --</option>
                        {providers.map(provider => (
                          <option key={provider.id} value={String(provider.id)}>
                            {provider.title ? `${provider.title} ` : ''}{provider.first_name} {provider.last_name}
                            {provider.specialty ? ` (${provider.specialty})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Pharmacy</label>
                    <select
                      value={formData.pharmacy_id}
                      onChange={e => setFormData({...formData, pharmacy_id: e.target.value})}
                    >
                      <option value="">-- No Pharmacy --</option>
                      {pharmacies.map(pharmacy => (
                        <option key={pharmacy.id} value={String(pharmacy.id)}>
                          {pharmacy.name}
                          {pharmacy.phone ? ` - ${pharmacy.phone}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label className="admin-v2-checkbox-label">
                        <input
                          type="checkbox"
                          checked={formData.as_needed}
                          onChange={e => setFormData({...formData, as_needed: e.target.checked})}
                        />
                        PRN (As Needed)
                      </label>
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label className="admin-v2-checkbox-label">
                        <input
                          type="checkbox"
                          checked={formData.is_global}
                          onChange={e => setFormData({...formData, is_global: e.target.checked})}
                        />
                        Global (Available to all patients)
                      </label>
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Status</label>
                      <select
                        value={formData.active ? 'active' : 'inactive'}
                        onChange={e => setFormData({...formData, active: e.target.value === 'active'})}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                      placeholder="Additional notes..."
                      rows={2}
                    />
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button 
                    type="button" 
                    className="admin-v2-btn"
                    onClick={() => setShowEditModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="admin-v2-btn admin-v2-btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedMedication && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Delete Medication</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowDeleteModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                {formError && (
                  <div className="admin-v2-form-error">{formError}</div>
                )}
                <p>Are you sure you want to delete <strong>{selectedMedication.name}</strong>?</p>
                <p className="admin-v2-warning-text">This will also delete all associated schedules and history.</p>
              </div>
              <div className="admin-v2-modal-footer">
                <button 
                  type="button" 
                  className="admin-v2-btn"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="admin-v2-btn admin-v2-btn-danger"
                  onClick={handleDeleteMedication}
                  disabled={saving}
                >
                  {saving ? 'Deleting...' : 'Delete Medication'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Modal */}
        {showScheduleModal && selectedMedication && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowScheduleModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-lg" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Manage Schedules: {selectedMedication.name}</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowScheduleModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                {formError && (
                  <div className="admin-v2-form-error">{formError}</div>
                )}

                {/* Add New Schedule Section */}
                <div className="admin-v2-schedule-section">
                  <h3>Add New Schedule</h3>
                  
                  <div className="admin-v2-schedule-type-toggle">
                    <button
                      type="button"
                      className={`admin-v2-toggle-btn ${scheduleMode === 'weekly' ? 'active' : ''}`}
                      onClick={() => setScheduleMode('weekly')}
                    >
                      Weekly
                    </button>
                    <button
                      type="button"
                      className={`admin-v2-toggle-btn ${scheduleMode === 'monthly' ? 'active' : ''}`}
                      onClick={() => setScheduleMode('monthly')}
                    >
                      Monthly
                    </button>
                  </div>

                  {scheduleMode === 'weekly' ? (
                    <div className="admin-v2-form-group">
                      <label>Select Days</label>
                      <div className="admin-v2-day-selector">
                        {daysOfWeek.map((day, i) => (
                          <button
                            key={day}
                            type="button"
                            className={`admin-v2-day-btn ${selectedDays.includes(i.toString()) ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedDays(prev => 
                                prev.includes(i.toString()) 
                                  ? prev.filter(x => x !== i.toString()) 
                                  : [...prev, i.toString()]
                              );
                            }}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="admin-v2-form-group">
                      <label>Day of Month</label>
                      <select
                        value={selectedDayOfMonth}
                        onChange={e => setSelectedDayOfMonth(Number(e.target.value))}
                        className="admin-v2-select"
                      >
                        {[...Array(28)].map((_, i) => (
                          <option key={i+1} value={i+1}>{i+1}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Patient Selection for Global Meds */}
                  {selectedMedication.is_global && (
                    <div className="admin-v2-form-group">
                      <label>Patient *</label>
                      <select
                        value={schedulePatientId}
                        onChange={e => setSchedulePatientId(e.target.value)}
                        className="admin-v2-select"
                      >
                        <option value="">Select a patient...</option>
                        {patients.map(patient => (
                          <option key={patient.id} value={patient.id}>
                            {patient.first_name} {patient.last_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Time</label>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={e => setScheduleTime(e.target.value)}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Dose Amount ({selectedMedication.quantity_unit || 'units'})</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={doseAmount}
                        onChange={e => setDoseAmount(e.target.value)}
                        placeholder="1.000"
                      />
                    </div>
                    <div className="admin-v2-form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button
                        type="button"
                        className="admin-v2-btn admin-v2-btn-success"
                        onClick={handleAddSchedule}
                        disabled={scheduleSaving || (scheduleMode === 'weekly' && selectedDays.length === 0)}
                      >
                        {scheduleSaving ? 'Adding...' : 'Add Schedule'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Current Schedules Section */}
                <div className="admin-v2-schedule-section">
                  <h3>Current Schedules</h3>
                  
                  {selectedMedication.schedules && selectedMedication.schedules.length > 0 ? (
                    <div className="admin-v2-table-container">
                      <table className="admin-v2-table">
                        <thead>
                          <tr>
                            <th>Dose</th>
                            <th>Time</th>
                            <th>Schedule</th>
                            {selectedMedication.is_global && <th>Patient</th>}
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMedication.schedules.map(schedule => {
                            const parsed = parseCronExpression(schedule.cron_expression);
                            const patientName = selectedMedication.is_global && schedule.patient_id 
                              ? patients.find(p => p.id === schedule.patient_id)
                              : null;
                            
                            return (
                              <tr key={schedule.id}>
                                <td><strong>{schedule.dose_amount}</strong> {selectedMedication.quantity_unit || 'units'}</td>
                                <td>{parsed?.time || '-'}</td>
                                <td>
                                  {parsed?.type === 'weekly' && parsed.days}
                                  {parsed?.type === 'monthly' && `Day ${parsed.dayOfMonth} monthly`}
                                </td>
                                {selectedMedication.is_global && (
                                  <td>{patientName ? `${patientName.first_name} ${patientName.last_name}` : '-'}</td>
                                )}
                                <td>
                                  <span className={`admin-v2-status-badge ${schedule.active ? 'active' : 'inactive'}`}>
                                    {schedule.active ? 'Active' : 'Paused'}
                                  </span>
                                </td>
                                <td>
                                  <div className="admin-v2-table-actions">
                                    <button
                                      type="button"
                                      className={`admin-v2-action-btn ${schedule.active ? 'admin-v2-action-btn-warning' : 'admin-v2-action-btn-success'}`}
                                      onClick={() => handleToggleSchedule(schedule.id)}
                                      disabled={scheduleSaving}
                                    >
                                      {schedule.active ? 'Pause' : 'Resume'}
                                    </button>
                                    <button
                                      type="button"
                                      className="admin-v2-action-btn admin-v2-action-btn-delete"
                                      onClick={() => handleDeleteSchedule(schedule.id)}
                                      disabled={scheduleSaving}
                                    >
                                      <TrashIcon size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="admin-v2-empty-state">
                      <ClockIcon size={32} />
                      <p>No schedules created yet</p>
                      <p className="admin-v2-text-muted">Add a schedule using the form above</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="admin-v2-modal-footer">
                <button 
                  type="button" 
                  className="admin-v2-btn"
                  onClick={() => setShowScheduleModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2MedicationsManage;
