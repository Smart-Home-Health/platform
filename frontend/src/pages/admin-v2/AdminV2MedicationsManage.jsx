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
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import MedicationSheet from '../../components/medication/MedicationSheet';
import { formatMissedWindow } from '../../components/schedule/reminderTiming';
import MedicationScheduleForm from '../../components/medication/MedicationScheduleForm';
import { PatientSelectorModal, MedStockBar } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  MedicationsIcon,
  ClockIcon,
  PackageIcon,
  TrashIcon
} from '../../components/Icons';
import EntityCard from '../../components/vc/EntityCard';
import EntityToolbar from '../../components/vc/EntityToolbar';
import EntityModal, { EmField } from '../../components/vc/EntityModal';
import ConfirmSheet from '../../components/vc/ConfirmSheet';
import { CfgStat, CfgBadge } from './settings/CfgSection';
import { parseCronExpression } from '../../utils/timezone';
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

  // Toolbar: Active/Inactive tab + search + a secondary type filter
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterKey, setFilterKey] = useState('all');

  // Providers state (for prescriber dropdown)
  const [providers, setProviders] = useState([]);

  // Pharmacies state (for pharmacy dropdown)
  const [pharmacies, setPharmacies] = useState([]);

  // Modal states
  const [showMedSheet, setShowMedSheet] = useState(false);
  const [showBulkLowStockModal, setShowBulkLowStockModal] = useState(false);
  const [bulkLowStockDays, setBulkLowStockDays] = useState(7);
  const [bulkLowStockSaving, setBulkLowStockSaving] = useState(false);
  const [bulkLowStockResult, setBulkLowStockResult] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState(null);

  const [editingSchedule, setEditingSchedule] = useState(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const editButton = useRef(null);

  useEffect(() => {
    if (!editingSchedule && showScheduleModal) editButton.current?.focus();
  }, [editingSchedule, showScheduleModal]);

  // Form state
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way URL→context sync; adding contextPatient would re-run on selection change and revert it to the stale URL param
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way context→URL sync; runs only when the selection changes
  }, [contextPatient]);

  // Fetch medications and providers when patient is selected
  useEffect(() => {
    if (selectedPatient) {
      fetchMedications();
      fetchProviders();
      fetchPharmacies();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helpers are recreated each render; effect is keyed on patient change only
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

  // One save path. The two handlers were the same coercion logic twice, and
  // only the update one failed to map an array-shaped 422 -- rendering the
  // raw objects as an Alert child, which React refuses.
  const readError = (data, fallback) => (
    Array.isArray(data?.detail)
      ? data.detail.map((d) => d.msg).join(', ')
      : (data?.detail || fallback)
  );

  const handleSaveMedication = async (payload) => {
    const creating = !selectedMedication;
    const url = creating
      ? `${config.apiUrl}/api/add/medication`
      : `${config.apiUrl}/api/medications/${selectedMedication.id}`;
    const body = creating
      ? {
        ...payload,
        is_patient_specific: !payload.is_global,
        admin_patient_id: payload.is_global ? null : selectedPatient.id,
      }
      : payload;

    const response = await fetch(url, {
      method: creating ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let data = null;
      try { data = await response.json(); } catch { /* non-JSON body */ }
      throw new Error(readError(data, creating
        ? 'Failed to add the medication'
        : 'Failed to save the medication'));
    }

    setShowMedSheet(false);
    setSelectedMedication(null);
    fetchMedications();
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
    } catch {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkLowStock = async (e) => {
    e.preventDefault();
    setFormError(null);
    setBulkLowStockSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/low-stock-threshold/apply-days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ days: bulkLowStockDays })
      });
      if (response.ok) {
        const data = await response.json();
        setBulkLowStockResult(data);
        fetchMedications();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to apply low-stock alerts');
      }
    } catch {
      setFormError('Error connecting to server');
    } finally {
      setBulkLowStockSaving(false);
    }
  };

  const openEditModal = (medication) => {
    setSelectedMedication(medication);
    setFormError(null);
    setShowMedSheet(true);
  };

  const openDeleteModal = (medication) => {
    setSelectedMedication(medication);
    setFormError(null);
    setShowDeleteModal(true);
  };

  const openScheduleModal = (medication) => {
    setSelectedMedication(medication);
    setEditingSchedule(null);
    editButton.current = null;
    setFormError(null);
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async (scheduleData) => {
    setScheduleSaving(true);
    setFormError(null);
    try {
      const path = editingSchedule
        ? `/api/schedules/${editingSchedule.id}`
        : `/api/add/schedule/${selectedMedication.id}`;
      const response = await fetch(`${config.apiUrl}${path}`, {
        method: editingSchedule ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(scheduleData),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(readError(data, 'Failed to save schedule'));
      }

      // Keep the confirmed write visible even if the subsequent refresh fails.
      const result = await response.json();
      const schedules = selectedMedication.schedules || [];
      const updatedMedication = {
        ...selectedMedication,
        schedules: editingSchedule
          ? schedules.map(s => s.id === editingSchedule.id ? { ...s, ...scheduleData } : s)
          : [{ ...scheduleData, id: result.id, active: true }, ...schedules],
      };
      setSelectedMedication(updatedMedication);
      setMedications(meds => meds.map(m => m.id === updatedMedication.id ? updatedMedication : m));
      const updatedMeds = await fetchMedications();
      const refreshed = updatedMeds?.find(m => m.id === updatedMedication.id);
      if (refreshed) setSelectedMedication(refreshed);
      setEditingSchedule(null);
      return true;
    } catch (err) {
      setFormError(err.message || 'Failed to save schedule');
      return false;
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
    } catch {
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
    } catch {
      setFormError('Error updating schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  const openCreateModal = () => {
    setSelectedMedication(null);
    setFormError(null);
    setShowMedSheet(true);
  };

  // Permission-aware kebab menu for a medication card
  const medicationMenu = (med) => {
    const items = [];
    if (hasPermission('medications.update')) {
      items.push({
        label: `Manage schedules${med.schedules?.length ? ` (${med.schedules.length})` : ''}`,
        onClick: () => openScheduleModal(med),
      });
      items.push({ label: 'Edit', onClick: () => openEditModal(med) });
    }
    if (hasPermission('medications.delete') && !med.is_global) {
      items.push({ label: 'Delete', onClick: () => openDeleteModal(med), danger: true });
    }
    return items;
  };

  const activeCount = medications.filter(m => m.active).length;
  const inactiveCount = medications.length - activeCount;
  const prnCount = medications.filter(m => m.as_needed).length;
  const lowStockCount = medications.filter(m => m.stock_low).length;

  const matchesSearch = (med) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return med.name.toLowerCase().includes(q) || med.instructions?.toLowerCase().includes(q);
  };
  const matchesFilter = (med) => {
    if (filterKey === 'scheduled') return !med.as_needed;
    if (filterKey === 'prn') return med.as_needed;
    if (filterKey === 'low_stock') return !!med.stock_low;
    return true;
  };
  const visibleMeds = medications.filter(
    (med) => (activeTab === 'active' ? med.active : !med.active) && matchesSearch(med) && matchesFilter(med)
  );

  // Loading state
  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <p className="cfg-loading">Loading patients...</p>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <div className="cfg">
            {error && <div className="em-error ec-page-alert">{error}</div>}

            {/* Summary Stats */}
            <div className="cfg-stats row">
              <CfgStat label="Active" value={activeCount} />
              <CfgStat label="PRN" value={prnCount} />
              <CfgStat label="Inactive" value={inactiveCount} />
              <CfgStat label="Low Stock" value={lowStockCount} />
            </div>

            <EntityToolbar
              counts={[
                { key: 'active', label: 'Active', count: activeCount },
                { key: 'inactive', label: 'Inactive', count: inactiveCount },
              ]}
              activeCount={activeTab}
              onCountChange={setActiveTab}
              search={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Search medications"
              filter={{
                value: filterKey,
                onChange: setFilterKey,
                label: 'Type',
                options: [
                  { value: 'all', label: 'All' },
                  { value: 'scheduled', label: 'Scheduled' },
                  { value: 'prn', label: 'PRN' },
                  { value: 'low_stock', label: 'Low stock' },
                ],
              }}
              onAdd={hasPermission('medications.create') ? openCreateModal : undefined}
              addLabel="Add medication"
            />

            {hasPermission('medications.update') && (
              <div className="cfg-actions">
                <button
                  type="button"
                  className="cfg-ghost"
                  onClick={() => { setBulkLowStockResult(null); setShowBulkLowStockModal(true); }}
                >
                  Bulk Low-Stock Alert
                </button>
              </div>
            )}

            {/* Medications list */}
            {loading ? (
              <div className="ec-empty">Loading medications…</div>
            ) : visibleMeds.length === 0 ? (
              <div className="ec-empty">
                <MedicationsIcon size={32} />
                <p>
                  {searchTerm || filterKey !== 'all'
                    ? 'No medications match your search.'
                    : `No ${activeTab} medications for this patient.`}
                </p>
              </div>
            ) : (
              <div className="ec-grid">
                {visibleMeds.map((med) => (
                  <EntityCard
                    key={med.id}
                    initials={med.name.slice(0, 2).toUpperCase()}
                    title={med.name}
                    badges={[
                      med.concentration,
                      med.as_needed ? 'PRN' : 'Scheduled',
                      med.is_global ? 'Global' : null,
                    ].filter(Boolean)}
                    tag={med.stock_low ? { label: 'Low stock', tone: 'due' } : undefined}
                    inactive={!med.active}
                    details={[
                      { icon: <PackageIcon size={18} />, label: 'On hand', value: `${med.quantity} ${med.quantity_unit}` },
                      { icon: <ClockIcon size={18} />, label: 'Schedules', value: med.schedules?.length ? med.schedules.length : 'None' },
                    ]}
                    menu={medicationMenu(med)}
                  >
                    <MedStockBar daysLeft={med.days_left} low={med.stock_low} />
                  </EntityCard>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="cfg-nopatient">
            <MedicationsIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view and manage their medications</p>
            <button type="button" className="em-submit" onClick={() => setShowPatientModal(true)}>
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

        <MedicationSheet
          open={showMedSheet}
          onOpenChange={(o) => { setShowMedSheet(o); if (!o) setSelectedMedication(null); }}
          medication={selectedMedication}
          providers={providers}
          pharmacies={pharmacies}
          scheduleCount={selectedMedication?.schedule_count
            ?? (selectedMedication?.schedules || []).length}
          onSave={handleSaveMedication}
          onViewSchedules={() => {
            setShowMedSheet(false);
            openScheduleModal(selectedMedication);
          }}
        />

        {/* Bulk Low-Stock Alert Modal */}
        <EntityModal
          open={showBulkLowStockModal}
          onOpenChange={(o) => { if (!o) setShowBulkLowStockModal(false); }}
          title="Bulk Low-Stock Alert"
        >
          {bulkLowStockResult ? (
            <div className="em-form">
              <p className="cfg-note">
                Applied a {bulkLowStockDays}-day low-stock alert to {bulkLowStockResult.updated_count} medication{bulkLowStockResult.updated_count === 1 ? '' : 's'}:
              </p>
              <p className="em-hint">
                {bulkLowStockResult.medications.join(', ') || 'None had an active schedule.'}
              </p>
              <div className="em-footer">
                <button type="button" className="em-submit" onClick={() => setShowBulkLowStockModal(false)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleBulkLowStock} className="em-form">
              {formError && <div className="em-error" role="alert">{formError}</div>}
              <p className="em-hint">
                Sets a days-of-supply low-stock alert on every active medication that has
                an active schedule, replacing any existing threshold. As-needed meds without
                a schedule are skipped (their usage can't be projected).
              </p>
              <EmField label="Alert when supply drops below (days)" required htmlFor="bulk-low-stock-days">
                <input
                  id="bulk-low-stock-days"
                  className="em-input"
                  type="number"
                  value={bulkLowStockDays}
                  onChange={e => setBulkLowStockDays(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  required
                  min="1"
                  max="365"
                  step="1"
                />
              </EmField>
              <div className="em-footer">
                <button type="button" className="em-cancel" onClick={() => setShowBulkLowStockModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="em-submit" disabled={bulkLowStockSaving || !bulkLowStockDays}>
                  {bulkLowStockSaving ? 'Applying...' : 'Apply to All Scheduled Meds'}
                </button>
              </div>
            </form>
          )}
        </EntityModal>

        {/* Delete Confirmation */}
        <ConfirmSheet
          open={showDeleteModal && !!selectedMedication}
          onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}
          title="Delete Medication"
          confirmLabel={saving ? 'Deleting...' : 'Delete Medication'}
          tone="destructive"
          busy={saving}
          error={formError}
          onConfirm={handleDeleteMedication}
        >
          Are you sure you want to delete <strong>{selectedMedication?.name}</strong>?
          This will also delete all associated schedules and history.
        </ConfirmSheet>

        {/* Schedule Modal */}
        <EntityModal
          open={showScheduleModal && !!selectedMedication}
          onOpenChange={(o) => { if (!o && !scheduleSaving) setShowScheduleModal(false); }}
          title={`Manage Schedules${selectedMedication ? `: ${selectedMedication.name}` : ''}`}
          wide
        >
          <div className="em-form">
            {selectedMedication && (
              <>
                {formError && <div className="em-error" role="alert">{formError}</div>}

                <MedicationScheduleForm
                  key={editingSchedule?.id ?? 'new'}
                  schedule={editingSchedule}
                  medication={selectedMedication}
                  patients={patients}
                  currentPatientId={selectedPatient?.id}
                  saving={scheduleSaving}
                  onSave={handleSaveSchedule}
                  onCancel={() => { setEditingSchedule(null); setFormError(null); }}
                />

                {/* Current Schedules */}
                <h4 className="cfg-group-title" hidden={!!editingSchedule}>Current Schedules</h4>

                {/* Row-as-card table: stacks into cards below 768px instead of
                    forcing the dialog wider than the phone viewport. */}
                {selectedMedication.schedules && selectedMedication.schedules.length > 0 ? (
                  <div className="admin-v2-table-container admin-v2-table-cards-wrap" hidden={!!editingSchedule}>
                    <table className="admin-v2-table admin-v2-table-cards">
                      <thead>
                        <tr>
                          <th>Dose</th>
                          <th>Time</th>
                          <th>Schedule</th>
                          {selectedMedication.is_global && <th>Patient</th>}
                          <th>Mark missed after</th>
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
                              <td data-label="Dose"><span><strong>{schedule.dose_amount}</strong> {selectedMedication.quantity_unit || 'units'}</span></td>
                              <td data-label="Time">{parsed?.time || '-'}</td>
                              <td data-label="Schedule" className="admin-v2-cell-stack">
                                {parsed?.type === 'weekly' && parsed.days}
                                {parsed?.type === 'daily' && 'Daily'}
                                {!parsed && schedule.cron_expression}
                                {parsed?.type === 'monthly' && `Day ${parsed.dayOfMonth} monthly (UTC)`}
                              </td>
                              {selectedMedication.is_global && (
                                <td data-label="Patient">{patientName ? `${patientName.first_name} ${patientName.last_name}` : '-'}</td>
                              )}
                              <td data-label="Mark missed after">
                                {schedule.reminder_window_minutes != null ? formatMissedWindow(schedule.reminder_window_minutes)
                                  : schedule.grace_period_hours != null ? `${schedule.grace_period_hours} h` : 'Default'}
                              </td>
                              <td data-label="Status">
                                <CfgBadge tone={schedule.active ? 'ok' : undefined}>
                                  {schedule.active ? 'Active' : 'Paused'}
                                </CfgBadge>
                              </td>
                              <td className="admin-v2-cell-actions">
                                <div className="cfg-rowactions">
                                  <button
                                    type="button"
                                    className="cfg-ghost"
                                    onClick={(e) => {
                                      editButton.current = e.currentTarget;
                                      setFormError(null);
                                      setEditingSchedule(schedule);
                                    }}
                                    disabled={scheduleSaving}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="cfg-ghost"
                                    onClick={() => handleToggleSchedule(schedule.id)}
                                    disabled={scheduleSaving}
                                  >
                                    {schedule.active ? 'Pause' : 'Resume'}
                                  </button>
                                  <button
                                    type="button"
                                    className="cfg-iconbtn danger"
                                    aria-label="Delete schedule"
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
                  <div className="cfg-nopatient">
                    <ClockIcon size={32} />
                    <p>No schedules created yet</p>
                    <p>Add a schedule using the form above</p>
                  </div>
                )}
              </>
            )}

            {!editingSchedule && (
              <div className="em-footer">
                <button type="button" className="em-cancel" disabled={scheduleSaving} onClick={() => setShowScheduleModal(false)}>
                  Close
                </button>
              </div>
            )}
          </div>
        </EntityModal>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2MedicationsManage;
