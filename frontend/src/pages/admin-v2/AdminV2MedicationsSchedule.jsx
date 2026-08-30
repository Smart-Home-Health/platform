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
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { MedicationsIcon } from '../../components/Icons';
import { checkAdministrationWindow, formatDurationMinutes } from '../../utils/timezone';
import ScheduleBoard from '../../components/schedule/ScheduleBoard';
import { groupBySlot, recurrenceLabel } from '../../components/schedule/scheduleRollup';
import ConfirmSheet from '../../components/vc/ConfirmSheet';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

const AdminV2MedicationsSchedule = () => {
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
  
  // Schedule data state
  const [scheduledMedications, setScheduledMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Status filter state
  const [statusFilters, setStatusFilters] = useState({
    ready: true,
    upcoming: true,
    missed: true,
    completed: false,
    skipped: false
  });

  // Off-window (early or late) administration confirmation modal state
  const [windowConfirm, setWindowConfirm] = useState({ open: false, medication: null, check: null });

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

  // Fetch schedule when patient changes
  useEffect(() => {
    if (selectedPatient) {
      fetchSchedule();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient change only
  }, [selectedPatient]);

  const fetchSchedule = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `${config.apiUrl}/api/schedules/daily?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        setScheduledMedications(data.scheduled_medications || []);
      } else {
        setError('Failed to load schedule');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setSearchParams({ patient: patient.id });
    setShowPatientModal(false);
  };

  // Status → ScheduleBoard tone (one of the six vc-content.css --sched-* families)
  const STATUS_TONE = {
    ready: 'ontime',
    upcoming: 'pending',
    missed: 'late',
    on_time: 'completed',
    warning: 'warning',
    late_early: 'late',
  };

  const getStatusTone = (item) => {
    if (item.is_completed) {
      if (item.actual_dose === 0) return 'skipped';
      return STATUS_TONE[item.status] || 'completed';
    }
    return STATUS_TONE[item.status] || 'pending';
  };

  const getStatusText = (item) => {
    if (item.is_completed) {
      if (item.actual_dose === 0) return 'Skipped';
      return item.status === 'on_time' ? 'On Time' : 
             item.status === 'warning' ? 'Slight Delay' : 
             item.status === 'late_early' ? 'Late/Early' : 'Completed';
    }
    if (item.status === 'missed') return 'Missed';
    if (item.status === 'ready') return 'Ready to Take';
    return 'Upcoming';
  };

  const getFilteredMedications = () => {
    return scheduledMedications.filter(med => {
      if (med.is_completed) {
        if (med.actual_dose === 0) return statusFilters.skipped;
        return statusFilters.completed;
      }
      if (med.status === 'missed') return statusFilters.missed;
      if (med.status === 'ready') return statusFilters.ready;
      return statusFilters.upcoming;
    });
  };

  // Raw item -> ScheduleBoard row. Actions are built here since only the page
  // knows permissions and what each status can still do.
  const toRow = (item) => {
    const actions = [];
    if (!item.is_completed && hasPermission('medications.update')) {
      actions.push({
        key: 'take',
        label: item.status === 'missed' ? 'Take Now' : 'Mark Taken',
        tone: 'primary',
        onClick: () => handleMarkTaken(item),
      });
      if (item.status === 'missed') {
        actions.push({ key: 'skip', label: 'Skip', tone: 'ghost', onClick: () => handleSkip(item) });
      }
    }
    if (item.is_completed && item.log_id && hasPermission('medications.update')) {
      actions.push({ key: 'undo', label: 'Undo', tone: 'ghost', onClick: () => handleUndo(item) });
    }

    return {
      id: `${item.schedule_id}-${item.scheduled_time}`,
      title: item.medication_name,
      meta: [`${item.dose_amount} ${item.dose_unit || 'units'}`, item.concentration].filter(Boolean).join(' · '),
      scheduleLine: item.actual_time
        ? `Taken at ${new Date(item.actual_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`
        : recurrenceLabel(item.description),
      statusLabel: getStatusText(item),
      statusTone: getStatusTone(item),
      completed: item.is_completed,
      actions,
    };
  };

  // Day (real calendar date, timezone-correct via scheduled_time) then time
  // slot (reusing scheduleRollup.js's groupBySlot — the same grouping the live
  // dashboard's dose panel uses).
  const buildDayGroups = (items) => {
    const days = new Map();
    items.forEach((item) => {
      const dayKey = new Date(item.scheduled_time).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      if (!days.has(dayKey)) days.set(dayKey, { key: dayKey, date: new Date(item.scheduled_time), items: [] });
      days.get(dayKey).items.push(item);
    });
    return [...days.values()]
      .sort((a, b) => a.date - b.date)
      .map((day) => ({
        key: day.key,
        label: day.key,
        slots: groupBySlot(day.items).map((slot) => ({
          time: slot.time,
          items: slot.items.map(toRow),
        })),
      }));
  };

  const handleMarkTaken = async (medication) => {
    const check = checkAdministrationWindow(medication.scheduled_time);
    if (check.status === 'early' || check.status === 'late') {
      setWindowConfirm({ open: true, medication, check });
      return;
    }
    await submitMarkTaken(medication, false);
  };

  const submitMarkTaken = async (medication, earlyOverride = false) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/${medication.medication_id}/administer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          schedule_id: medication.schedule_id,
          scheduled_time: medication.scheduled_time,
          dose_amount: medication.dose_amount,
          notes: '',
          early_override: earlyOverride,
          ...(selectedPatient?.id != null && { patient_id: selectedPatient.id })
        })
      });

      if (response.ok) {
        await fetchSchedule();
      } else {
        const data = await response.json().catch(() => ({}));
        const offWindowError = response.status === 409 && (
          data.error === 'early_administration' ||
          data.error === 'late_administration' ||
          data.error === 'off_window_administration'
        );
        if (offWindowError) {
          // Backend caught what the frontend missed — surface the same warning modal.
          setWindowConfirm({
            open: true,
            medication,
            check: checkAdministrationWindow(medication.scheduled_time),
          });
        } else {
          alert(data.detail || 'Failed to mark as taken');
        }
      }
    } catch (err) {
      console.error('Error marking medication as taken:', err);
      alert('Error connecting to server');
    }
  };

  const handleSkip = async (medication) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/${medication.medication_id}/administer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          schedule_id: medication.schedule_id,
          scheduled_time: medication.scheduled_time,
          dose_amount: 0,
          notes: 'Skipped',
          ...(selectedPatient?.id != null && { patient_id: selectedPatient.id })
        })
      });

      if (response.ok) {
        await fetchSchedule();
      } else {
        const data = await response.json();
        alert(data.detail || 'Failed to skip medication');
      }
    } catch (err) {
      console.error('Error skipping medication:', err);
      alert('Error connecting to server');
    }
  };

  // Undo a completed/skipped dose — deletes the administration log and (for
  // real doses) restores the deducted on-hand quantity. For mistakes like
  // marking a dose on the wrong day.
  const handleUndo = async (medication) => {
    const wasSkip = medication.actual_dose === 0;
    const confirmMsg = wasSkip
      ? `Undo the skip for ${medication.medication_name}? It will show as not yet taken again.`
      : `Undo this dose of ${medication.medication_name}? This removes the administration record and restores the on-hand quantity.`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const response = await fetch(
        `${config.apiUrl}/api/schedule/log/medication/${medication.log_id}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (response.ok) {
        await fetchSchedule();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.detail || 'Failed to undo');
      }
    } catch (err) {
      console.error('Error undoing administration:', err);
      alert('Error connecting to server');
    }
  };

  // Get stats
  const stats = {
    total: scheduledMedications.length,
    ready: scheduledMedications.filter(m => !m.is_completed && m.status === 'ready').length,
    upcoming: scheduledMedications.filter(m => !m.is_completed && m.status === 'upcoming').length,
    missed: scheduledMedications.filter(m => !m.is_completed && m.status === 'missed').length,
    completed: scheduledMedications.filter(m => m.is_completed && m.actual_dose > 0).length,
    skipped: scheduledMedications.filter(m => m.is_completed && m.actual_dose === 0).length
  };

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

  const filteredMeds = getFilteredMedications();
  const dayGroups = buildDayGroups(filteredMeds);

  // Stat tiles double as status filters; the status colour rides on the dot.
  const statTiles = [
    { key: 'ready', label: 'Ready', count: stats.ready, dot: 'var(--vc-state-due)' },
    { key: 'upcoming', label: 'Upcoming', count: stats.upcoming, dot: 'var(--vc-state-idle)' },
    { key: 'missed', label: 'Missed', count: stats.missed, dot: 'var(--vc-state-alert)' },
    { key: 'completed', label: 'Completed', count: stats.completed, dot: 'var(--vc-state-complete)' },
  ];

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <div className="cfg">
            {/* Stats row — each tile toggles its status filter */}
            <div className="cfg-stats">
              {statTiles.map(tile => (
                <button
                  key={tile.key}
                  type="button"
                  className="cfg-stat"
                  aria-pressed={!!statusFilters[tile.key]}
                  onClick={() => setStatusFilters(f => ({ ...f, [tile.key]: !f[tile.key] }))}
                >
                  <span className="cfg-stat-label">
                    <span className="cfg-stat-dot" style={{ background: tile.dot }} aria-hidden="true" />
                    {tile.label}
                  </span>
                  <span className="cfg-stat-value">{tile.count}</span>
                </button>
              ))}
            </div>

            <div className="cfg-toolbar">
              <h3 className="cfg-toolbar-title">
                Today & Yesterday ({filteredMeds.length} of {scheduledMedications.length})
              </h3>
              <button type="button" className="cfg-ghost" onClick={fetchSchedule} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {/* Schedule Content */}
            {error ? (
              <div className="em-error">{error}</div>
            ) : (
              <ScheduleBoard
                dayGroups={dayGroups}
                loading={loading}
                emptyText={
                  scheduledMedications.length === 0
                    ? 'No medications scheduled for today or yesterday'
                    : 'No medications match the selected filters'
                }
              />
            )}
          </div>
        ) : (
          <div className="cfg-nopatient">
            <MedicationsIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their daily medication schedule</p>
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

        {/* Off-window (early or late) administration confirmation */}
        {windowConfirm.open && windowConfirm.medication && windowConfirm.check && (() => {
          const isLate = windowConfirm.check.status === 'late';
          const title = isLate ? 'Warning: Late Administration' : 'Warning: Early Administration';
          const heading = isLate
            ? 'This medication was scheduled earlier'
            : 'This medication is scheduled later';
          const offsetText = isLate
            ? `${formatDurationMinutes(Math.abs(windowConfirm.check.minutesOffset))} ago`
            : `${formatDurationMinutes(windowConfirm.check.minutesOffset)} from now`;
          const consequence = isLate
            ? 'Giving a medication more than 1 hour late can be unsafe.'
            : 'Giving a medication more than 1 hour early can be unsafe.';
          const confirmLabel = isLate ? 'Confirm Late Administration' : 'Confirm Early Administration';
          const close = () => setWindowConfirm({ open: false, medication: null, check: null });
          return (
            <ConfirmSheet
              open
              onOpenChange={(o) => { if (!o) close(); }}
              title={title}
              confirmLabel={confirmLabel}
              onConfirm={async () => {
                const med = windowConfirm.medication;
                close();
                await submitMarkTaken(med, true);
              }}
            >
              <strong className="cs-lead">{heading}</strong>
              <strong>{windowConfirm.medication.name}</strong> is scheduled for{' '}
              <strong>{windowConfirm.check.scheduledLocal}</strong>
              {' '}— that&apos;s <strong>{offsetText}</strong>.
              {' '}{consequence} Confirm this is intentional.
            </ConfirmSheet>
          );
        })()}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2MedicationsSchedule;
