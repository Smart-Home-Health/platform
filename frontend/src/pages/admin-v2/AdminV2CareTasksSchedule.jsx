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
import { TasksIcon, ClockIcon, CheckIcon, XIcon } from '../../components/Icons';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import config from '../../config';
import { checkAdministrationWindow, formatDurationMinutes } from '../../utils/timezone';
import ScheduleBoard from '../../components/schedule/ScheduleBoard';
import { groupBySlot } from '../../components/schedule/scheduleRollup';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import './AdminV2.css';

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
      scheduleLine: item.completed_time
        ? `Completed at ${new Date(item.completed_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`
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
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  const filteredTasks = getFilteredTasks();
  const dayGroups = buildDayGroups(filteredTasks);

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {/* Stats Row */}
            <div className="admin-v2-summary-stats admin-v2-care-tasks-stat-summary">
              <div 
                className={`admin-v2-stat-card ${statusFilters.due_on_time && statusFilters.due_warning && statusFilters.due_late ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ 
                  ...f, 
                  due_on_time: !f.due_on_time,
                  due_warning: !f.due_warning,
                  due_late: !f.due_late
                }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'var(--sched-ontime-chip, rgba(35, 134, 54, 0.15))' }}>
                  <ClockIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.ready}</h4>
                  <p>Ready</p>
                </div>
              </div>
              <div 
                className={`admin-v2-stat-card ${statusFilters.pending && statusFilters.upcoming ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ 
                  ...f, 
                  pending: !f.pending,
                  upcoming: !f.upcoming
                }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'var(--sched-ontime-chip, rgba(88, 166, 255, 0.15))' }}>
                  <ClockIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.upcoming}</h4>
                  <p>Upcoming</p>
                </div>
              </div>
              <div 
                className={`admin-v2-stat-card ${statusFilters.missed ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ ...f, missed: !f.missed }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'var(--sched-late-chip, rgba(248, 81, 73, 0.15))' }}>
                  <XIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.missed}</h4>
                  <p>Missed</p>
                </div>
              </div>
              <div
                className={`admin-v2-stat-card ${statusFilters.completed ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ ...f, completed: !f.completed }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'var(--sched-completed-chip, rgba(35, 134, 54, 0.15))' }}>
                  <CheckIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.completed}</h4>
                  <p>Completed</p>
                </div>
              </div>
              <div
                className={`admin-v2-stat-card ${statusFilters.skipped ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ ...f, skipped: !f.skipped }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(139, 148, 158, 0.15)' }}>
                  <XIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.skipped}</h4>
                  <p>Skipped</p>
                </div>
              </div>
              <div
                className={`admin-v2-stat-card ${statusFilters.prn ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ ...f, prn: !f.prn }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(111, 66, 193, 0.15)' }}>
                  <TasksIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.prn}</h4>
                  <p>PRN</p>
                </div>
              </div>
            </div>

            {/* Refresh Button */}
            <div className="admin-v2-page-header tw">
              <h3 style={{ margin: 0, color: 'var(--foreground)' }}>
                Today & Yesterday ({filteredTasks.length} of {scheduledTasks.length})
              </h3>
              <Button onClick={fetchSchedule} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {/* Schedule Content */}
            {error ? (
              <div className="tw"><Alert variant="destructive">{error}</Alert></div>
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
          </>
        ) : (
          <div className="admin-v2-no-patient">
            <TasksIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their daily care tasks schedule</p>
            <div className="tw">
              <Button onClick={() => setShowPatientModal(true)}>
                Select Patient
              </Button>
            </div>
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

        {/* Off-window (early or late) completion confirmation Dialog */}
        {(() => {
          const isLate = windowConfirm.check?.status === 'late';
          const title = isLate ? 'Warning: Late Completion' : 'Warning: Early Completion';
          const heading = isLate
            ? 'This care task was scheduled earlier'
            : 'This care task is scheduled later';
          const offsetText = windowConfirm.check && (isLate
            ? `${formatDurationMinutes(Math.abs(windowConfirm.check.minutesOffset))} ago`
            : `${formatDurationMinutes(windowConfirm.check.minutesOffset)} from now`);
          const confirmLabel = isLate ? 'Confirm Late Completion' : 'Confirm Early Completion';
          const close = () => setWindowConfirm({ open: false, task: null, check: null });
          return (
            <Dialog open={windowConfirm.open && !!windowConfirm.task} onOpenChange={(o) => { if (!o) close(); }}>
              <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                {windowConfirm.task && windowConfirm.check && (
                  <Alert variant="warning">
                    <AlertTitle className="text-[#f0883e]">{heading}</AlertTitle>
                    <AlertDescription>
                      <strong>{windowConfirm.task.name}</strong> is scheduled for{' '}
                      <strong>{windowConfirm.check.scheduledLocal}</strong>
                      {' '}— that's <strong>{offsetText}</strong>.
                      {' '}Confirm this is intentional before marking it complete.
                    </AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      const task = windowConfirm.task;
                      close();
                      await submitMarkCompleted(task, true);
                    }}
                  >
                    {confirmLabel}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          );
        })()}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2CareTasksSchedule;
