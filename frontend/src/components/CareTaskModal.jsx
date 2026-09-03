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
import { useState, useEffect, useMemo } from 'react';
import ModalBase from './ModalBase';
import config from '../config';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import { useAuth } from '../contexts/AuthContext';
import DoseScheduleView from './schedule/DoseScheduleView';
import DoseDetailPane from './schedule/DoseDetailPane';
import { TASK_LABELS } from './schedule/scheduleLabels';
import { rollupSchedule } from './schedule/scheduleRollup';
import PanelViewSwitcher from './section-panel/PanelViewSwitcher';
import PrnPicker from './section-panel/PrnPicker';
import { careTaskRows } from './section-panel/prnRows';
import './section-panel/section-panel.css';
import './care-task/care-task.css';
import { computeScheduleStatus } from './schedule/scheduleStatus';
import IntakeSheet from './nutrition/IntakeSheet';
import {
  checkAdministrationWindow,
  formatDurationMinutes,
  getCurrentLocalDateTime,
  localDateTimeToUTC,
} from '../utils/timezone';
import ConfirmSheet from './vc/ConfirmSheet';
import EntityModal, { EmField } from './vc/EntityModal';
import { ChevronLeftIcon } from './Icons';

const OFF_WINDOW_ERRORS = ['early_administration', 'late_administration', 'off_window_administration'];

const CareTaskModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const { user } = useAuth();
  const [tab, setTab] = useState('scheduled');
  // Which task the detail pane is showing. Keyed on the schedule slot rather
  // than the normalized id, which embeds log_id and changes the moment a task
  // is completed — selecting by it would drop the selection on the refetch.
  const [selectedId, setSelectedId] = useState(null);
  const [activeTasks, setActiveTasks] = useState([]);
  const [scheduled, setScheduled] = useState([]);   // raw `care_tasks` rows from /api/schedule/daily
  const [loading, setLoading] = useState(false);
  // Off-window (early/late) completion confirmation
  const [windowConfirm, setWindowConfirm] = useState({ open: false, task: null, check: null });

  // Nutrition tracking modal (opens when a nutrition-category task is completed)
  const [nutritionModal, setNutritionModal] = useState({ open: false, careTaskLogId: null, careTaskName: '', nutritionData: null });

  // PRN flow — pick task, enter when it was done + notes
  const [prnModal, setPrnModal] = useState({ open: false, selectedTask: null });
  const [prnForm, setPrnForm] = useState({ completed_at: '', notes: '' });
  const [prnSaving, setPrnSaving] = useState(false);
  const [prnError, setPrnError] = useState(null);

  useEffect(() => {
    if (!selectedPatient) return;
    if (tab === 'scheduled') fetchSchedule();
    // Active tasks are fetched either way: the view menu and the PRN button
    // both report their count, and a button that says 0 until you press it is
    // worse than one extra request.
    fetchActiveTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helpers are recreated each render and selectedPatient is tracked via its id; effect is intentionally keyed on tab/patient id only
  }, [tab, selectedPatient?.id]);

  const fetchActiveTasks = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/api/care-tasks/active?patient_id=${selectedPatient.id}`, { credentials: 'include' });
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

  const fetchSchedule = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const today = new Date();
      const dateParam = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const tz = -today.getTimezoneOffset();
      const res = await fetch(
        `${config.apiUrl}/api/schedule/daily?patient_id=${selectedPatient.id}&target_date=${dateParam}&tz_offset_minutes=${tz}&include_prior_day=true`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setScheduled(data.care_tasks || []);
      }
    } catch (error) {
      console.error('Error fetching scheduled care tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  // Normalize the unified `care_tasks` rows into the shape ScheduleList expects.
  const scheduledItems = useMemo(() => {
    return scheduled.map(item => {
      const status = computeScheduleStatus(item);
      return {
        id: `${item.schedule_id}-${item.scheduled_time}-${item.log_id ?? ''}`,
        scheduled_time: item.scheduled_time,
        name: item.name,
        description: item.description,
        category: item.category_name ? { name: item.category_name, color: item.category_color || 'var(--vc-state-idle)' } : null,
        status,
        is_completed: status === 'completed' || status === 'skipped',
        is_yesterday: !!item.is_yesterday,
        showSkip: true,
        _raw: item,
      };
    });
  }, [scheduled]);

  const taskKey = (raw) => `${raw?.schedule_id ?? 'prn'}-${raw?.scheduled_time}`;
  const selectedItem = useMemo(
    () => scheduledItems.find(i => taskKey(i._raw) === selectedId) || null,
    [scheduledItems, selectedId]
  );
  const recordingAs = user?.full_name || user?.username || null;

  // The menu reports what each view is holding, so you can choose without
  // opening both.
  const viewOptions = useMemo(() => {
    const { counts } = rollupSchedule(scheduledItems);
    const outstanding = counts.missed + counts.due;
    return [
      {
        value: 'scheduled',
        label: 'Scheduled',
        sublabel: "Today's care tasks",
        note: counts.missed > 0
          ? `${counts.missed} missed`
          : (outstanding > 0 ? `${outstanding} due` : 'All done'),
        tone: counts.missed > 0 || outstanding > 0 ? 'due' : 'given',
      },
      {
        value: 'active',
        label: 'Active care tasks',
        sublabel: 'All current task profiles',
        count: activeTasks.length,
      },
    ];
  }, [scheduledItems, activeTasks.length]);

  // ===== Complete (legacy endpoint — carries the nutrition-tracking trigger) =====
  const submitMarkCompleted = async (task, { earlyOverride = false, note } = {}) => {
    try {
      const res = await fetch(`${config.apiUrl}/api/care-task-schedules/${task.schedule_id}/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_time: task.scheduled_time,
          notes: note || 'Completed via live dashboard',
          early_override: earlyOverride,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.requires_nutrition_tracking && result.care_task) {
          setNutritionModal({ open: true, careTaskLogId: result.id, careTaskName: result.care_task.name, nutritionData: result.nutrition_data || null });
        }
        fetchSchedule();
        return;
      }
      const err = await res.json().catch(() => ({}));
      if (res.status === 409 && OFF_WINDOW_ERRORS.includes(err.error) && !earlyOverride) {
        setWindowConfirm({ open: true, task, note, check: checkAdministrationWindow(task.scheduled_time) });
        return;
      }
      window.alert(err.detail || 'Failed to mark task as completed');
    } catch (error) {
      console.error('Error marking task as completed:', error);
      window.alert('Error connecting to server');
    }
  };

  // ===== Skip (unified endpoint — skips aren't gated and skip nutrition tracking) =====
  const handleSkipTask = async (task, { note } = {}) => {
    if (!selectedPatient) return;
    try {
      const res = await fetch(`${config.apiUrl}/api/schedule/complete/care-task`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: task.schedule_id,
          scheduled_time: task.scheduled_time,
          patient_id: selectedPatient.id,
          skipped: true,
          completed_at: null,
          notes: note || 'Skipped via live dashboard',
        }),
      });
      if (res.ok) { fetchSchedule(); return; }
      const err = await res.json().catch(() => ({}));
      window.alert(err.detail || 'Failed to skip task');
    } catch (error) {
      console.error('Error skipping task:', error);
      window.alert('Error connecting to server');
    }
  };

  const closeWindowConfirm = () => setWindowConfirm({ open: false, task: null, note: undefined, check: null });

  // ===== PRN =====
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
      const res = await fetch(`${config.apiUrl}/api/care-tasks/${prnModal.selectedTask.id}/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          completed_at: prnForm.completed_at ? localDateTimeToUTC(prnForm.completed_at) : null,
          notes: prnForm.notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to record completion');
      }
      const result = await res.json();
      if (result.requires_nutrition_tracking && result.care_task) {
        setNutritionModal({ open: true, careTaskLogId: result.id, careTaskName: result.care_task.name, nutritionData: null });
      }
      if (tab === 'scheduled') fetchSchedule(); else fetchActiveTasks();
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
        groups.set(key, { id: t.category_id, name: t.category_name || 'Uncategorized', color: t.category_color || 'var(--vc-state-idle)', tasks: [] });
      }
      groups.get(key).tasks.push(t);
    }
    const arr = Array.from(groups.values());
    arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    for (const g of arr) g.tasks.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return arr;
  };

  // ===== Render =====
  return (
    <>
      <ModalBase isOpen={true} onClose={onClose} title={
        <span className="mp-modal-title">
          <span>Care tasks</span>
          <span className="mp-modal-title-sub">
            {selectedPatient
              ? `${selectedPatient.first_name} ${selectedPatient.last_name} \u00b7 ${tab === 'active' ? 'Active' : 'Schedule'}`
              : 'No patient selected'}
          </span>
        </span>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {!selectedPatient && (
            <div className="ld-dose-empty">No patient selected</div>
          )}

          <PanelViewSwitcher
            views={viewOptions}
            value={tab}
            onChange={setTab}
            actions={[{
              label: 'PRN',
              count: activeTasks.length,
              onClick: openPrnPicker,
              disabled: !selectedPatient,
              title: 'Record an ad-hoc care task',
            }]}
          />

          <div className="ld-panel-scroll">
            {tab === 'scheduled' && (
              <DoseScheduleView
                items={scheduledItems}
                loading={loading}
                emptyText="No scheduled care tasks"
                labels={TASK_LABELS}
                selectedId={selectedItem?.id || null}
                onSelect={(item) => setSelectedId(item ? taskKey(item._raw) : null)}
                onRecord={(item, opts) => submitMarkCompleted(item._raw, opts)}
                onSkip={(item, opts) => handleSkipTask(item._raw, opts)}
                detail={(
                  <DoseDetailPane
                    item={selectedItem}
                    patientId={selectedPatient?.id}
                    recordingAs={recordingAs}
                    labels={TASK_LABELS}
                    scheduleHref="/care/care-tasks/schedule"
                    skipNote="Recorded as skipped with your note"
                    historyQuery={(item, pid) => (item?._raw?.care_task_id
                      ? `/api/care-tasks/history?task_id=${item._raw.care_task_id}&patient_id=${pid}&limit=10`
                      : null)}
                    mapHistoryRow={(row) => ({
                      id: row.id,
                      at: row.completed_at,
                      status: row.completion_status === 'skipped' ? 'Skipped' : 'Done',
                      tone: row.completion_status === 'skipped' ? 'skipped' : 'given',
                      // No "who": the endpoint returns `completed_by` as a raw
                      // user id, and an id on a clinical row is noise. Showing
                      // a name needs the endpoint to resolve it.
                      meta: null,
                      note: row.notes,
                    })}
                    onRecord={(item, opts) => submitMarkCompleted(item._raw, opts)}
                    onSkip={(item, opts) => handleSkipTask(item._raw, opts)}
                  />
                )}
              />
            )}

            {tab === 'active' && (
              loading
                ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--dash-text-muted)' }}>Loading…</div>
                : activeTasks.length === 0
                  ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--dash-text-muted)', backgroundColor: 'var(--dash-surface-2)', borderRadius: 8, border: '1px solid var(--dash-border-strong)' }}>
                      <p style={{ margin: '0 0 10px 0', fontSize: 18, fontWeight: 500, color: 'var(--dash-text)' }}>No active care tasks</p>
                      <p style={{ margin: 0 }}>Add care tasks from the Care Tasks admin page.</p>
                    </div>
                  ) : (
                    <div>
                      {groupByCategory(activeTasks).map(group => (
                        <div key={group.id ?? 'uncat'} style={{ marginBottom: 24 }}>
                          {/* The category reads as a dot beside its name. It used
                              to be a 5px stripe down each card and a rule under
                              the heading, which left the grouping unreadable to
                              anyone who cannot separate the hues. */}
                          <div className="ctm-group-head">
                            <span className="ctm-group-dot" style={{ backgroundColor: group.color }} />
                            <h4>{group.name}</h4>
                            <span className="ctm-group-count">{group.tasks.length}</span>
                          </div>
                          <div className="ctm-group-list">
                            {group.tasks.map(task => (
                              <button key={task.id} type="button" className="ctm-task"
                                      onClick={() => pickPrnTask(task)}>
                                <span className="ctm-task-text">
                                  <span className="ctm-task-name">{task.name}</span>
                                  {task.description && (
                                    <span className="ctm-task-desc">{task.description}</span>
                                  )}
                                </span>
                                <span className="ctm-task-action">Mark done</span>
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
        const heading = isLate ? 'This care task was scheduled earlier' : 'This care task is scheduled later';
        const offsetText = isLate
          ? `${formatDurationMinutes(Math.abs(windowConfirm.check.minutesOffset))} ago`
          : `${formatDurationMinutes(windowConfirm.check.minutesOffset)} from now`;
        return (
          <ConfirmSheet
            open
            onOpenChange={(o) => { if (!o) closeWindowConfirm(); }}
            title={title}
            confirmLabel="Complete anyway"
            onConfirm={async () => {
              const { task, note } = windowConfirm;
              closeWindowConfirm();
              await submitMarkCompleted(task, { earlyOverride: true, note });
            }}
          >
            <strong className="cs-lead">{heading}</strong>
            <strong>{windowConfirm.task.name}</strong> is scheduled for{' '}
            <strong>{windowConfirm.check.scheduledLocal}</strong> — that&apos;s <strong>{offsetText}</strong>.
          </ConfirmSheet>
        );
      })()}

      {/* PRN modal — pick a task, then enter time + notes */}
      {/* PRN step 1: pick a task */}
      <PrnPicker
        open={prnModal.open && !prnModal.selectedTask}
        onOpenChange={(o) => { if (!o) closePrnModal(); }}
        patientName={selectedPatient
          ? `${selectedPatient.first_name} ${selectedPatient.last_name}`.trim()
          : null}
        rows={careTaskRows(activeTasks)}
        onSelect={pickPrnTask}
        eyebrow="Ad-hoc care task"
        title="Select task"
        hint="Select a task to set when it was done"
        emptyText="No active care tasks for this patient."
      />

      {/* PRN step 2: when it was done + notes */}
      <EntityModal
        open={prnModal.open && !!prnModal.selectedTask}
        onOpenChange={(o) => { if (!o) closePrnModal(); }}
        title={prnModal.selectedTask ? `Mark Done — ${prnModal.selectedTask.name}` : 'Mark a Care Task Done'}
      >
        <div className="em-form">
          {prnError && <div className="em-error">{prnError}</div>}

          {/* Step 2: time + notes */}
          {prnModal.selectedTask && (
            <>
              {prnModal.selectedTask.description && (
                <p className="em-hint">{prnModal.selectedTask.description}</p>
              )}
              <EmField label="Completed At" required htmlFor="ct-prn-when">
                <input
                  id="ct-prn-when"
                  className="em-input"
                  type="datetime-local"
                  value={prnForm.completed_at}
                  onChange={(e) => setPrnForm(f => ({ ...f, completed_at: e.target.value }))}
                />
              </EmField>
              <EmField label="Notes" optional htmlFor="ct-prn-notes">
                <textarea
                  id="ct-prn-notes"
                  className="em-input"
                  rows={2}
                  value={prnForm.notes}
                  onChange={(e) => setPrnForm(f => ({ ...f, notes: e.target.value }))}
                />
              </EmField>
              <div className="em-footer">
                <button
                  type="button"
                  className="em-cancel start"
                  onClick={() => setPrnModal({ open: true, selectedTask: null })}
                  disabled={prnSaving}
                >
                  <ChevronLeftIcon size={14} /> Back
                </button>
                <button type="button" className="em-cancel" onClick={closePrnModal} disabled={prnSaving}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="em-submit"
                  onClick={handlePrnSave}
                  disabled={prnSaving || !prnForm.completed_at}
                >
                  {prnSaving ? 'Saving…' : 'Mark Done'}
                </button>
              </div>
            </>
          )}
        </div>
      </EntityModal>

      {/* Nutrition intake for a task that tracks it — the same sheet the
          admin pages and the live dashboard use. */}
      <IntakeSheet
        open={nutritionModal.open}
        onClose={() => setNutritionModal({ open: false, careTaskLogId: null, careTaskName: '', nutritionData: null })}
        onSaved={() => fetchSchedule()}
        patient={selectedPatient}
        careTaskLogId={nutritionModal.careTaskLogId}
        careTaskName={nutritionModal.careTaskName}
      />
    </>
  );
};

export default CareTaskModal;
