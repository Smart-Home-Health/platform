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
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal, IntakeSheet, OutputSheet } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  NutritionIcon,
  ClockIcon,
  CheckIcon,
  XIcon,
  LiquidIcon,
  ToiletIcon
} from '../../components/Icons';
import { computeScheduleStatus } from '../../components/schedule/scheduleStatus';
import { nutritionService } from '../../services/nutrition';
import ScheduleBoard from '../../components/schedule/ScheduleBoard';
import { groupBySlot } from '../../components/schedule/scheduleRollup';
import { getCurrentLocalDateTime } from '../../utils/timezone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import './AdminV2.css';

// Daily nutrition schedule view (today + yesterday), the admin counterpart of
// the live-dashboard NutritionModal, rendered with the same admin-v2 schedule
// styling as the meds/care-tasks schedule pages. Data comes from the unified
// /api/schedule/daily endpoint with include_prior_day=true so missed items
// from yesterday stay visible.
const AdminV2NutritionSchedule = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients,
    selectedPatient: contextPatient,
    selectPatient: setContextPatient,
    loadingPatients
  } = useAdminPatient();

  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);

  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Status filter state (mirrors the meds schedule page)
  const [statusFilters, setStatusFilters] = useState({
    ready: true,
    upcoming: true,
    missed: true,
    completed: false
  });

  // Completing an item opens the full intake form pre-linked to the row —
  // amounts adjustable, mix prefilled — never a bare submit.
  const [completeFeed, setCompleteFeed] = useState(null);

  // PRN flow: 'pick' opens the choice screen; 'intake'/'output' delegate to
  // the shared AdminV2 modal of the same name.
  const [prnMode, setPrnMode] = useState(null); // null | 'pick' | 'intake' | 'output'
  const [prnDefaultDateTime, setPrnDefaultDateTime] = useState('');

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

  useEffect(() => {
    if (selectedPatient) {
      fetchSchedule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient change only
  }, [selectedPatient]);

  const fetchSchedule = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);
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
        setScheduled(data.nutrition || []);
      } else {
        setError('Failed to load schedule');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching nutrition schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setSearchParams({ patient: patient.id });
    setShowPatientModal(false);
  };

  // Normalize rows: attach the shared time-based status and a coarse bucket
  // matching the meds page's filters (ready / upcoming / missed / completed).
  const items = useMemo(() => {
    return scheduled.map(item => {
      const status = computeScheduleStatus(item);
      let bucket;
      if (status === 'completed' || status === 'skipped') bucket = 'completed';
      else if (status === 'missed') bucket = 'missed';
      else if (status === 'due_on_time' || status === 'due_warning') bucket = 'ready';
      else bucket = 'upcoming'; // 'pending'
      const detail = [];
      if (item.default_item) detail.push(item.default_item);
      if (item.fluid_dynamic && !item.completed && item.suggested_amount != null) {
        // Dynamic water spot: the amount is computed from what is left of
        // the daily fluid target, so show that instead of the nominal.
        detail.push(item.suggested_amount > 0
          ? `suggested ${item.suggested_amount} ${item.default_amount_unit || 'ml'}`
          : 'goal met — skip?');
      } else if (item.default_amount != null) {
        detail.push(`${item.default_amount}${item.default_amount_unit ? ' ' + item.default_amount_unit : ''}`);
      }
      if (item.default_calories != null) detail.push(`${item.default_calories} kcal`);
      return { ...item, _status: status, _bucket: bucket, _detail: detail.join(' · ') };
    });
  }, [scheduled]);

  // Bucket -> ScheduleBoard tone
  const BUCKET_TONE = {
    ready: 'ontime',
    upcoming: 'pending',
    missed: 'late',
    completed: 'completed',
  };

  const getStatusText = (item) => {
    if (item._status === 'skipped') return 'Skipped';
    if (item._bucket === 'completed') return item.is_prn ? 'PRN Logged' : 'Completed';
    if (item._bucket === 'missed') return 'Missed';
    if (item._bucket === 'ready') return 'Ready';
    return 'Upcoming';
  };

  const filteredItems = items.filter(item => statusFilters[item._bucket]);

  // Post-feed flush follow-ups have their own actions: Run (logs the water)
  // and Skip (recorded — the mix already carried enough water today).
  const runFlush = async (item) => {
    try {
      await nutritionService.completeFlush(item.followup_id, { user_id: user?.id || undefined });
      fetchSchedule();
    } catch (err) {
      console.error('Error running flush:', err);
    }
  };

  const skipFlush = async (item) => {
    try {
      await nutritionService.skipFlush(item.followup_id, { user_id: user?.id || undefined });
      fetchSchedule();
    } catch (err) {
      console.error('Error skipping flush:', err);
    }
  };

  const rowActions = (item) => {
    if (item._bucket === 'completed' || item.is_prn || !hasPermission('nutrition.update')) return [];
    if (item.row_kind === 'flush') {
      return [
        { key: 'run', label: 'Run Flush', tone: 'primary', onClick: () => runFlush(item) },
        { key: 'skip', label: 'Skip', tone: 'ghost', onClick: () => skipFlush(item) },
      ];
    }
    return [{
      key: 'complete',
      label: item._bucket === 'missed' ? 'Complete Now' : 'Mark Complete',
      tone: 'primary',
      onClick: () => handleMarkCompleted(item),
    }];
  };

  // Raw (normalized) item -> ScheduleBoard row.
  const toRow = (item) => ({
    id: item.row_kind === 'flush'
      ? `flush-${item.followup_id}`
      : `${item.schedule_id ?? 'prn'}-${item.scheduled_time}`,
    title: item.name,
    meta: item._detail || undefined,
    prn: item.is_prn,
    scheduleLine: item.completed_at
      ? `Completed at ${new Date(item.completed_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`
      : undefined,
    statusLabel: getStatusText(item),
    statusTone: item._status === 'skipped' ? 'skipped' : (BUCKET_TONE[item._bucket] || 'pending'),
    completed: item._bucket === 'completed',
    actions: rowActions(item),
  });

  // Day (real calendar date) then time slot, reusing scheduleRollup.js's
  // groupBySlot — the same grouping the live dashboard's dose panel uses.
  const buildDayGroups = (list) => {
    const days = new Map();
    list.forEach((item) => {
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

  // ===== Complete scheduled item =====
  // Opens the shared intake form pre-linked to the occurrence (mix
  // prefilled, target tracked, time and note editable). Logging the event
  // marks the feed complete — no separate confirm dialog; the filled form
  // IS the deliberate act, and its editable time records when the feed
  // actually ran.
  const handleMarkCompleted = (item) => setCompleteFeed(item);

  const closeComplete = () => setCompleteFeed(null);

  const onCompleteSaved = () => {
    closeComplete();
    fetchSchedule();
  };

  // ===== PRN entry =====
  const openPrnPicker = () => {
    setPrnDefaultDateTime(getCurrentLocalDateTime());
    setPrnMode('pick');
  };

  const closePrn = () => setPrnMode(null);

  const onPrnSaved = () => {
    closePrn();
    fetchSchedule();
  };

  // Get stats
  const stats = {
    ready: items.filter(i => i._bucket === 'ready').length,
    upcoming: items.filter(i => i._bucket === 'upcoming').length,
    missed: items.filter(i => i._bucket === 'missed').length,
    completed: items.filter(i => i._bucket === 'completed').length
  };

  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  const dayGroups = buildDayGroups(filteredItems);

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {/* Stats Row */}
            <div className="admin-v2-summary-stats admin-v2-meds-schedule-summary">
              <div
                className={`admin-v2-stat-card ${statusFilters.ready ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ ...f, ready: !f.ready }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'var(--sched-ontime-chip, rgba(88, 166, 255, 0.15))' }}>
                  <ClockIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.ready}</h4>
                  <p>Ready</p>
                </div>
              </div>
              <div
                className={`admin-v2-stat-card ${statusFilters.upcoming ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ ...f, upcoming: !f.upcoming }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'var(--sched-pending-chip, rgba(31, 111, 235, 0.15))' }}>
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
            </div>

            {/* PRN + Refresh Buttons */}
            <div className="admin-v2-page-header tw">
              <h3 style={{ margin: 0, color: 'var(--foreground)' }}>
                Today & Yesterday ({filteredItems.length} of {items.length})
              </h3>
              <div className="tw flex items-center gap-2">
                {hasPermission('nutrition.create') && (
                  <Button
                    onClick={openPrnPicker}
                    className="bg-[#6f42c1] text-white hover:bg-[#6f42c1]/90"
                  >PRN</Button>
                )}
                <Button onClick={fetchSchedule} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </div>

            {/* Schedule Content */}
            {error ? (
              <div className="tw"><Alert variant="destructive">{error}</Alert></div>
            ) : (
              <ScheduleBoard
                dayGroups={dayGroups}
                loading={loading}
                emptyText={
                  items.length === 0
                    ? 'No nutrition scheduled for today or yesterday'
                    : 'No items match the selected filters'
                }
              />
            )}

          </>
        ) : (
          <div className="admin-v2-no-patient">
            <NutritionIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their daily nutrition schedule</p>
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

        {/* Complete a scheduled item: the shared intake form, pre-linked
            to the tapped occurrence with its mix as the starting rows. */}
        <IntakeSheet
          open={!!completeFeed}
          onClose={closeComplete}
          onSaved={onCompleteSaved}
          patient={selectedPatient}
          prefillFeed={completeFeed}
        />

        {/* PRN pick: intake vs output */}
        <Dialog open={prnMode === 'pick'} onOpenChange={(o) => { if (!o) closePrn(); }}>
          <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Log Ad-Hoc Nutrition</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                onClick={() => setPrnMode('intake')}
                className="h-auto flex-col gap-1.5 py-6 text-base font-bold"
              >
                <LiquidIcon size={22} />
                Log Intake
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPrnMode('output')}
                className="h-auto flex-col gap-1.5 py-6 text-base font-bold"
              >
                <ToiletIcon size={22} />
                Log Output
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Shared AdminV2 intake form */}
        <IntakeSheet
          open={prnMode === 'intake'}
          onClose={closePrn}
          onSaved={onPrnSaved}
          patient={selectedPatient}
          defaultDateTime={prnDefaultDateTime}
        />

        {/* Shared AdminV2 output form */}
        <OutputSheet
          open={prnMode === 'output'}
          onClose={closePrn}
          onSaved={onPrnSaved}
          patient={selectedPatient}
          defaultDateTime={prnDefaultDateTime}
        />
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2NutritionSchedule;
