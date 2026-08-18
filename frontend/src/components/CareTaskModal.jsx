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
import { computeScheduleStatus } from './schedule/scheduleStatus';
import NutritionTrackingModal from './nutrition/NutritionTrackingModal';
import {
  checkAdministrationWindow,
  formatDurationMinutes,
  getCurrentLocalDateTime,
  localDateTimeToUTC,
} from '../utils/timezone';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

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
        category: item.category_name ? { name: item.category_name, color: item.category_color || '#6f42c1' } : null,
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
        groups.set(key, { id: t.category_id, name: t.category_name || 'Uncategorized', color: t.category_color || '#6f42c1', tasks: [] });
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
            <div className="tw" style={{ marginBottom: 16 }}>
              <Alert variant="warning">No patient selected</Alert>
            </div>
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

          <div style={{ flex: 1, overflow: 'auto' }}>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${group.color}` }}>
                            <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: group.color, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                            <h4 style={{ margin: 0, color: 'var(--dash-text)', fontSize: 16, fontWeight: 700 }}>{group.name}</h4>
                            <span style={{ fontSize: 12, color: 'var(--dash-text-muted)', fontWeight: 500, backgroundColor: 'var(--dash-surface-2)', padding: '2px 8px', borderRadius: 10 }}>{group.tasks.length}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {group.tasks.map(task => (
                              <button key={task.id} onClick={() => pickPrnTask(task)} style={{
                                textAlign: 'left', backgroundColor: 'var(--dash-surface)', border: '1px solid var(--dash-border)',
                                borderLeft: `5px solid ${group.color}`, borderRadius: 8, padding: '12px 14px',
                                cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                              }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ color: 'var(--dash-text)', fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{task.name}</div>
                                  {task.description && <div style={{ color: 'var(--dash-text-muted)', fontSize: 13, lineHeight: 1.3 }}>{task.description}</div>}
                                </div>
                                <span style={{ backgroundColor: '#28a745', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>Mark Done</span>
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
          <Dialog open onOpenChange={(o) => { if (!o) closeWindowConfirm(); }}>
            <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[rgba(240,136,62,0.2)] text-[#f0883e]">⚠</span>
                  {title}
                </DialogTitle>
              </DialogHeader>
              <Alert variant="warning">
                <div className="mb-1.5 font-semibold text-[#f0883e]">{heading}</div>
                <div>
                  <strong>{windowConfirm.task.name}</strong> is scheduled for{' '}
                  <strong>{windowConfirm.check.scheduledLocal}</strong> — that's <strong>{offsetText}</strong>.
                </div>
              </Alert>
              <DialogFooter>
                <Button variant="secondary" onClick={closeWindowConfirm}>Cancel</Button>
                <Button onClick={async () => {
                  const { task, note } = windowConfirm;
                  closeWindowConfirm();
                  await submitMarkCompleted(task, { earlyOverride: true, note });
                }}>
                  Complete Anyway
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
      <Dialog open={prnModal.open && !!prnModal.selectedTask} onOpenChange={(o) => { if (!o) closePrnModal(); }}>
        <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{prnModal.selectedTask ? `Mark Done — ${prnModal.selectedTask.name}` : 'Mark a Care Task Done'}</DialogTitle>
          </DialogHeader>

          {prnError && <Alert variant="destructive">{prnError}</Alert>}

          {/* Step 2: time + notes */}
          {prnModal.selectedTask && (
            <div className="flex flex-col gap-4">
              {prnModal.selectedTask.description && (
                <p className="m-0 text-sm text-muted-foreground">{prnModal.selectedTask.description}</p>
              )}
              <Field label="Completed At" required htmlFor="ct-prn-when">
                <Input
                  id="ct-prn-when"
                  type="datetime-local"
                  value={prnForm.completed_at}
                  onChange={(e) => setPrnForm(f => ({ ...f, completed_at: e.target.value }))}
                />
              </Field>
              <Field label="Notes (optional)" htmlFor="ct-prn-notes">
                <Textarea
                  id="ct-prn-notes"
                  rows={2}
                  value={prnForm.notes}
                  onChange={(e) => setPrnForm(f => ({ ...f, notes: e.target.value }))}
                />
              </Field>
              <DialogFooter className="justify-between sm:justify-between">
                <Button type="button" variant="secondary" onClick={() => setPrnModal({ open: true, selectedTask: null })} disabled={prnSaving}>← Back</Button>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={closePrnModal} disabled={prnSaving}>Cancel</Button>
                  <Button type="button" onClick={handlePrnSave} disabled={prnSaving || !prnForm.completed_at}>
                    {prnSaving ? 'Saving…' : 'Mark Done'}
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Nutrition Tracking Modal */}
      <NutritionTrackingModal
        isOpen={nutritionModal.open}
        onClose={() => setNutritionModal({ open: false, careTaskLogId: null, careTaskName: '', nutritionData: null })}
        careTaskLogId={nutritionModal.careTaskLogId}
        careTaskName={nutritionModal.careTaskName}
        nutritionData={nutritionModal.nutritionData}
        onSave={() => fetchSchedule()}
      />
    </>
  );
};

export default CareTaskModal;
