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
import { useSearchParams, useLocation } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { nutritionService } from '../../services/nutrition';
import { FLUID_ITEM_TYPES } from '../../components/nutrition/intakeVocab';
import {
  PatientHeader, PatientSelectorModal, IntakeSheet, OutputSheet, NutritionOverview,
  NutritionPlanTab, NutritionItemsTab, GoalHistoryModal, NutritionHistoryModal,
} from './components';
import ItemSheet from '../../components/nutrition/ItemSheet';
import ScheduleSheet from '../../components/nutrition/ScheduleSheet';
import GoalSheet from '../../components/nutrition/GoalSheet';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { NutritionIcon } from '../../components/Icons';
import ConfirmSheet from '../../components/vc/ConfirmSheet';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

// Module-scope so the inputs don't lose focus on each keystroke (a component
// defined inside render remounts every change).
// The schedule and target forms moved to components/nutrition as vc sheets;
// they own their own field state and cron handling.

const AdminV2Nutrition = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);
  
  // Derive active tab from URL path
  const getActiveTabFromPath = () => {
    const path = location.pathname;
    // Intake and output are history modals on the Overview now, so their old
    // paths land there rather than on a tab of their own.
    // /schedules and /goals kept as aliases so old links still land somewhere
    // sensible now that the two views are one.
    if (path.includes('/nutrition/plan')) return 'plan';
    if (path.includes('/nutrition/schedules')) return 'plan';
    if (path.includes('/nutrition/goals')) return 'plan';
    if (path.includes('/nutrition/items')) return 'items';
    return 'overview'; // default — /care/nutrition lands here
  };
  
  const activeTab = getActiveTabFromPath();
  
  // Loading/error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Data states
  const [goals, setGoals] = useState([]);
  const [currentGoal, setCurrentGoal] = useState(null);
  const [plan, setPlan] = useState(null);
  const [showGoalHistory, setShowGoalHistory] = useState(false);
  // Which history is open ('intake' | 'output' | null), and a counter to
  // refetch it after an edit made from inside it.
  const [historyKind, setHistoryKind] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // Overview-tab state — single date the page is showing, plus that day's
  // intake + output records pulled from the daily endpoints.
  const [overviewDate, setOverviewDate] = useState(new Date());
  const [dailyIntakes, setDailyIntakes] = useState([]);
  const [dailyOutputs, setDailyOutputs] = useState([]);

  // Items-tab state — the saved-item library this patient logs against.
  const [libraryItems, setLibraryItems] = useState([]);
  
  // Reference data
  const [outputTypes, setOutputTypes] = useState({});
  const [, setScheduleTypes] = useState([]);
  
  // Modal states
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteType, setDeleteType] = useState(null);

  // The intake/output history modal owns its own date range.

  // Intake/output form state lives inside the shared modal components now.

  // Schedule and target form state lives inside ScheduleSheet / GoalSheet,
  // which also own the cron building and parsing.

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Check URL params for patient ID
  useEffect(() => {
    const patientIdFromUrl = searchParams.get('patient');
    if (patientIdFromUrl && patients.length > 0 && !loadingPatients) {
      const patient = patients.find(p => p.id === parseInt(patientIdFromUrl));
      if (patient && (!contextPatient || contextPatient.id !== patient.id)) {
        setContextPatient(patient);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way URL→context sync; adding contextPatient would re-run on selection change and revert it to the stale URL param
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient) {
      setSearchParams({ patient: contextPatient.id.toString() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way context→URL sync; runs only when the selection changes
  }, [contextPatient]);

  // Fetch reference data on mount
  useEffect(() => {
    fetchOutputTypes();
    fetchScheduleTypes();
  }, []);

  // Fetch data when patient is selected. Overview also refetches on date change.
  useEffect(() => {
    if (selectedPatient) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient change only
  }, [selectedPatient, activeTab, overviewDate]);

  // The Overview page needs the current goal to compute % targets — but
  // currentGoal is only loaded by the goals tab in fetchData. Load it once
  // when a patient is selected so Overview always has it on first render.
  useEffect(() => {
    if (!selectedPatient) return;
    (async () => {
      try {
        const res = await fetch(
          `${config.apiUrl}/api/nutrition/goals/patient/${selectedPatient.id}/current`,
          { credentials: 'include' }
        );
        if (res.ok) setCurrentGoal(await res.json());
      } catch (err) {
        console.error('Error fetching current goal:', err);
      }
    })();
  }, [selectedPatient]);

  const fetchOutputTypes = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/nutrition/outputs/types`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setOutputTypes(data);
      }
    } catch (err) {
      console.error('Error fetching output types:', err);
    }
  };

  const fetchScheduleTypes = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/nutrition/schedules/types`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setScheduleTypes(data.schedule_types || []);
      }
    } catch (err) {
      console.error('Error fetching schedule types:', err);
    }
  };

  const fetchData = async () => {
    if (!selectedPatient) return;

    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'overview') {
        const dateParam = formatDateForApi(overviewDate);
        // Minutes the caller's local time is ahead of UTC — Schedule's
        // /api/schedule/daily expects the same sign convention. JS's
        // getTimezoneOffset() returns the opposite sign (UTC-minus-local),
        // so we negate it.
        const tzOffsetMinutes = -new Date().getTimezoneOffset();
        const [intakeRes, outputRes] = await Promise.all([
          fetch(
            `${config.apiUrl}/api/patients/${selectedPatient.id}/nutrition-intake/daily?target_date=${dateParam}&tz_offset_minutes=${tzOffsetMinutes}`,
            { credentials: 'include' }
          ),
          fetch(
            `${config.apiUrl}/api/nutrition/outputs/patient/${selectedPatient.id}/daily?target_date=${dateParam}&tz_offset_minutes=${tzOffsetMinutes}`,
            { credentials: 'include' }
          ),
        ]);
        if (intakeRes.ok) {
          const data = await intakeRes.json();
          // /daily wraps records in { date, intake_records: [...] }
          setDailyIntakes(data.intake_records || []);
        } else {
          setDailyIntakes([]);
        }
        if (outputRes.ok) {
          // /outputs/.../daily returns a plain array
          setDailyOutputs(await outputRes.json());
        } else {
          setDailyOutputs([]);
        }
      } else if (activeTab === 'plan') {
        // The plan endpoint returns targets, schedules and coverage together.
        // These used to be separate calls with the current goal loaded by its
        // own effect, so the view could render before its targets arrived and
        // show them as zero. The goal history list is only needed by the modal.
        const [planRes, goalsRes] = await Promise.all([
          fetch(`${config.apiUrl}/api/nutrition/plan?patient_id=${selectedPatient.id}`,
                { credentials: 'include' }),
          fetch(`${config.apiUrl}/api/nutrition/goals/patient/${selectedPatient.id}?active_only=false`,
                { credentials: 'include' }),
        ]);
        if (planRes.ok) {
          const body = await planRes.json();
          setPlan(body);
          setCurrentGoal(body.goal || null);
        }
        if (goalsRes.ok) setGoals(await goalsRes.json());
      } else if (activeTab === 'items') {
        setLibraryItems(await nutritionService.listItems({
          patientId: selectedPatient.id, limit: 200,
        }));
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setShowPatientModal(false);
  };

  // ========================
  // INTAKE HANDLERS
  // ========================
  
  const openIntakeModal = (intake = null) => {
    setEditingItem(intake);
    setShowIntakeModal(true);
  };

  // ========================
  // OUTPUT HANDLERS
  // ========================

  const openOutputModal = (output = null) => {
    setEditingItem(output);
    setShowOutputModal(true);
  };

  // ========================
  // ITEM LIBRARY HANDLERS
  // ========================

  const openItemModal = (item = null) => {
    setEditingItem(item);
    setShowItemModal(true);
  };

  // ========================
  // SCHEDULE HANDLERS
  // ========================
  
  const openScheduleModal = (schedule = null) => {
    setEditingItem(schedule);
    setFormError(null);
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async (payload) => {
    if (!selectedPatient) return;
    setSaving(true);
    setFormError(null);
    try {
      const url = editingItem
        ? `${config.apiUrl}/api/nutrition/schedules/${editingItem.id}`
        : `${config.apiUrl}/api/nutrition/schedules`;
      const response = await fetch(url, {
        method: editingItem ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...payload, patient_id: selectedPatient.id }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save schedule');
      }
      setShowScheduleModal(false);
      setEditingItem(null);
      fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSchedule = async (scheduleId) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/nutrition/schedules/${scheduleId}/toggle`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Error toggling schedule:', err);
    }
  };

  // ========================
  // GOAL HANDLERS
  // ========================
  
  const openGoalHistory = () => setShowGoalHistory(true);

  const openGoalModal = (goal = null) => {
    setEditingItem(goal);
    setFormError(null);
    setShowGoalModal(true);
  };

  // The sheet builds the payload; this persists it as a new effective-dated
  // version (or updates the one being edited).
  const handleSaveGoal = async (payload) => {
    if (!selectedPatient) return;
    setSaving(true);
    setFormError(null);
    try {
      const url = editingItem
        ? `${config.apiUrl}/api/nutrition/goals/${editingItem.id}`
        : `${config.apiUrl}/api/nutrition/goals`;
      const response = await fetch(url, {
        method: editingItem ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...payload, patient_id: selectedPatient.id, is_active: true }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save targets');
      }
      setShowGoalModal(false);
      setEditingItem(null);
      fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openDeleteModal = (item, type) => {
    setDeletingItem(item);
    setDeleteType(type);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deletingItem || !deleteType) return;
    
    setSaving(true);
    try {
      let url;
      switch (deleteType) {
        case 'intake':
          url = `${config.apiUrl}/api/nutrition-intake/${deletingItem.id}`
            // Deleting the whole feed removes every row of the logged event.
            + (deletingItem.wholeEvent ? '?whole_event=true' : '');
          break;
        case 'output':
          url = `${config.apiUrl}/api/nutrition/outputs/${deletingItem.id}`;
          break;
        case 'schedule':
          url = `${config.apiUrl}/api/nutrition/schedules/${deletingItem.id}`;
          break;
        case 'goal':
          url = `${config.apiUrl}/api/nutrition/goals/${deletingItem.id}`;
          break;
        case 'item':
          // Soft deactivate — intakes already logged against it are untouched.
          url = `${config.apiUrl}/api/nutrition/items/${deletingItem.id}`;
          break;
        default:
          return;
      }
      
      const response = await fetch(url, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        setShowDeleteModal(false);
        setDeletingItem(null);
        setDeleteType(null);
        fetchData();
      }
    } catch (err) {
      console.error('Error deleting:', err);
    } finally {
      setSaving(false);
    }
  };

  // Format helpers
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  // YYYY-MM-DD in local time. toISOString() would shift by a day in any
  // timezone where the UTC offset has crossed midnight; mirror the Schedule
  // page's local-date approach so the backend filters the user's actual day.
  const formatDateForApi = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatDisplayDate = (date) =>
    date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const isToday = (date) => date.toDateString() === new Date().toDateString();

  const goToPreviousDay = () => {
    const d = new Date(overviewDate);
    d.setDate(d.getDate() - 1);
    setOverviewDate(d);
  };
  const goToNextDay = () => {
    const d = new Date(overviewDate);
    d.setDate(d.getDate() + 1);
    setOverviewDate(d);
  };
  const goToToday = () => setOverviewDate(new Date());

  // Time only — used in the combined log table.
  const formatTimeShort = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // Convert any intake amount to ml so we can sum total fluids consistently.
  // Counts liquids and hydration-schedule completions (which store
  // item_type='hydration' from the schedule_type). Solid foods are excluded.
  // Shared with the logging sheets so a tube feed counts toward fluids here
  // too — the local copy predated tube_feed being a real intake type.
  const intakeToMl = (intake) => {
    if (!FLUID_ITEM_TYPES.has(intake.item_type) || !intake.amount) return 0;
    const unit = (intake.amount_unit || 'ml').toLowerCase();
    const amount = parseFloat(intake.amount) || 0;
    if (unit === 'oz' || unit === 'ounces') return amount * 29.5735;
    if (unit === 'cup' || unit === 'cups') return amount * 236.588;
    if (unit === 'l' || unit === 'liter' || unit === 'liters') return amount * 1000;
    return amount; // assume ml
  };

  const outputToMl = (output) => {
    if (!output.amount) return 0;
    const unit = (output.amount_unit || 'ml').toLowerCase();
    const amount = parseFloat(output.amount) || 0;
    if (unit === 'oz' || unit === 'ounces') return amount * 29.5735;
    if (unit === 'cup' || unit === 'cups') return amount * 236.588;
    if (unit === 'l' || unit === 'liter' || unit === 'liters') return amount * 1000;
    return amount;
  };

  // The cron arithmetic and the goal-vs-scheduled reconciliation moved to the
  // backend's /api/nutrition/plan, next to the scheduling code that owns them.

  // Output rendering moved to NutritionOutputTab / NutritionOverview, which
  // group rows by event_group_id rather than re-deriving the association here.

  // Delete every record in a merged diaper event (mirrors the schedule undo,
  // which voids all members of a mixed diaper together).
  const handleDeleteOutputEvent = async (members) => {
    const types = members.map(m => (m.output_type === 'bowel' ? 'stool' : m.output_type)).join(' + ');
    const question = members.length > 1
      ? `Delete this output event (${types})? This removes ${members.length} records.`
      : `Delete this ${types} record?`;
    if (!window.confirm(question)) return;
    setSaving(true);
    try {
      await Promise.all(members.map(m => nutritionService.deleteOutput(m.id)));
      fetchData();
    } catch (err) {
      console.error('Error deleting output event:', err);
    } finally {
      setSaving(false);
    }
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
        <PatientHeader
          selectedPatient={selectedPatient}
          onChangePatient={() => setShowPatientModal(true)}
          title="Nutrition & Output Tracking"
          icon={<NutritionIcon size={24} />}
        />
        
        {!selectedPatient ? (
          <div className="cfg-nopatient">
            <NutritionIcon size={48} />
            <h2>No Patient Selected</h2>
            <p>Please select a patient to manage nutrition and output tracking.</p>
            <button type="button" className="em-submit" onClick={() => setShowPatientModal(true)}>
              Select Patient
            </button>
          </div>
        ) : (
          <>
            {error && <div className="em-error" role="alert">{error}</div>}

            {/* OVERVIEW TAB — rendered outside .admin-v2-content so the
                sticky date nav binds to the outer Layout scroll container. */}
            {activeTab === 'overview' && (
              <NutritionOverview
                selectedDate={overviewDate}
                onPrevDay={goToPreviousDay}
                onNextDay={goToNextDay}
                onGoToToday={goToToday}
                onPickDate={(d) => setOverviewDate(d)}
                formatDateForApi={formatDateForApi}
                formatDisplayDate={formatDisplayDate}
                isToday={isToday}
                intakes={dailyIntakes}
                outputs={dailyOutputs}
                currentGoal={currentGoal}
                loading={loading}
                onLogIntake={() => openIntakeModal()}
                onLogOutput={() => openOutputModal()}
                onEditIntake={openIntakeModal}
                onEditOutput={openOutputModal}
                onDeleteIntake={(item) => openDeleteModal(item, 'intake')}
                onDeleteOutput={(item) => openDeleteModal(item, 'output')}
                canCreate={hasPermission('nutrition.create')}
                canUpdate={hasPermission('nutrition.update')}
                canDelete={hasPermission('nutrition.delete')}
                outputTypes={outputTypes}
                intakeToMl={intakeToMl}
                outputToMl={outputToMl}
                formatTimeShort={formatTimeShort}
                onViewIntake={() => setHistoryKind('intake')}
                onViewOutput={() => setHistoryKind('output')}
              />
            )}

            {/* PLAN TAB — targets, coverage and the schedules that meet them */}
            {activeTab === 'plan' && (
              <NutritionPlanTab
                plan={plan}
                loading={loading}
                canCreate={hasPermission('nutrition.create')}
                canUpdate={hasPermission('nutrition.update')}
                canDelete={hasPermission('nutrition.delete')}
                onEditGoal={openGoalModal}
                onViewGoalHistory={openGoalHistory}
                onAddSchedule={() => openScheduleModal()}
                onEditSchedule={openScheduleModal}
                onToggleSchedule={(s) => handleToggleSchedule(s.id)}
                onDeleteSchedule={(s) => openDeleteModal(s, 'schedule')}
                formatDate={formatDate}
              />
            )}

            {/* ITEMS TAB — the saved-item library logging draws from */}
            {activeTab === 'items' && (
              <NutritionItemsTab
                items={libraryItems}
                loading={loading}
                canCreate={hasPermission('nutrition.create')}
                canUpdate={hasPermission('nutrition.update')}
                canDelete={hasPermission('nutrition.delete')}
                onAdd={() => openItemModal()}
                onEdit={openItemModal}
                onDelete={(item) => openDeleteModal(item, 'item')}
              />
            )}
          </>
        )}
      </div>

      {/* Patient Selector Modal */}
      {showPatientModal && (
        <PatientSelectorModal
          patients={patients}
          selectedPatient={selectedPatient}
          onSelect={handleSelectPatient}
          onClose={() => setShowPatientModal(false)}
        />
      )}

      <GoalHistoryModal
        open={showGoalHistory}
        onOpenChange={setShowGoalHistory}
        goals={goals}
        formatDate={formatDate}
      />

      <IntakeSheet
        open={showIntakeModal}
        onClose={() => { setShowIntakeModal(false); setEditingItem(null); }}
        onSaved={() => { fetchData(); setHistoryRefresh((n) => n + 1); }}
        patient={selectedPatient}
        editing={editingItem}
      />

      <OutputSheet
        open={showOutputModal}
        onClose={() => { setShowOutputModal(false); setEditingItem(null); }}
        onSaved={() => { fetchData(); setHistoryRefresh((n) => n + 1); }}
        patient={selectedPatient}
        editing={editingItem}
      />

      <ItemSheet
        open={showItemModal}
        onClose={() => { setShowItemModal(false); setEditingItem(null); }}
        onSaved={fetchData}
        patient={selectedPatient}
        editing={showItemModal ? editingItem : null}
      />


      <ScheduleSheet
        open={showScheduleModal}
        onClose={() => { setShowScheduleModal(false); setEditingItem(null); setFormError(null); }}
        onSave={handleSaveSchedule}
        editing={editingItem}
        saving={saving}
        error={formError}
        patient={selectedPatient}
      />

      <GoalSheet
        open={showGoalModal}
        onClose={() => { setShowGoalModal(false); setEditingItem(null); setFormError(null); }}
        onSave={handleSaveGoal}
        editing={editingItem}
        saving={saving}
        error={formError}
      />

      {/* Intake and output history — opened from the Overview rather than
          living in the nav, since they are records to read back through. */}
      <NutritionHistoryModal
        open={!!historyKind}
        kind={historyKind || 'intake'}
        onOpenChange={(next) => { if (!next) setHistoryKind(null); }}
        patient={selectedPatient}
        canUpdate={hasPermission('nutrition.update')}
        canDelete={hasPermission('nutrition.delete')}
        onEditIntake={openIntakeModal}
        onEditOutput={openOutputModal}
        onDeleteIntake={(item) => openDeleteModal(item, 'intake')}
        onDeleteOutputEvent={handleDeleteOutputEvent}
        formatDateTime={formatDateTime}
        refreshKey={historyRefresh}
      />

      {/* Delete Confirmation */}
      <ConfirmSheet
        open={showDeleteModal}
        onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}
        title="Confirm Delete"
        confirmLabel={saving ? 'Deleting...' : 'Delete'}
        tone="destructive"
        busy={saving}
        onConfirm={handleDelete}
      >
        Are you sure you want to delete this {deleteType}? This action cannot be undone.
      </ConfirmSheet>
    </AdminV2Layout>
  );
};

export default AdminV2Nutrition;
