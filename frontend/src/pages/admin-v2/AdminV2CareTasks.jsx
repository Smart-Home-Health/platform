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
// Care tasks — the definitions, their categories and their schedules.
//
// The page owns fetching and permissions; the sheets own their own fields.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal, CareTasksTab } from './components';
import CareTaskSheet from '../../components/care-task/CareTaskSheet';
import CategoryManagerModal from '../../components/care-task/CategoryManagerModal';
import CareTaskScheduleModal from '../../components/care-task/CareTaskScheduleModal';
import { careTaskService } from '../../services/careTasks';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { CareTasksIcon } from '../../components/Icons';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import './AdminV2.css';

// Mirrors care_task_vocab.NUTRITION_CATEGORY_KEYWORDS. Used only to decide
// whether the schedule form offers intake prefill; the API is the authority on
// whether completing the task actually records intake.
const NUTRITION_KEYWORDS = ['nutrition', 'feeding', 'meal', 'food', 'drink', 'supplement'];
const readsAsNutrition = (name) => {
  const lowered = String(name || '').toLowerCase();
  return NUTRITION_KEYWORDS.some((k) => lowered.includes(k));
};

const AdminV2CareTasks = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients, selectedPatient: contextPatient,
    selectPatient: setContextPatient, loadingPatients,
  } = useAdminPatient();

  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [taskSheet, setTaskSheet] = useState({ open: false, editing: null });
  const [categoryModal, setCategoryModal] = useState(false);
  const [scheduleModal, setScheduleModal] = useState({ open: false, task: null });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  const canCreate = hasPermission('care_tasks.create');
  const canUpdate = hasPermission('care_tasks.update');
  const canDelete = hasPermission('care_tasks.delete');

  // ?patient= seeds the shared context on arrival — a deep link or the back
  // button decides the patient.
  useEffect(() => {
    const fromUrl = searchParams.get('patient');
    if (fromUrl && patients.length > 0) {
      const match = patients.find((p) => String(p.id) === fromUrl);
      if (match && match.id !== contextPatient?.id) setContextPatient(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way URL→context sync; adding contextPatient would re-run on selection change and revert it to the stale URL param
  }, [searchParams, patients]);

  // ...and a selection made anywhere else writes itself back, so the URL stays
  // shareable. Both sibling tabs do this; without it this page's ?patient=
  // goes stale as soon as the patient is switched from another surface.
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way context→URL sync; runs only when the selection changes
  }, [contextPatient]);

  const fetchAll = useCallback(async () => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);
    try {
      const [taskList, categoryList, scheduleList] = await Promise.all([
        careTaskService.listTasks(selectedPatient.id),
        careTaskService.listCategories(),
        careTaskService.listSchedules(selectedPatient.id),
      ]);
      setTasks(taskList);
      setCategories(categoryList);
      setSchedules(scheduleList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const schedulesByTask = useMemo(() => {
    const grouped = {};
    for (const schedule of schedules) {
      const key = schedule.care_task_id;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(schedule);
    }
    return grouped;
  }, [schedules]);

  // Decorated with what the card needs: its category and whether completing it
  // records intake.
  const decoratedTasks = useMemo(() => tasks.map((task) => {
    const category = categories.find((c) => c.id === task.category_id);
    return {
      ...task,
      category_name: category?.name || task.category_name || null,
      category_color: category?.color || task.category_color || null,
      is_nutrition: readsAsNutrition(category?.name || task.category_name),
    };
  }), [tasks, categories]);

  const taskCounts = useMemo(() => {
    const counts = {};
    for (const task of tasks) {
      if (task.category_id) counts[task.category_id] = (counts[task.category_id] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const run = async (work) => {
    setSaving(true);
    setFormError(null);
    try {
      await work();
      await fetchAll();
      return true;
    } catch (err) {
      setFormError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ---------- tasks ----------
  const saveTask = async (payload) => {
    const editing = taskSheet.editing;
    const ok = await run(() => (editing
      ? careTaskService.updateTask(editing.id, payload)
      : careTaskService.createTask({ ...payload, patient_id: selectedPatient.id })));
    if (ok) setTaskSheet({ open: false, editing: null });
  };

  const deactivateTask = (task) => {
    // Deactivating, not deleting: the schedules and the completion history
    // stay, which is what the old confirm copy claimed was destroyed.
    if (!window.confirm(
      `Deactivate "${task.name}"? It stops being scheduled; its history is kept.`
    )) return;
    run(() => careTaskService.deactivateTask(task.id));
  };

  // ---------- schedules ----------
  const scheduleTask = scheduleModal.task;
  const scheduleList = scheduleTask ? (schedulesByTask[scheduleTask.id] || []) : [];

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {loadingPatients ? (
          <div className="admin-v2-loading">Loading…</div>
        ) : !selectedPatient ? (
          <div className="admin-v2-no-patient">
            <CareTasksIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to manage their care tasks</p>
            <div className="tw">
              <Button onClick={() => setShowPatientModal(true)}>Select Patient</Button>
            </div>
          </div>
        ) : (
          <>
            {error && <div className="tw"><Alert variant="destructive">{error}</Alert></div>}

            <CareTasksTab
              tasks={decoratedTasks}
              categories={categories}
              schedulesByTask={schedulesByTask}
              loading={loading}
              canCreate={canCreate}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onAdd={() => { setFormError(null); setTaskSheet({ open: true, editing: null }); }}
              onEdit={(task) => { setFormError(null); setTaskSheet({ open: true, editing: task }); }}
              onDelete={deactivateTask}
              onToggle={(task) => run(() => careTaskService.toggleTask(task.id))}
              onManageSchedules={(task) => { setFormError(null); setScheduleModal({ open: true, task }); }}
              onManageCategories={() => { setFormError(null); setCategoryModal(true); }}
            />
          </>
        )}

        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelect={(p) => {
              setContextPatient(p);
              setSearchParams({ patient: String(p.id) });
              setShowPatientModal(false);
            }}
            onClose={() => setShowPatientModal(false)}
          />
        )}

        <CareTaskSheet
          open={taskSheet.open}
          onClose={() => setTaskSheet({ open: false, editing: null })}
          onSave={saveTask}
          editing={taskSheet.editing}
          categories={categories}
          saving={saving}
          error={formError}
        />

        <CategoryManagerModal
          open={categoryModal}
          onOpenChange={setCategoryModal}
          categories={categories}
          taskCounts={taskCounts}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onCreate={(payload) => run(() => careTaskService.createCategory(payload))}
          onUpdate={(category, payload) => run(() => careTaskService.updateCategory(category.id, payload))}
          onDelete={(category) => run(() => careTaskService.deleteCategory(category.id))}
          saving={saving}
          error={formError}
        />

        <CareTaskScheduleModal
          open={scheduleModal.open}
          onOpenChange={(next) => { if (!next) setScheduleModal({ open: false, task: null }); }}
          task={scheduleTask}
          schedules={scheduleList}
          isNutritionTask={!!scheduleTask?.is_nutrition}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onCreate={(payload) => run(() => careTaskService.createSchedule(scheduleTask.id, payload))}
          onUpdate={(schedule, payload) => run(() => careTaskService.updateSchedule(schedule.id, payload))}
          onDelete={(schedule) => run(() => careTaskService.deleteSchedule(schedule.id))}
          onToggle={(schedule) => run(() => careTaskService.toggleSchedule(schedule.id))}
          saving={saving}
          error={formError}
        />
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2CareTasks;
