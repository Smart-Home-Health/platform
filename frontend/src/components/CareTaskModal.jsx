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
import { useCallback, useEffect, useState } from 'react';
import ModalBase from './ModalBase';
import config, { apiFetch } from '../config';
import { DailySchedule } from '../pages/admin-v2/AdminV2Schedule';
import { useAuth } from '../contexts/AuthContext';
import { canRecordSchedule, hasSchedulePermission } from './schedule/schedulePermissions';
import PanelViewSwitcher from './section-panel/PanelViewSwitcher';
import PrnPicker from './section-panel/PrnPicker';
import { careTaskRows } from './section-panel/prnRows';
import './section-panel/section-panel.css';
import './care-task/care-task.css';
import IntakeSheet from './nutrition/IntakeSheet';
import { getCurrentLocalDateTime, localDateTimeToUTC } from '../utils/timezone';
import EntityModal, { EmField } from './vc/EntityModal';
import { ChevronLeftIcon } from './Icons';

const CareTaskModal = ({ patient: selectedPatient, onClose }) => {
  const { user, hasReadAccess } = useAuth();
  const canReadTasks = hasReadAccess !== false && hasSchedulePermission(user, 'care_tasks.read');
  const canPerformTask = canReadTasks && canRecordSchedule(user, 'care_tasks');
  const [tab, setTab] = useState('scheduled');
  const [taskCatalog, setTaskCatalog] = useState([]);
  const activeTasks = canReadTasks ? taskCatalog : [];
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Nutrition tracking modal (opens when a nutrition-category task is completed)
  const [nutritionModal, setNutritionModal] = useState({ open: false, careTaskLogId: null, careTaskName: '', nutritionData: null });

  // PRN flow — pick task, enter when it was done + notes
  const [prnModal, setPrnModal] = useState({ open: false, selectedTask: null });
  const [prnForm, setPrnForm] = useState({ completed_at: '', notes: '' });
  const [prnSaving, setPrnSaving] = useState(false);
  const [prnError, setPrnError] = useState(null);

  const patientId = selectedPatient?.id;
  const fetchActiveTasks = useCallback(async () => {
    if (!patientId || !canReadTasks) return;
    setLoading(true);
    try {
      const res = await apiFetch(`${config.apiUrl}/api/care-tasks/active?patient_id=${patientId}`);
      if (res.ok) {
        const data = await res.json();
        setTaskCatalog(data.care_tasks || []);
      }
    } catch (error) {
      console.error('Error fetching care tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [patientId, canReadTasks]);

  useEffect(() => { fetchActiveTasks(); }, [fetchActiveTasks, tab]);

  const viewOptions = [
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'active', label: 'Active care tasks', count: activeTasks.length },
  ];

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
      const res = await apiFetch(`${config.apiUrl}/api/care-tasks/${prnModal.selectedTask.id}/complete`, {
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
      if (result.requires_nutrition_tracking && result.care_task && hasSchedulePermission(user, 'nutrition.create')) {
        setNutritionModal({ open: true, careTaskLogId: result.id, careTaskName: result.care_task.name, nutritionData: null });
      }
      setRefreshKey(value => value + 1);
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
              disabled: !selectedPatient || !canPerformTask,
              title: 'Record an ad-hoc care task',
            }]}
          />

          <div className="ld-panel-scroll">
            {selectedPatient && (
              <div hidden={tab !== 'scheduled'}>
                <DailySchedule patient={selectedPatient} category="care_tasks" active={tab === 'scheduled'}
                  refreshKey={refreshKey} />
              </div>
            )}

            {tab === 'active' && (
              !canReadTasks ? <p>Care task read access is required.</p>
                : loading
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
                              <button key={task.id} type="button" className="ctm-task" disabled={!canPerformTask}
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
        onSaved={() => setRefreshKey(value => value + 1)}
        patient={selectedPatient}
        careTaskLogId={nutritionModal.careTaskLogId}
        careTaskName={nutritionModal.careTaskName}
      />
    </>
  );
};

export default CareTaskModal;
