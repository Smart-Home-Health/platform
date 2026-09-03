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
import { TasksIcon } from '../../components/Icons';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import config from '../../config';
import { checkAdministrationWindow, formatDurationMinutes } from '../../utils/timezone';
import ScheduleBoard from '../../components/schedule/ScheduleBoard';
import { groupBySlot } from '../../components/schedule/scheduleRollup';
import ConfirmSheet from '../../components/vc/ConfirmSheet';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

const AdminV2CareTasksSchedule = () => {
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
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Status filter state
  const [statusFilters, setStatusFilters] = useState({
    pending: true,
    due_warning: true,
    due_on_time: true,
    due_late: true,
    upcoming: true,
    missed: true,
    completed: false,
    skipped: false,
    prn: true
  });

  // Off-window (early or late) administration confirmation modal state
  const [windowConfirm, setWindowConfirm] = useState({ open: false, task: null, check: null });

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Check for patient param and sync with context
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
  }, [patients, searchParams, loadingPatients]);

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
        `${config.apiUrl}/api/care-tasks/day?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        setScheduledTasks(data.items || []);
      } else {
        setError('Failed to fetch schedule');
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

  // Status -> ScheduleBoard tone/label
  const STATUS_TONE = {
    pending: 'pending',
    due_warning: 'warning',
    due_on_time: 'ontime',
    due_late: 'late',
    upcoming: 'pending',
    missed: 'late',
    completed: 'completed',
    skipped: 'skipped',
  };
  const STATUS_LABEL = {
    pending: 'Pending',
    due_warning: 'Due Warning',
    due_on_time: 'Due On Time',
    due_late: 'Due Late',
    upcoming: 'Upcoming',
    missed: 'Missed',
    completed: 'Completed',
    skipped: 'Skipped',
  };

  const getStatusTone = (item) => STATUS_TONE[item.status] || 'pending';

  const getStatusText = (item) => {
    if (item.completed) {
      return item.status === 'skipped' ? 'Skipped' : 'Completed';
    }
    return STATUS_LABEL[item.status] || item.status;
  };

  const getFilteredTasks = () => {
    return scheduledTasks.filter(task => {
      // PRN / ad-hoc completions have no scheduled slot; they're toggled by
      // their own PRN filter (default on) rather than the status filters.
      if (task.is_prn) return statusFilters.prn !== false;
      return statusFilters[task.status] !== false;
    });
  };

  // Raw item -> ScheduleBoard row.
  const toRow = (item) => {
    const actions = [];
    // The endpoints behind these require care_tasks.perform, not update:
    // gating on update hid the buttons from users who could complete a
    // task, and showed them to users whose click would 403.
    if (!item.completed && hasPermission('care_tasks.perform')) {
      actions.push({
        key: 'complete',
        label: item.status === 'missed' ? 'Complete Now' : 'Mark Complete',
        tone: 'primary',
        onClick: () => handleMarkCompleted(item),
      });
      actions.push({ key: 'skip', label: 'Skip', tone: 'ghost', onClick: () => handleSkipTask(item) });
    }

    return {
      id: `${item.schedule_id}-${item.scheduled_time}`,
      title: item.name,
      meta: item.description || undefined,
      categoryColor: item.category_color,
      categoryLabel: item.category_name,
      prn: item.is_prn,
      scheduleLine: item.completed_at
        ? `Completed at ${new Date(item.completed_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`
        : undefined,
      statusLabel: getStatusText(item),
      statusTone: getStatusTone(item),
      completed: item.completed,
      actions,
    };
  };

  // Day (real calendar date) then time slot, reusing scheduleRollup.js's
  // groupBySlot — the same grouping the live dashboard's dose panel uses.
  const buildDayGroups = (tasks) => {
    const days = new Map();
    tasks.forEach((item) => {
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

  const handleMarkCompleted = async (task) => {
    const check = checkAdministrationWindow(task.scheduled_time);
    if (check.status === 'early' || check.status === 'late') {
      setWindowConfirm({ open: true, task, check });
      return;
    }
    await submitMarkCompleted(task, false);
  };

  const submitMarkCompleted = async (task, earlyOverride = false) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-schedules/${task.schedule_id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          scheduled_time: task.scheduled_time,
          notes: '',
          early_override: earlyOverride,
        })
      });

      if (response.ok) {
        fetchSchedule();
      } else {
        const errorData = await response.json().catch(() => ({}));
        const offWindowError = response.status === 409 && (
          errorData.error === 'early_administration' ||
          errorData.error === 'late_administration' ||
          errorData.error === 'off_window_administration'
        );
        if (offWindowError) {
          setWindowConfirm({
            open: true,
            task,
            check: checkAdministrationWindow(task.scheduled_time),
          });
        } else {
          alert(errorData.detail || 'Failed to mark task as completed');
        }
      }
    } catch (err) {
      console.error('Error marking task as completed:', err);
      alert('Error connecting to server');
    }
  };

  const handleSkipTask = async (task) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-schedules/${task.schedule_id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          scheduled_time: task.scheduled_time,
          notes: 'Skipped'
        })
      });

      if (response.ok) {
        fetchSchedule();
      } else {
        const errorData = await response.json();
        alert(errorData.detail || 'Failed to skip task');
      }
    } catch (err) {
      console.error('Error skipping task:', err);
      alert('Error connecting to server');
    }
  };

  // Get stats
  const stats = {
    total: scheduledTasks.length,
    ready: scheduledTasks.filter(t => ['due_on_time', 'due_warning', 'due_late'].includes(t.status)).length,
    upcoming: scheduledTasks.filter(t => ['pending', 'upcoming'].includes(t.status)).length,
    missed: scheduledTasks.filter(t => t.status === 'missed').length,
    // Scheduled completions/skips only — PRN is counted separately below.
    completed: scheduledTasks.filter(t => t.status === 'completed' && !t.is_prn).length,
    skipped: scheduledTasks.filter(t => t.status === 'skipped' && !t.is_prn).length,
    prn: scheduledTasks.filter(t => t.is_prn).length
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

  const filteredTasks = getFilteredTasks();
  const dayGroups = buildDayGroups(filteredTasks);

  // Stat tiles double as status filters; a tile that spans several statuses
  // toggles them together. Status colour rides on the dot; PRN is an identity
  // (avatar palette), not a state.
  const statTiles = [
    { key: 'ready', label: 'Ready', count: stats.ready, dot: 'var(--vc-state-due)', keys: ['due_on_time', 'due_warning', 'due_late'] },
    { key: 'upcoming', label: 'Upcoming', count: stats.upcoming, dot: 'var(--vc-state-idle)', keys: ['pending', 'upcoming'] },
    { key: 'missed', label: 'Missed', count: stats.missed, dot: 'var(--vc-state-alert)', keys: ['missed'] },
    { key: 'completed', label: 'Completed', count: stats.completed, dot: 'var(--vc-state-complete)', keys: ['completed'] },
    { key: 'skipped', label: 'Skipped', count: stats.skipped, dot: 'var(--vc-state-idle)', keys: ['skipped'] },
    { key: 'prn', label: 'PRN', count: stats.prn, dot: 'var(--vc-avatar-plum)', keys: ['prn'] },
  ];

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <div className="cfg">
            {/* Stats row — each tile toggles its status filter(s) */}
            <div className="cfg-stats row">
              {statTiles.map(tile => {
                const pressed = tile.keys.every(k => statusFilters[k]);
                return (
                  <button
                    key={tile.key}
                    type="button"
                    className="cfg-stat"
                    aria-pressed={pressed}
                    onClick={() => setStatusFilters(f => {
                      const next = { ...f };
                      for (const k of tile.keys) next[k] = !pressed;
                      return next;
                    })}
                  >
                    <span className="cfg-stat-label">
                      <span className="cfg-stat-dot" style={{ background: tile.dot }} aria-hidden="true" />
                      {tile.label}
                    </span>
                    <span className="cfg-stat-value">{tile.count}</span>
                  </button>
                );
              })}
            </div>

            <div className="cfg-toolbar">
              <h3 className="cfg-toolbar-title">
                Today & Yesterday ({filteredTasks.length} of {scheduledTasks.length})
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
                  scheduledTasks.length === 0
                    ? 'No care tasks scheduled for today or yesterday'
                    : 'No care tasks match the selected filters'
                }
              />
            )}
          </div>
        ) : (
          <div className="cfg-nopatient">
            <TasksIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their daily care tasks schedule</p>
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

        {/* Off-window (early or late) completion confirmation */}
        {windowConfirm.open && windowConfirm.task && windowConfirm.check && (() => {
          const isLate = windowConfirm.check.status === 'late';
          const title = isLate ? 'Warning: Late Completion' : 'Warning: Early Completion';
          const heading = isLate
            ? 'This care task was scheduled earlier'
            : 'This care task is scheduled later';
          const offsetText = isLate
            ? `${formatDurationMinutes(Math.abs(windowConfirm.check.minutesOffset))} ago`
            : `${formatDurationMinutes(windowConfirm.check.minutesOffset)} from now`;
          const confirmLabel = isLate ? 'Confirm Late Completion' : 'Confirm Early Completion';
          const close = () => setWindowConfirm({ open: false, task: null, check: null });
          return (
            <ConfirmSheet
              open
              onOpenChange={(o) => { if (!o) close(); }}
              title={title}
              confirmLabel={confirmLabel}
              onConfirm={async () => {
                const task = windowConfirm.task;
                close();
                await submitMarkCompleted(task, true);
              }}
            >
              <strong className="cs-lead">{heading}</strong>
              <strong>{windowConfirm.task.name}</strong> is scheduled for{' '}
              <strong>{windowConfirm.check.scheduledLocal}</strong>
              {' '}— that&apos;s <strong>{offsetText}</strong>.
              {' '}Confirm this is intentional before marking it complete.
            </ConfirmSheet>
          );
        })()}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2CareTasksSchedule;
