import React, { useState, useEffect, useMemo } from 'react';
import ModalBase from './ModalBase';
import config from '../config';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import ScheduleList from './schedule/ScheduleList';
import NutritionTrackingModal from './nutrition/NutritionTrackingModal';
import {
  checkAdministrationWindow,
  formatDurationMinutes,
  getCurrentLocalDateTime,
  localDateTimeToUTC,
} from '../utils/timezone';

const CareTaskModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const [tab, setTab] = useState('scheduled');
  const [activeTasks, setActiveTasks] = useState([]);
  const [scheduledTasks, setScheduledTasks] = useState({ scheduled_care_tasks: [] });
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Status filter state for scheduled tasks — match backend status values
  const [statusFilters, setStatusFilters] = useState({
    pending: true,
    due_warning: true,
    due_on_time: true,
    due_late: true,
    upcoming: true,
    missed: true,
    completed: false,
    skipped: false,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Off-window (early/late) completion confirmation
  const [windowConfirm, setWindowConfirm] = useState({ open: false, task: null, check: null });

  // Nutrition tracking modal state
  const [nutritionModal, setNutritionModal] = useState({
    open: false,
    careTaskLogId: null,
    careTaskName: '',
    nutritionData: null,
  });

  // PRN flow — pick task, enter when it was done + notes
  const [prnModal, setPrnModal] = useState({ open: false, selectedTask: null });
  const [prnForm, setPrnForm] = useState({ completed_at: '', notes: '' });
  const [prnSaving, setPrnSaving] = useState(false);
  const [prnError, setPrnError] = useState(null);

  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Inject keyframes once (used by spinners + modal animations)
  useEffect(() => {
    if (document.getElementById('care-task-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'care-task-modal-styles';
    style.textContent = `
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
      @keyframes slideUp { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);
  }, []);

  // Load data when tab or patient changes
  useEffect(() => {
    if (!selectedPatient) return;
    if (tab === 'scheduled') fetchScheduledTasks();
    if (tab === 'active') fetchActiveTasks();
  }, [tab, selectedPatient?.id]);

  const fetchActiveTasks = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/care-tasks/active?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setActiveTasks(data.care_tasks || []);
      }
    } catch (error) {
      console.error('Error fetching care tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduledTasks = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/care-task-schedules/daily?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        setScheduledTasks(await res.json());
      }
    } catch (error) {
      console.error('Error fetching scheduled care tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  // Normalize the API rows into the shape ScheduleList expects.
  const scheduledItems = useMemo(() => {
    const raw = scheduledTasks.scheduled_care_tasks || [];
    return raw.map(item => ({
      id: `${item.schedule_id}-${item.scheduled_time}`,
      scheduled_time: item.scheduled_time,
      name: item.care_task_name,
      description: item.care_task_description,
      category: item.care_task_category_name
        ? { name: item.care_task_category_name, color: item.care_task_category_color || '#6f42c1' }
        : null,
      status: item.status,
      is_completed: !!item.is_completed,
      is_yesterday: !!item.is_yesterday,
      // pass the original row back so handlers can use it
      _raw: item,
    }));
  }, [scheduledTasks]);

  // ===== Scheduled task complete/skip handlers =====
  const submitMarkCompleted = async (task, earlyOverride = false) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/care-task-schedules/${task.schedule_id}/complete`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduled_time: task.scheduled_time,
            notes: 'Completed via web interface',
            early_override: earlyOverride,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.requires_nutrition_tracking && result.care_task) {
          setNutritionModal({
            open: true,
            careTaskLogId: result.id,
            careTaskName: result.care_task.name,
            nutritionData: result.nutrition_data || null,
          });
        }
        fetchScheduledTasks();
        return;
      }

      const errorData = await response.json().catch(() => ({}));
      const offWindow = response.status === 409 && (
        errorData.error === 'early_administration' ||
        errorData.error === 'late_administration' ||
        errorData.error === 'off_window_administration'
      );
      if (offWindow && !earlyOverride) {
        setWindowConfirm({
          open: true,
          task,
          check: checkAdministrationWindow(task.scheduled_time),
        });
        return;
      }
      alert(errorData.detail || 'Failed to mark task as completed');
    } catch (error) {
      console.error('Error marking task as completed:', error);
      alert('Error connecting to server');
    }
  };

  const handleMarkCompleted = (task) => submitMarkCompleted(task, false);

  const handleSkipTask = async (task) => {
    try {
      const res = await fetch(
        `${config.apiUrl}/api/care-task-schedules/${task.schedule_id}/skip`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduled_time: task.scheduled_time,
            notes: 'Skipped via web interface',
          }),
        }
      );
      if (res.ok) {
        fetchScheduledTasks();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.detail || 'Failed to skip task');
      }
    } catch (error) {
      console.error('Error skipping task:', error);
      alert('Error connecting to server');
    }
  };

  // ===== PRN handlers =====
  const openPrnPicker = () => {
    setPrnError(null);
    setPrnModal({ open: true, selectedTask: null });
    if (activeTasks.length === 0) fetchActiveTasks();
  };

  const closePrnModal = () => {
    setPrnModal({ open: false, selectedTask: null });
    setPrnForm({ completed_at: '', notes: '' });
    setPrnError(null);
    setPrnSaving(false);
  };

  const pickPrnTask = (task) => {
    setPrnForm({ completed_at: getCurrentLocalDateTime(), notes: '' });
    setPrnError(null);
    setPrnModal({ open: true, selectedTask: task });
  };

  const handlePrnSave = async () => {
    if (!prnModal.selectedTask || !selectedPatient) return;
    setPrnSaving(true);
    setPrnError(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/care-tasks/${prnModal.selectedTask.id}/complete`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_id: selectedPatient.id,
            completed_at: prnForm.completed_at ? localDateTimeToUTC(prnForm.completed_at) : null,
            notes: prnForm.notes || null,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to record completion');
      }
      const result = await res.json();
      if (result.requires_nutrition_tracking && result.care_task) {
        setNutritionModal({
          open: true,
          careTaskLogId: result.id,
          careTaskName: result.care_task.name,
          nutritionData: null,
        });
      }
      // Refresh whichever view we came from
      if (tab === 'scheduled') fetchScheduledTasks();
      else fetchActiveTasks();
      closePrnModal();
    } catch (err) {
      setPrnError(err.message);
    } finally {
      setPrnSaving(false);
    }
  };

  // Group active tasks by category for display + sorting
  const groupByCategory = (tasks) => {
    const groups = new Map();
    for (const t of tasks) {
      const key = t.category_id ?? -1;
      if (!groups.has(key)) {
        groups.set(key, {
          id: t.category_id,
          name: t.category_name || 'Uncategorized',
          color: t.category_color || '#6f42c1',
          tasks: [],
        });
      }
      groups.get(key).tasks.push(t);
    }
    const arr = Array.from(groups.values());
    arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    for (const g of arr) g.tasks.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return arr;
  };

  // ===== Render =====
  const tabButton = (key, label, color = '#007bff') => (
    <button
      key={key}
      onClick={() => setTab(key)}
      style={{
        padding: '8px 14px',
        border: 'none',
        borderRadius: '6px',
        backgroundColor: tab === key ? color : '#f8f9fa',
        color: tab === key ? '#fff' : '#333',
        cursor: 'pointer',
        fontWeight: '500',
        fontSize: '13px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <ModalBase isOpen={true} onClose={onClose} title={
        isMobile ? (
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value)}
              style={{
                flex: 1,
                padding: '12px 16px',
                fontSize: '15px',
                fontWeight: '600',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                backgroundColor: '#1a2332',
                color: '#fff',
                cursor: 'pointer',
                outline: 'none',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                backgroundSize: '20px',
                paddingRight: '40px',
                minWidth: 0,
              }}
            >
              <option value="scheduled" style={{ backgroundColor: '#1a2332', color: '#fff' }}>Scheduled</option>
              <option value="active" style={{ backgroundColor: '#1a2332', color: '#fff' }}>Active ({activeTasks.length})</option>
            </select>
            <button
              onClick={openPrnPicker}
              disabled={!selectedPatient}
              style={{
                padding: '12px 18px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: '#6f42c1',
                color: '#fff',
                cursor: selectedPatient ? 'pointer' : 'not-allowed',
                opacity: selectedPatient ? 1 : 0.6,
                fontWeight: '600',
                fontSize: '15px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                flexShrink: 0,
              }}
              title={selectedPatient ? 'Mark any task done now' : 'Select a patient first'}
            >
              PRN
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            {tabButton('scheduled', 'Scheduled')}
            {tabButton('active', `Active (${activeTasks.length})`)}
            <button
              onClick={openPrnPicker}
              disabled={!selectedPatient}
              style={{
                padding: '8px 14px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: '#6f42c1',
                color: '#fff',
                cursor: selectedPatient ? 'pointer' : 'not-allowed',
                opacity: selectedPatient ? 1 : 0.6,
                fontWeight: '500',
                fontSize: '13px',
                whiteSpace: 'nowrap',
              }}
              title={selectedPatient ? 'Mark any task done now' : 'Select a patient first'}
            >
              PRN
            </button>
          </div>
        )
      }>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Patient banner */}
          <div style={{
            marginBottom: 16,
            padding: 12,
            backgroundColor: selectedPatient ? '#e8f4fd' : '#fff3cd',
            borderRadius: 6,
            border: selectedPatient ? '1px solid #b3d7ff' : '1px solid #ffeaa7',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: 14, color: selectedPatient ? '#0066cc' : '#856404', fontWeight: 500 }}>
              {selectedPatient
                ? <>Viewing care tasks for: {selectedPatient.first_name} {selectedPatient.last_name}</>
                : 'No patient selected'}
            </span>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading && (
              <div style={{ textAlign: 'center', padding: '40px' }}><div>Loading...</div></div>
            )}

            {!loading && tab === 'scheduled' && (
              <ScheduleList
                items={scheduledItems}
                title="Scheduled Care Tasks"
                emptyText="No scheduled care tasks"
                onMarkComplete={(item) => handleMarkCompleted(item._raw)}
                onSkip={(item) => handleSkipTask(item._raw)}
                statusFilters={statusFilters}
                setStatusFilters={setStatusFilters}
                showFilters={showFilters}
                setShowFilters={setShowFilters}
              />
            )}

            {!loading && tab === 'active' && (
              activeTasks.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: '#a0aec0',
                  backgroundColor: '#2d3748',
                  borderRadius: '8px',
                  border: '1px solid #4a5568',
                }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 500, color: '#fff' }}>
                    No active care tasks
                  </p>
                  <p style={{ margin: 0 }}>Add care tasks from the Care Tasks admin page.</p>
                </div>
              ) : (
                <div>
                  {groupByCategory(activeTasks).map(group => (
                    <div key={group.id ?? 'uncat'} style={{ marginBottom: 24 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 10,
                        paddingBottom: 6,
                        borderBottom: `2px solid ${group.color}`,
                      }}>
                        <span style={{
                          width: 14, height: 14, borderRadius: '50%',
                          backgroundColor: group.color,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                        <h4 style={{ margin: 0, color: '#fff', fontSize: 16, fontWeight: 700 }}>
                          {group.name}
                        </h4>
                        <span style={{
                          fontSize: 12, color: '#cbd5e0', fontWeight: 500,
                          backgroundColor: 'rgba(255,255,255,0.08)',
                          padding: '2px 8px', borderRadius: 10,
                        }}>
                          {group.tasks.length}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {group.tasks.map(task => (
                          <button
                            key={task.id}
                            onClick={() => pickPrnTask(task)}
                            style={{
                              textAlign: 'left',
                              backgroundColor: '#fff',
                              border: '1px solid #e9ecef',
                              borderLeft: `5px solid ${group.color}`,
                              borderRadius: 8,
                              padding: '12px 14px',
                              cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 12,
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: '#333', fontWeight: 600, fontSize: 15, marginBottom: 2 }}>
                                {task.name}
                              </div>
                              {task.description && (
                                <div style={{ color: '#666', fontSize: 13, lineHeight: 1.3 }}>
                                  {task.description}
                                </div>
                              )}
                            </div>
                            <span style={{
                              backgroundColor: '#28a745',
                              color: '#fff',
                              padding: '6px 12px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              flexShrink: 0,
                            }}>
                              Mark Done
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </ModalBase>

      {/* Off-window completion confirmation */}
      {windowConfirm.open && windowConfirm.task && windowConfirm.check && (() => {
        const isLate = windowConfirm.check.status === 'late';
        const title = isLate ? 'Confirm Late Completion' : 'Confirm Early Completion';
        const heading = isLate
          ? 'This care task was scheduled earlier'
          : 'This care task is scheduled later';
        const offsetText = isLate
          ? `${formatDurationMinutes(Math.abs(windowConfirm.check.minutesOffset))} ago`
          : `${formatDurationMinutes(windowConfirm.check.minutesOffset)} from now`;
        const close = () => setWindowConfirm({ open: false, task: null, check: null });
        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1060, animation: 'fadeIn 0.2s ease-out',
          }} onClick={close}>
            <div onClick={(e) => e.stopPropagation()} style={{
              backgroundColor: '#1a2332', borderRadius: 12, padding: 24,
              maxWidth: 440, width: '90%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              animation: 'slideUp 0.25s ease-out', color: '#e6edf3',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: 'rgba(240,136,62,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#f0883e', fontSize: 18, fontWeight: 700,
                }}>⚠</div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
              </div>
              <div style={{
                background: 'rgba(187,128,9,0.15)',
                border: '1px solid rgba(187,128,9,0.5)',
                borderRadius: 6, padding: '12px 14px', fontSize: 14, lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 600, color: '#f0883e', marginBottom: 6 }}>{heading}</div>
                <div>
                  <strong>{windowConfirm.task.care_task_name || windowConfirm.task.name}</strong> is scheduled for{' '}
                  <strong>{windowConfirm.check.scheduledLocal}</strong> — that's{' '}
                  <strong>{offsetText}</strong>.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button onClick={close} style={{
                  padding: '10px 18px', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, background: 'transparent', color: '#e6edf3',
                  cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}>Cancel</button>
                <button
                  onClick={async () => {
                    const task = windowConfirm.task;
                    close();
                    await submitMarkCompleted(task, true);
                  }}
                  style={{
                    padding: '10px 18px', border: 'none', borderRadius: 8,
                    background: '#bb8009', color: '#0d1117',
                    cursor: 'pointer', fontSize: 14, fontWeight: 600,
                  }}
                >Complete Anyway</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PRN modal — pick a task, then enter time + notes */}
      {prnModal.open && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1060, animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={closePrnModal}
        >
          <div
            style={{
              backgroundColor: '#1a2332', borderRadius: 12, padding: 24,
              maxWidth: 480, width: '90%', maxHeight: '85vh', overflow: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              animation: 'slideUp 0.25s ease-out', color: '#e6edf3',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16, paddingBottom: 12,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {prnModal.selectedTask ? `Mark Done — ${prnModal.selectedTask.name}` : 'Mark a Care Task Done'}
              </h3>
              <button
                onClick={closePrnModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#a0aec0', lineHeight: 1, padding: 0 }}
                aria-label="Close"
              >×</button>
            </div>

            {prnError && (
              <div role="alert" style={{
                background: 'rgba(220,53,69,0.15)',
                border: '1px solid rgba(220,53,69,0.5)',
                borderRadius: 6, padding: '10px 12px', marginBottom: 16,
                color: '#f8d7da', fontSize: 13,
              }}>{prnError}</div>
            )}

            {/* Step 1: pick a task */}
            {!prnModal.selectedTask && (
              activeTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 8px', color: '#a0aec0' }}>
                  No active care tasks for this patient.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {groupByCategory(activeTasks).map(group => (
                    <div key={group.id ?? 'uncat'}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#cbd5e0',
                      }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: group.color }} />
                        {group.name}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {group.tasks.map(task => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => pickPrnTask(task)}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '10px 12px', textAlign: 'left',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderLeft: `4px solid ${group.color}`,
                              borderRadius: 6, cursor: 'pointer', color: '#e6edf3',
                            }}
                          >
                            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <strong style={{ fontSize: 14 }}>{task.name}</strong>
                              {task.description && (
                                <span style={{ color: '#a0aec0', fontSize: 12, lineHeight: 1.3 }}>
                                  {task.description}
                                </span>
                              )}
                            </span>
                            <span style={{
                              background: '#6f42c1', color: '#fff',
                              padding: '4px 10px', borderRadius: 12,
                              fontSize: 12, fontWeight: 600, flexShrink: 0, marginLeft: 8,
                            }}>Pick</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Step 2: time + notes */}
            {prnModal.selectedTask && (
              <>
                {prnModal.selectedTask.description && (
                  <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '10px 12px', marginBottom: 16,
                    color: '#cbd5e0', fontSize: 13,
                  }}>{prnModal.selectedTask.description}</div>
                )}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                    Completed At *
                  </label>
                  <input
                    type="datetime-local"
                    value={prnForm.completed_at}
                    onChange={(e) => setPrnForm(f => ({ ...f, completed_at: e.target.value }))}
                    style={{
                      width: '100%', padding: 10, fontSize: 14,
                      border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                      boxSizing: 'border-box', background: '#2d3748', color: '#fff',
                    }}
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                    Notes (optional)
                  </label>
                  <textarea
                    value={prnForm.notes}
                    onChange={(e) => setPrnForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    style={{
                      width: '100%', padding: 10, fontSize: 14,
                      border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                      boxSizing: 'border-box', background: '#2d3748', color: '#fff',
                      resize: 'vertical',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={() => setPrnModal({ open: true, selectedTask: null })}
                    disabled={prnSaving}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                      background: 'transparent', color: '#e6edf3',
                      cursor: prnSaving ? 'not-allowed' : 'pointer', fontSize: 14,
                    }}
                  >← Back</button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={closePrnModal}
                      disabled={prnSaving}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                        background: 'transparent', color: '#e6edf3',
                        cursor: prnSaving ? 'not-allowed' : 'pointer', fontSize: 14,
                      }}
                    >Cancel</button>
                    <button
                      type="button"
                      onClick={handlePrnSave}
                      disabled={prnSaving || !prnForm.completed_at}
                      style={{
                        padding: '8px 16px', border: 'none', borderRadius: 6,
                        background: '#28a745', color: '#fff',
                        cursor: (prnSaving || !prnForm.completed_at) ? 'not-allowed' : 'pointer',
                        fontSize: 14, fontWeight: 600,
                        opacity: (prnSaving || !prnForm.completed_at) ? 0.6 : 1,
                      }}
                    >{prnSaving ? 'Saving...' : 'Mark Done'}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Nutrition Tracking Modal */}
      <NutritionTrackingModal
        isOpen={nutritionModal.open}
        onClose={() => setNutritionModal({ open: false, careTaskLogId: null, careTaskName: '', nutritionData: null })}
        careTaskLogId={nutritionModal.careTaskLogId}
        careTaskName={nutritionModal.careTaskName}
        nutritionData={nutritionModal.nutritionData}
        onSave={() => fetchScheduledTasks()}
      />
    </>
  );
};

export default CareTaskModal;
