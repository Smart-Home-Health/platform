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
import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal, IntakeSheet, OutputSheet, MedicationDoseModal, UpdateQuantityModal, CareTaskCompleteModal } from './components';
import IntakeItemsEditor from '../../components/nutrition/IntakeItemsEditor';
import { nutritionService } from '../../services/nutrition';
import OccurrenceReminderDialog from '../../components/schedule/OccurrenceReminderDialog';
import { reminderDateLabel } from '../../components/schedule/reminderTiming';
import FixedCheckDialog from '../../components/schedule/FixedCheckDialog';
import MoveFeedDialog from '../../components/schedule/MoveFeedDialog';
import { canRecordSchedule, hasSchedulePermission } from '../../components/schedule/schedulePermissions';
import { scheduleManagerService } from '../../services/scheduleManager';
import { BathroomCheckCard } from './care-profile/BathroomCheckCard';
import {
  feedTarget, rowIsValid, rowToItemPayload, rowsFromScheduleRow,
} from '../../components/nutrition/intakeItemRows';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MedicationsIcon,
  NutritionIcon,
  TasksIcon,
  CheckIcon,
  ClockIcon,
  PrintIcon,
  UndoIcon
} from '../../components/Icons';
import { getCurrentLocalDateTime, localDateTimeToUTC, checkAdministrationWindow, formatDurationMinutes, parseScheduleTimestamp } from '../../utils/timezone';
import EntityModal, { EmField } from '../../components/vc/EntityModal';
import '../../components/vc/entity-card.css';
import './settings/settings-page.css';
import './AdminV2.css';
import { slotLabel } from '../../components/schedule/scheduleRollup';
import { overdueLabel, graceTitle } from '../../components/schedule/scheduleStatus';
import './vc-schedule.css'; // bedside-monitor skin (dark theme only)

// "Yesterday" or the short weekday for a prior-day due time; the Overdue
// band's rows are the only ones not on the day being viewed.
const dueDayLabel = (d) => {
  if (!d) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((today - day) / 86400000);
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function withLocalTimes(item) {
  const scheduledAt = parseScheduleTimestamp(item.scheduled_time);
  const completedAt = item.completed ? parseScheduleTimestamp(item.completed_at) : null;
  const effectiveAt = parseScheduleTimestamp(item.effective_time) ?? scheduledAt;
  const time = completedAt ?? effectiveAt;
  return {
    ...item, scheduledAt, completedAt, effectiveAt,
    hour: time?.getHours() ?? item.hour,
    minute: time?.getMinutes() ?? item.minute,
  };
}

function ScheduleItemHeading({ item }) {
  const { scheduledAt, completedAt, effectiveAt } = item;
  let text = `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`;
  let title;
  if (item.in_grace && !item.remind_at) {
    text = `${dueDayLabel(scheduledAt)} ${text}`;
    title = graceTitle(item);
  } else if (completedAt) {
    if (scheduledAt && scheduledAt.toDateString() !== completedAt.toDateString()) {
      const day = completedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      text = `${day} ${text}`;
    }
    title = scheduledAt ? `Given at ${text} (scheduled ${slotLabel(scheduledAt)})` : `Given at ${text}`;
  } else if (item.managed_feed && effectiveAt && scheduledAt) {
    if (effectiveAt.toDateString() !== scheduledAt.toDateString()) {
      text = `${effectiveAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${text}`;
    }
    title = item.timing_reason || undefined;
  }
  return <>
    <span className="admin-v2-schedule-item-time" title={title}><ClockIcon size={12} />{text}</span>
    <span className="admin-v2-schedule-item-name">{item.name}</span>
    {item.reminder_state === 'missed' && <span className="admin-v2-badge admin-v2-badge-overdue">Missed</span>}
    {item.remind_at && !item.completed && <span className="schedule-timing-reason schedule-original-due">
      Reminder · Originally due {reminderDateLabel(item.original_due_at ?? item.scheduled_time)}
    </span>}
  </>;
}

function activateGridRow(event) {
  // Native history, undo and bulk buttons already handle their own keys.
  if ((event.key === 'Enter' || event.key === ' ')
      && event.target.matches('div[role="button"][tabindex="0"]')) {
    event.preventDefault();
    event.target.click();
  }
}

function useDailyRoutines(patientId, rows, canRead) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!patientId || !canRead) return;
    let current = true;
    scheduleManagerService.get(patientId).then(result => {
      if (current) {
        setState({ ...result, patientId });
        setError('');
      }
    }).catch(() => {
      if (current) {
        setState(null);
        setError('Could not load check suggestions.');
      }
    });
    return () => { current = false; };
  }, [patientId, rows, canRead]);

  return { state: state?.patientId === patientId ? state : null, update: (next) => setState({ ...next, patientId }), error };
}

function DailyRoutines({ patientId, today, rows, canRead, manager, onScheduledCheck, onRecorded }) {
  const { state, update, error } = manager;
  if (!canRead) return null;
  const overnight = rows.find(row => row.managed_feed && !row.completed && !row.is_yesterday &&
    (row.overnight_target_at || row.schedule_id === state?.settings?.overnight_schedule_id));
  const linkedCheck = state?.suggestion && rows.find(row => row.row_kind === 'diaper_check' && !row.completed &&
    row.schedule_id === state.suggestion.check_schedule_id &&
    Date.parse(row.scheduled_time) === Date.parse(state.suggestion.check_scheduled_time));
  return (
    <section className="schedule-routines" aria-label="Schedule manager">
      <div className="schedule-routines-summary">
        {overnight && (
          <span>
            <strong>Overnight start {overnight.effectiveAt?.toDateString() !== overnight.scheduledAt?.toDateString()
              ? overnight.effectiveAt?.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' : ''}{slotLabel(overnight.effectiveAt)}</strong>
            {overnight.overnight_target_at && <span className={overnight.overnight_delayed ? 'schedule-routines-late' : ''}>
              {' · '}Target {slotLabel(overnight.overnight_target_at)}
              {overnight.overnight_delayed ? ' · Later than planned' : ''}
            </span>}
          </span>
        )}
        <Link to={`/care/configuration/patients/${patientId}/schedule-manager`}>Manage routines</Link>
      </div>
      {today && error && <p className="em-error" role="status">{error}</p>}
      {today && state?.suggestion && (linkedCheck
        ? <p>Check suggested after {state.suggestion.feed_name}.{' '}
          <button className="cfg-ghost" disabled={!state.can_record} onClick={() => onScheduledCheck(linkedCheck)}>
            Open {linkedCheck.name}
          </button></p>
        : <BathroomCheckCard state={state} patientId={patientId} onUpdate={(next) => { update(next); onRecorded(); }} />)}
    </section>
  );
}

const AdminV2Schedule = ({ category }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients,
    selectedPatient: contextPatient,
    selectPatient: setContextPatient,
    loadingPatients
  } = useAdminPatient();

  const [showPatientModal, setShowPatientModal] = useState(false);

  const requestedId = searchParams.get('patient');
  const patient = requestedId && requestedId !== String(contextPatient?.id)
    ? patients.find(person => String(person.id) === requestedId) ?? null
    : contextPatient;

  useEffect(() => {
    if (loadingPatients) return;
    if (requestedId && patient?.id !== contextPatient?.id) {
      setContextPatient(patient);
    } else if (!requestedId && contextPatient) {
      const next = new URLSearchParams(searchParams);
      next.set('patient', contextPatient.id);
      setSearchParams(next, { replace: true });
    }
  }, [loadingPatients, requestedId, patient, contextPatient, setContextPatient, searchParams, setSearchParams]);

  useEffect(() => {
    if (!loadingPatients && !patient && patients.length > 0) setShowPatientModal(true);
  }, [loadingPatients, patient, patients.length]);

  const handleSelectPatient = (selected) => {
    const next = new URLSearchParams(searchParams);
    next.set('patient', selected.id);
    setSearchParams(next);
    setContextPatient(selected);
    setShowPatientModal(false);
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {patient ? (
          <DailySchedule key={`${patient.id}-${category || 'all'}`} patient={patient} category={category} />
        ) : (
          <div className="cfg-nopatient">
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their daily schedule</p>
            <button type="button" className="em-submit" onClick={() => setShowPatientModal(true)}>
              Select Patient
            </button>
          </div>
        )}

        {/* Patient Selection Modal */}
        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={contextPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}
      </div>
    </AdminV2Layout>
  );
};

export function DailySchedule({ patient: selectedPatient, category, onChange, refreshKey, active = true }) {
  const showMeds = !category || category === 'medications';
  const showNutrition = !category || category === 'nutrition';
  const showTasks = !category || category === 'care_tasks';
  const { user, hasReadAccess } = useAuth();
  const canMedicate = canRecordSchedule(user, 'medications');
  const canPerformTask = canRecordSchedule(user, 'care_tasks');
  const canLogNutrition = hasSchedulePermission(user, 'nutrition.create');
  const canCompleteNutrition = canRecordSchedule(user, 'nutrition');

  const scrollContainerRef = useRef(null);
  const requestNumber = useRef(0);
  const scrolledDay = useRef(null);

  // Schedule date state
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Mobile tab state (for showing one section at a time on mobile)
  const [scheduleZone, setScheduleZone] = useState();
  const [mobileTab, setMobileTab] = useState('medications');
  
  // Schedule data state
  const [scheduleData, setScheduleData] = useState({
    medications: [],
    nutrition: [],
    care_tasks: []
  });
  const canReadRoutines = active && showNutrition && hasReadAccess !== false
    && hasSchedulePermission(user, 'nutrition.read');
  const manager = useDailyRoutines(selectedPatient?.id, scheduleData.nutrition, canReadRoutines);
  const [reminder, setReminder] = useState(null);
  const [moveFeed, setMoveFeed] = useState(null);
  const [fixedCheck, setFixedCheck] = useState(null);
  const [trackedTask, setTrackedTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [completing, setCompleting] = useState({}); // Track items being completed
  
  // Completion modal state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  // Hard gate when an administration is refused for insufficient on-hand quantity.
  const [qtyGate, setQtyGate] = useState({ open: false, info: null });
  const [completeModalData, setCompleteModalData] = useState({
    type: null, // 'medication', 'nutrition', 'care-task'
    items: [], // single item or multiple for bulk
    isBulk: false,
    hour: null
  });
  const [completeFormData, setCompleteFormData] = useState({
    completed_at: '',
    notes: '',
    // Medication-specific
    dose_amount: '',
    dose_unit: '',
    // Nutrition-specific
    amount: '',
    amount_unit: '',
    item_name: ''
  });
  // Nutrition completion is multi-item: the feed's component mix (or its
  // single legacy default) as editable rows, adjusted per feed.
  const [completeItems, setCompleteItems] = useState([]);

  // Post-feed flush follow-up: run (log the water) or skip (recorded).
  const [flushModal, setFlushModal] = useState({
    open: false, item: null, amount: '', notes: '', busy: false, error: null,
  });

  // PRN / Quick-log modal state
  const [prnModal, setPrnModal] = useState({
    open: false,
    type: null,          // 'medication' | 'nutrition' | 'care-task'
    hour: null,
    mode: null,          // nutrition: 'pick' | 'intake' | 'output'  |  medication: 'pick' | 'admin'
    selectedMed: null,   // the PRN med chosen when mode === 'admin'
  });
  const [prnMeds, setPrnMeds] = useState([]);
  const [prnMedsLoading, setPrnMedsLoading] = useState(false);
  const [prnError, setPrnError] = useState(null);
  // PRN sub-modals — these own their form state internally.
  const [showPrnIntakeModal, setShowPrnIntakeModal] = useState(false);
  const [showPrnOutputModal, setShowPrnOutputModal] = useState(false);
  const [prnNutritionDefaultDt, setPrnNutritionDefaultDt] = useState('');
  const [showDoseModal, setShowDoseModal] = useState(false);
  const [doseModalMed, setDoseModalMed] = useState(null);
  const [doseModalDefaultDt, setDoseModalDefaultDt] = useState('');
  // Care-task PRN flow
  const [prnCareTasks, setPrnCareTasks] = useState([]);
  const [prnCareTasksLoading, setPrnCareTasksLoading] = useState(false);
  const [showCareTaskCompleteModal, setShowCareTaskCompleteModal] = useState(false);
  const [careTaskModalTask, setCareTaskModalTask] = useState(null);
  const [careTaskModalDefaultDt, setCareTaskModalDefaultDt] = useState('');

  // Build a default local datetime-local string for the clicked hour on the
  // currently viewed date. If we're on today and the clicked hour is in the
  // past, keep the clicked hour but use the current minute so retro-logs feel
  // natural. Otherwise pin to :00 of the clicked hour.
  const defaultDateTimeForHour = (hour) => {
    const base = new Date(selectedDate);
    const now = new Date();
    base.setHours(hour);
    const onToday = base.toDateString() === now.toDateString();
    base.setMinutes(onToday && hour === now.getHours() ? now.getMinutes() : 0);
    base.setSeconds(0, 0);
    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    const hh = String(base.getHours()).padStart(2, '0');
    const mm = String(base.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hh}:${mm}`;
  };

  // Format date for API (YYYY-MM-DD) in local time — using toISOString here would
  // shift the date by one day in any timezone where the UTC offset has crossed midnight
  // (e.g. an evening in the US would send tomorrow's date to the backend).
  const formatDateForApi = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format date for display
  const formatDateDisplay = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Check if date is today
  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Navigation functions
  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  // Fetch schedule when patient or date changes
  useEffect(() => {
    if (!selectedPatient || !active) return;
    setMoveFeed(null);
    setReminder(null);
    setFixedCheck(null);
    setShowCompleteModal(false);
    fetchSchedule();
    const refresh = () => {
      if (!document.hidden && isToday(selectedDate)) fetchSchedule(true);
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      requestNumber.current += 1;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the visible patient, day, category or external refresh changes
  }, [selectedPatient, selectedDate, category, refreshKey, active]);

  // Scroll to current hour on load
  useEffect(() => {
    const dayKey = `${selectedPatient?.id}-${selectedDate.toDateString()}`;
    if (active && scrollContainerRef.current && isToday(selectedDate) && scrolledDay.current !== dayKey) {
      const currentHour = new Date().getHours();
      const hourRow = scrollContainerRef.current.querySelector(`[data-hour="${currentHour}"]`);
      if (hourRow) {
        scrolledDay.current = dayKey;
        hourRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [scheduleData, selectedDate, selectedPatient?.id, active]);

  const fetchSchedule = async (background = false) => {
    if (!selectedPatient) return;
    const request = ++requestNumber.current;
    
    try {
      if (!background) setLoading(true);
      setError(null);
      
      const dateParam = formatDateForApi(selectedDate);
      // Pass user's TZ offset (minutes user-local is ahead of UTC). The backend
      // uses this to compute the user-local day's UTC range so cron firings,
      // completion logs, and PRN doses all bucket onto the right day.
      const tzOffsetMinutes = -selectedDate.getTimezoneOffset();
      const params = new URLSearchParams({
        patient_id: selectedPatient.id, target_date: dateParam,
        tz_offset_minutes: tzOffsetMinutes,
      });
      // A managed feed from yesterday can move into today's nutrition grid.
      // Medication grace rows are included independently by the daily endpoint.
      if (showNutrition) params.set('include_prior_day', 'true');
      if (category) params.set('category', category);
      const response = await fetch(
        `${config.apiUrl}/api/schedule/daily?${params}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        if (request !== requestNumber.current) return;
        const nutrition = (showNutrition ? data.nutrition || [] : []).map(withLocalTimes).filter(row =>
          !row.is_yesterday || (row.managed_feed && !row.remind_at && row.effectiveAt?.toDateString() === selectedDate.toDateString()));
        setScheduleZone(data.timezone);
        setScheduleData({
          medications: (showMeds ? data.medications || [] : []).filter(row => !row.is_yesterday || row.in_grace).map(withLocalTimes),
          nutrition,
          care_tasks: (showTasks ? data.care_tasks || [] : []).filter(row => !row.is_yesterday).map(withLocalTimes),
        });
      } else if (request === requestNumber.current) {
        setError('Failed to load schedule');
      }
    } catch (err) {
      if (request === requestNumber.current) setError('Error connecting to server');
      console.error('Error fetching schedule:', err);
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  };

  const onTaskRecorded = (result) => {
    if (result?.requires_nutrition_tracking && result.care_task && hasSchedulePermission(user, 'nutrition.create')) setTrackedTask(result);
  };

  const refreshAfterWrite = () => {
    onChange?.();
    return fetchSchedule(true);
  };

  // Open completion modal for a single item
  const openReminder = (type, item) => {
    const categories = { medication: 'medications', nutrition: 'nutrition', 'care-task': 'care_tasks' };
    setShowCompleteModal(false);
    setFixedCheck(null);
    setReminder({ category: categories[type], item });
  };

  const reminderSaved = (displayDate) => {
    setReminder(null);
    // The day requested by /daily is the profile's calendar day. The caregiver
    // may have entered a time on another date in their device's timezone.
    const day = displayDate && new Intl.DateTimeFormat('sv-SE', {
      timeZone: scheduleZone, month: '2-digit', day: '2-digit', year: 'numeric',
    }).format(displayDate);
    if (day && day !== formatDateForApi(selectedDate)) {
      onChange?.();
      setSelectedDate(new Date(day + 'T12:00:00'));
    } else refreshAfterWrite();
  };

  const openCompleteModal = (type, item) => {
    if (item.completed) return;
    
    setCompleteModalData({
      type,
      items: [item],
      isBulk: false,
      hour: item.hour
    });
    
    // Pre-fill form with item data
    setCompleteFormData({
      completed_at: getCurrentLocalDateTime(),
      notes: '',
      dose_amount: item.dose_amount || '',
      dose_unit: item.dose_unit || '',
      // A dynamic water spot prefills today's suggestion, not its nominal.
      amount: (item.fluid_dynamic && item.suggested_amount != null)
        ? item.suggested_amount
        : (item.default_amount || ''),
      amount_unit: item.default_amount_unit || '',
      item_name: item.default_item || item.name || ''
    });

    // Nutrition: the feed's expected mix (or its single default) as rows.
    if (type === 'nutrition') {
      setCompleteItems(rowsFromScheduleRow(item));
    }

    setShowCompleteModal(true);
  };

  // Open completion modal for all items in an hour
  const openCompleteHourModal = (hour, type) => {
    const items = type === 'medication' ? medicationsByHour[hour] :
                  type === 'nutrition' ? nutritionByHour[hour] :
                  careTasksByHour[hour];
    
    const incompleteItems = items?.filter(i => !i.completed && !i.skipped && i.row_kind !== 'diaper_check' && i.row_kind !== 'flush') || [];
    if (incompleteItems.length === 0) return;
    
    setCompleteModalData({
      type,
      items: incompleteItems,
      isBulk: true,
      hour
    });
    
    // Pre-fill form with first item's data or defaults
    const firstItem = incompleteItems[0];
    setCompleteFormData({
      completed_at: getCurrentLocalDateTime(),
      notes: '',
      dose_amount: firstItem?.dose_amount || '',
      dose_unit: firstItem?.dose_unit || '',
      amount: firstItem?.default_amount || '',
      amount_unit: firstItem?.default_amount_unit || '',
      item_name: firstItem?.default_item || firstItem?.name || ''
    });
    
    setShowCompleteModal(true);
  };

  // When the backend refuses an administration for insufficient on-hand quantity
  // (409 insufficient_quantity), open the hard update-quantity gate. Returns true
  // when it handled the response so the caller can stop.
  const maybeGateOnQuantity = async (response) => {
    if (response.status !== 409) return false;
    const err = await response.json().catch(() => ({}));
    if (err.error === 'insufficient_quantity') {
      setQtyGate({ open: true, info: err });
      return true;
    }
    return false;
  };

  // Submit completion from modal
  const handleSubmitCompletion = async (skip = false) => {
    const { type, items, isBulk } = completeModalData;
    
    // Create completion key for loading state
    const loadingKey = isBulk 
      ? `hour-${completeModalData.hour}-${type}`
      : `${type}-${items[0].schedule_id}-${items[0].scheduled_time}`;
    
    setCompleting(prev => ({ ...prev, [loadingKey]: true }));

    // The inline warning + amber "Confirm …" button serves as the user's
    // acknowledgement; mark per-item early_override (which gates both edges of
    // the window on the backend) so each off-window item is let through.
    const completedAtUtc = completeFormData.completed_at
      ? localDateTimeToUTC(completeFormData.completed_at)
      : null;
    const itemIsOffWindow = (item) => {
      const { status } = checkAdministrationWindow(item.original_due_at ?? item.effective_time ?? item.scheduled_time, completedAtUtc);
      return status === 'early' || status === 'late';
    };

    try {
      if (isBulk) {
        // Bulk completion
        const payload = {
          medications: [],
          nutrition: [],
          care_tasks: []
        };

        const key = type === 'medication' ? 'medications' :
                   type === 'nutrition' ? 'nutrition' : 'care_tasks';

        payload[key] = items.map(item => ({
          schedule_id: item.schedule_id,
          scheduled_time: item.scheduled_time,
          patient_id: selectedPatient.id,
          user_id: user?.id || null,
          notes: completeFormData.notes || null,
          completed_at: localDateTimeToUTC(completeFormData.completed_at),
          early_override: itemIsOffWindow(item),
          // Include type-specific data — use each item's own scheduled values for bulk
          ...(type === 'medication' && {
            dose_amount: item.dose_amount,
            dose_unit: item.dose_unit
          })
          // Nutrition sends no item fields: the backend expands each feed's
          // component mix (or its legacy single default) itself.
        }));
        
        const response = await fetch(`${config.apiUrl}/api/schedule/complete/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });

        if (await maybeGateOnQuantity(response)) return;

        if (response.ok) {
          const result = await response.json();
          setShowCompleteModal(false);
          // Reload the persisted rows: bulk requests can partially fail, and
          // completed rows need their actual time and log id for Undo.
          await refreshAfterWrite();
          const completedCount = (result[key] || []).filter(i => i.success).length;
          if (!result.success || completedCount < items.length) {
            alert(result.error || 'Some items could not be recorded. Review the schedule for items still incomplete.');
          }
        } else {
          const data = await response.json().catch(() => ({}));
          alert(data.detail || 'Failed to record completion.');
        }
      } else {
        // Single item completion
        const item = items[0];
        const response = await fetch(`${config.apiUrl}/api/schedule/complete/${type}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            schedule_id: item.schedule_id,
            scheduled_time: item.scheduled_time,
            patient_id: selectedPatient.id,
            user_id: user?.id || null,
            notes: completeFormData.notes || (skip ? 'Skipped' : null),
            ...(type === 'care-task' && skip && { skipped: true }),
            completed_at: localDateTimeToUTC(completeFormData.completed_at),
            early_override: !skip && itemIsOffWindow(item),
            // Include type-specific data
            ...(type === 'medication' && {
              dose_amount: skip ? 0 : completeFormData.dose_amount,
              dose_unit: completeFormData.dose_unit
            }),
            ...(type === 'nutrition' && {
              // The full mix as adjusted in the dialog — one intake row per
              // item, grouped server-side under one event.
              items: completeItems.map(rowToItemPayload)
            })
          })
        });

        if (await maybeGateOnQuantity(response)) return;

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setShowCompleteModal(false);
            onTaskRecorded(result);
            // Include the actual completion time, Undo log id, and any
            // post-feed flush queued by the server in the refreshed schedule.
            await refreshAfterWrite();
          } else {
            alert(result.error || 'Failed to record completion.');
          }
        } else {
          const data = await response.json().catch(() => ({}));
          alert(data.detail || 'Failed to record completion.');
        }
      }
    } catch (err) {
      console.error(`Error completing ${type}:`, err);
    } finally {
      setCompleting(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  // Legacy handlers that now open modal (keeping for backwards compatibility if needed)
  const handleCompleteItem = (type, item) => {
    openCompleteModal(type, item);
  };

  // ---- Post-feed flush follow-up ----

  const openFlushModal = (item) => setFlushModal({
    open: true,
    item,
    // A pending flush prefills today's suggestion (what is left of the
    // fluid goal) over its queued nominal — 0 means the goal is met.
    amount: (item.fluid_dynamic && item.suggested_amount != null)
      ? String(item.suggested_amount)
      : (item.default_amount != null ? String(item.default_amount) : ''),
    notes: '',
    busy: false,
    error: null,
  });

  const closeFlushModal = () => setFlushModal((m) => ({ ...m, open: false }));

  const submitFlush = async (skip) => {
    const { item, amount, notes } = flushModal;
    if (!item?.followup_id) return;
    setFlushModal((m) => ({ ...m, busy: true, error: null }));
    try {
      if (skip) {
        await nutritionService.skipFlush(item.followup_id, {
          notes: notes || undefined, user_id: user?.id || undefined,
        });
      } else {
        await nutritionService.completeFlush(item.followup_id, {
          amount: amount ? Number(amount) : undefined,
          notes: notes || undefined,
          user_id: user?.id || undefined,
        });
      }
      setFlushModal((m) => ({ ...m, open: false, busy: false }));
      refreshAfterWrite();
    } catch (err) {
      setFlushModal((m) => ({ ...m, busy: false, error: err.message }));
    }
  };

  const handleCompleteHour = (hour, type) => {
    openCompleteHourModal(hour, type);
  };

  // Undo a completed item — deletes its log row (and, for medications, restores
  // the deducted on-hand quantity). `type` is the frontend item type
  // ('medication' | 'nutrition' | 'care_task'); nutrition splits into
  // intake/output based on the row's intake_type.
  const handleUndoItem = async (type, item) => {
    if (!item.log_id) return;
    let endpointType;
    if (type === 'medication') endpointType = 'medication';
    else if (type === 'care_task') endpointType = 'care_task';
    else if (type === 'nutrition') endpointType = item.intake_type === 'output' ? 'nutrition_output' : 'nutrition_intake';
    else return;

    const label = item.name || 'this item';
    const extra = type === 'medication' ? ' and restores the on-hand quantity' : '';
    if (!window.confirm(`Undo "${label}"? This removes the completion record${extra}.`)) return;

    try {
      const response = await fetch(
        `${config.apiUrl}/api/schedule/log/${endpointType}/${item.log_id}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (response.ok) {
        await refreshAfterWrite();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.detail || 'Failed to undo');
      }
    } catch (err) {
      console.error('Error undoing item:', err);
      alert('Error connecting to server');
    }
  };

  // PRN / Quick-log modal handlers

  const openPrnModal = (type, hour) => {
    if (!selectedPatient) return;
    const dt = defaultDateTimeForHour(hour);
    setPrnError(null);
    setPrnModal({
      open: true,
      type,
      hour,
      mode: type === 'care-task' ? 'pick' : type === 'nutrition' ? 'pick' : type === 'medication' ? 'pick' : null,
      selectedMed: null,
    });
    setPrnNutritionDefaultDt(dt);
    setDoseModalDefaultDt(dt);
    setCareTaskModalDefaultDt(dt);
    if (type === 'medication') fetchPrnMeds();
    if (type === 'care-task') fetchPrnCareTasks();
  };

  const closePrnModal = () => {
    setPrnModal({ open: false, type: null, hour: null, mode: null, selectedMed: null });
    setPrnError(null);
  };

  const fetchPrnMeds = async () => {
    if (!selectedPatient) return;
    try {
      setPrnMedsLoading(true);
      const res = await fetch(
        `${config.apiUrl}/api/admin/medications/active?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setPrnMeds(
          (data || [])
            .filter(m => m.as_needed)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      } else {
        setPrnError('Failed to load PRN medications');
      }
    } catch (err) {
      console.error('Error fetching PRN meds:', err);
      setPrnError('Error connecting to server');
    } finally {
      setPrnMedsLoading(false);
    }
  };

  const pickPrnMed = (med) => {
    // Close the picker and hand off to the shared dose modal. The dose
    // modal owns the form (dose / unit / given-at / notes) and the POST.
    closePrnModal();
    setDoseModalMed(med);
    setShowDoseModal(true);
  };

  const fetchPrnCareTasks = async () => {
    if (!selectedPatient) return;
    try {
      setPrnCareTasksLoading(true);
      const res = await fetch(
        `${config.apiUrl}/api/care-tasks/active?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setPrnCareTasks(data.care_tasks || []);
      } else {
        setPrnError('Failed to load care tasks');
      }
    } catch (err) {
      console.error('Error fetching care tasks:', err);
      setPrnError('Error connecting to server');
    } finally {
      setPrnCareTasksLoading(false);
    }
  };

  const pickPrnCareTask = (task) => {
    closePrnModal();
    setCareTaskModalTask(task);
    setShowCareTaskCompleteModal(true);
  };

  // Group care tasks by category (sorted, color-coded) for the PRN picker.
  const groupCareTasksByCategory = (tasks) => {
    const groups = new Map();
    for (const t of tasks) {
      const key = t.category_id ?? -1;
      if (!groups.has(key)) {
        groups.set(key, {
          id: t.category_id,
          name: t.category_name || 'Uncategorized',
          color: t.category_color || 'var(--vc-series-3)',
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

  const handlePrintSchedule = () => {
    // Add print class to body for print-specific styles
    document.body.classList.add('printing-schedule');
    window.print();
    // Remove the class after printing
    setTimeout(() => {
      document.body.classList.remove('printing-schedule');
    }, 100);
  };

  // Group items by hour. Within each hour: incomplete items float to the top,
  // completed items follow in the order they were performed.
  const getItemsByHour = (items) => {
    const byHour = {};
    for (let h = 0; h < 24; h++) {
      byHour[h] = [];
    }
    items.forEach(item => {
      // A delayed overnight run stays at the end of its original care evening.
      // It is also actionable on the following day's grid at its effective hour.
      const dayDifference = item.managed_feed && !item.remind_at && item.effectiveAt
        ? Math.max(0, Math.round((new Date(item.effectiveAt).setHours(0, 0, 0, 0) -
          new Date(selectedDate).setHours(0, 0, 0, 0)) / 86400000))
        : 0;
      const key = item.hour + 24 * dayDifference;
      (byHour[key] ??= []).push(item);
    });
    Object.values(byHour).forEach(group => {
      group.sort((a, b) => {
        if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
        return (a.minute ?? 0) - (b.minute ?? 0);
      });
    });
    return byHour;
  };

  // Grace-period doses (in_grace) were due on a prior day. They get their
  // own band above the hours rather than a slot in today's grid: yesterday's
  // 4 PM dose next to today's 4 PM dose reads as a duplicate that is wrongly
  // overdue. Oldest first.
  const graceMeds = scheduleData.medications
    .filter(m => m.in_grace && !m.remind_at)
    .sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));
  const medicationsByHour = getItemsByHour(scheduleData.medications.filter(m => !m.in_grace || m.remind_at));
  const nutritionByHour = getItemsByHour(scheduleData.nutrition);
  const careTasksByHour = getItemsByHour(scheduleData.care_tasks);

  const displayedHours = Object.keys(nutritionByHour).map(Number).sort((a, b) => a - b);

  // Format hour for display
  const formatHour = (hour) => {
    if (hour >= 24) {
      const day = new Date(selectedDate);
      day.setHours(hour, 0, 0, 0);
      return `${day.toLocaleDateString(undefined, { weekday: 'short' })} ${formatHour(hour % 24)}`;
    }
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
  };

  // Check if an hour row has any items
  const hasItemsInHour = (hour) => {
    return medicationsByHour[hour]?.length > 0 || 
           nutritionByHour[hour]?.length > 0 || 
           careTasksByHour[hour]?.length > 0;
  };

  // Get current hour for highlighting
  const currentHour = isToday(selectedDate) ? new Date().getHours() : -1;

  // Count totals for summary. These are scheduled-adherence ratios, so PRN /
  // ad-hoc entries (is_prn) are excluded — they still render on the timeline,
  // but they're extra care, not part of "X of Y scheduled items done".
  const totalMeds = scheduleData.medications.filter(m => !m.is_prn && (!m.in_grace || m.remind_at)).length;
  const completedMeds = scheduleData.medications.filter(m => !m.is_prn && (!m.in_grace || m.remind_at) && m.completed).length;
  const totalNutrition = scheduleData.nutrition.filter(n => !n.is_prn && !n.is_yesterday).length;
  const completedNutrition = scheduleData.nutrition.filter(n => !n.is_prn && !n.is_yesterday && n.completed).length;
  const totalTasks = scheduleData.care_tasks.filter(t => !t.is_prn).length;
  const completedTasks = scheduleData.care_tasks.filter(t => !t.is_prn && t.completed).length;

  // One medication row. Shared by the Overdue band and the hour rows.
  const renderMedRow = (med, idx) => {
    // PRN doses have no schedule_id; key off log_id instead.
    const rowId = med.schedule_id ?? `prn-${med.log_id}`;
    const itemKey = `medication-${rowId}-${med.scheduled_time}`;
    const isPrn = !!med.is_prn;
    const canComplete = canMedicate && !med.completed && !isPrn && !med.skipped;
    return (
      <React.Fragment key={`med-${rowId}-${idx}`}>
        {idx > 0 && <div className="admin-v2-schedule-divider" />}
        <div
          className={`admin-v2-schedule-item ${med.completed ? 'completed' : canComplete ? 'clickable' : ''} ${completing[itemKey] ? 'completing' : ''}`}
          onClick={(e) => { e.stopPropagation(); if (canComplete) handleCompleteItem('medication', med); }}
          role={canComplete ? 'button' : undefined}
          tabIndex={canComplete ? 0 : undefined}
          title={isPrn ? 'PRN dose — administered ad-hoc' : undefined}
        >
          <div className="admin-v2-schedule-item-header">
            <ScheduleItemHeading item={med} />
            {med.in_grace && !med.remind_at && med.reminder_state !== 'missed' && (
              <span className="admin-v2-badge admin-v2-badge-overdue" title={graceTitle(med)}>
                {overdueLabel(med)}
              </span>
            )}
            {isPrn && (
              <span className="admin-v2-badge admin-v2-badge-prn" title="As-needed dose">
                PRN
              </span>
            )}
            {med.dose_amount && (
              <span className="admin-v2-schedule-item-dose">
                {med.dose_amount} {med.dose_unit}
              </span>
            )}
            {med.skipped && <span className="admin-v2-badge">Skipped</span>}
            {canMedicate && med.completed && med.log_id ? (
              <button
                type="button"
                className="admin-v2-schedule-item-undo"
                onClick={(e) => { e.stopPropagation(); handleUndoItem('medication', med); }}
                title="Undo — mark as not done"
                aria-label="Undo"
              >
                <UndoIcon size={14} />
              </button>
            ) : (
              <span className={`admin-v2-schedule-item-check ${med.completed ? 'checked' : ''}`}>
                {completing[itemKey] ? '...' : <CheckIcon size={14} />}
              </span>
            )}
          </div>
        </div>
      </React.Fragment>
    );
  };

  return (
    <div className={category ? 'daily-schedule scoped-schedule' : 'daily-schedule'}>
            {error && (
              <div className="em-error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>
            )}

            {/* Date Navigation */}
            <div className="admin-v2-schedule-nav">
              <button 
                className="admin-v2-btn admin-v2-btn-icon"
                onClick={goToPreviousDay}
                title="Previous Day"
              >
                <ChevronLeftIcon size={20} />
              </button>
              
              <div className="admin-v2-schedule-date">
                <CalendarIcon size={18} />
                <span>{formatDateDisplay(selectedDate)}</span>
                {isToday(selectedDate) && (
                  <span className="admin-v2-today-badge">Today</span>
                )}
              </div>
              
              <button 
                className="admin-v2-btn admin-v2-btn-icon"
                onClick={goToNextDay}
                title="Next Day"
              >
                <ChevronRightIcon size={20} />
              </button>

              {!isToday(selectedDate) && (
                <button 
                  className="admin-v2-btn admin-v2-btn-sm"
                  onClick={goToToday}
                  style={{ marginLeft: '1rem' }}
                >
                  Go to Today
                </button>
              )}

              <input
                type="date"
                aria-label="Schedule date"
                value={formatDateForApi(selectedDate)}
                onChange={(e) => {
                  const day = new Date(e.target.value + 'T00:00:00');
                  if (!Number.isNaN(day.getTime())) setSelectedDate(day);
                }}
                className="admin-v2-date-picker"
              />

              <button 
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={handlePrintSchedule}
                title="Print Schedule"
                style={{ marginLeft: 'auto' }}
              >
                <PrintIcon size={16} />
                Print
              </button>
            </div>

            <DailyRoutines key={selectedPatient.id} patientId={selectedPatient.id}
              today={isToday(selectedDate)} rows={scheduleData.nutrition}
              canRead={canReadRoutines} manager={manager} onScheduledCheck={setFixedCheck} onRecorded={refreshAfterWrite} />

            {/* Summary Stats - on mobile: compact cards side-by-side, act as tab selector (no separate tab bar) */}
            {!category && <div className="admin-v2-summary-stats admin-v2-schedule-stats" style={{ marginBottom: '1.5rem' }}>
              <div className="admin-v2-schedule-stats-spacer" />
              <button
                type="button"
                className={`admin-v2-stat-card admin-v2-schedule-stat-card ${mobileTab === 'medications' ? 'active' : ''}`}
                onClick={() => setMobileTab('medications')}
                aria-pressed={mobileTab === 'medications'}
              >
                <div className="admin-v2-stat-icon medications">
                  <MedicationsIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{completedMeds}/{totalMeds}</h4>
                  <p>Medications</p>
                </div>
              </button>
              <button
                type="button"
                className={`admin-v2-stat-card admin-v2-schedule-stat-card ${mobileTab === 'nutrition' ? 'active' : ''}`}
                onClick={() => setMobileTab('nutrition')}
                aria-pressed={mobileTab === 'nutrition'}
              >
                <div className="admin-v2-stat-icon nutrition">
                  <NutritionIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{completedNutrition}/{totalNutrition}</h4>
                  <p>Nutrition</p>
                </div>
              </button>
              <button
                type="button"
                className={`admin-v2-stat-card admin-v2-schedule-stat-card ${mobileTab === 'tasks' ? 'active' : ''}`}
                onClick={() => setMobileTab('tasks')}
                aria-pressed={mobileTab === 'tasks'}
              >
                <div className="admin-v2-stat-icon tasks">
                  <TasksIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{completedTasks}/{totalTasks}</h4>
                  <p>Care Tasks</p>
                </div>
              </button>
            </div>}

            {/* Schedule Grid - which column(s) show is controlled by mobileTab (cards above are the selector) */}
            <div className={`admin-v2-schedule-container mobile-tab-${category === 'care_tasks' ? 'tasks' : category || mobileTab}`}
              onKeyDown={activateGridRow}>
              {loading ? (
                <div className="admin-v2-loading">Loading schedule...</div>
              ) : (
                <>
                  {/* Column Headers - long labels for desktop, short for mobile */}
                  <div className="admin-v2-schedule-header">
                    <div className="admin-v2-schedule-time-col">Time</div>
                    {showMeds && <div className="admin-v2-schedule-col medications">
                      <MedicationsIcon size={16} />
                      <span className="admin-v2-schedule-col-long">Medications</span>
                      <span className="admin-v2-schedule-col-short">Meds</span>
                      {category && <span aria-label="Completed of scheduled">{completedMeds}/{totalMeds}</span>}
                    </div>}
                    {showNutrition && <div className="admin-v2-schedule-col nutrition">
                      <NutritionIcon size={16} />
                      <span className="admin-v2-schedule-col-long">Nutrition</span>
                      <span className="admin-v2-schedule-col-short">Nutrition</span>
                      {category && <span aria-label="Completed of scheduled">{completedNutrition}/{totalNutrition}</span>}
                    </div>}
                    {showTasks && <div className="admin-v2-schedule-col tasks">
                      <TasksIcon size={16} />
                      <span className="admin-v2-schedule-col-long">Care Tasks</span>
                      <span className="admin-v2-schedule-col-short">Tasks</span>
                      {category && <span aria-label="Completed of scheduled">{completedTasks}/{totalTasks}</span>}
                    </div>}
                  </div>

                  {/* Scrollable Hour Rows */}
                  <div className="admin-v2-schedule-body" ref={scrollContainerRef}>
                    {showMeds && graceMeds.length > 0 && (
                      <div className="admin-v2-schedule-row has-items overdue-band" data-band="overdue">
                        <div className="admin-v2-schedule-time-col">
                          <span className="admin-v2-hour-label">Overdue</span>
                        </div>
                        <div className="admin-v2-schedule-col medications">
                          <div className="admin-v2-schedule-group medication">
                            {graceMeds.map(renderMedRow)}
                          </div>
                        </div>
                        {showNutrition && <div className="admin-v2-schedule-col nutrition" />}
                        {showTasks && <div className="admin-v2-schedule-col tasks" />}
                      </div>
                    )}
                    {displayedHours.map(hour => (
                      <div 
                        key={hour} 
                        className={`admin-v2-schedule-row ${hour === currentHour ? 'current-hour' : ''} ${hasItemsInHour(hour) ? 'has-items' : ''}`}
                        data-hour={hour}
                      >
                        {/* Time Column */}
                        <div className="admin-v2-schedule-time-col">
                          <span className="admin-v2-hour-label">{formatHour(hour)}</span>
                        </div>

                        {/* Medications Column */}
                        {showMeds && <div
                          className={`admin-v2-schedule-col medications ${canMedicate ? 'admin-v2-schedule-col-clickable' : ''}`}
                          onClick={canMedicate ? () => openPrnModal('medication', hour) : undefined}
                          role={canMedicate ? 'button' : undefined}
                          tabIndex={canMedicate ? 0 : undefined}
                          title={canMedicate ? 'Log PRN medication' : undefined}
                        >
                          {medicationsByHour[hour]?.length > 0 && (
                            <div className="admin-v2-schedule-group medication">
                              {canMedicate && medicationsByHour[hour].some(m => !m.completed) && (
                                <button
                                  className="admin-v2-schedule-complete-all"
                                  onClick={(e) => { e.stopPropagation(); handleCompleteHour(hour, 'medication'); }}
                                  disabled={completing[`hour-${hour}-medication`]}
                                  title="Complete all medications this hour"
                                >
                                  {completing[`hour-${hour}-medication`] ? '...' : <CheckIcon size={12} />}
                                </button>
                              )}
                              {medicationsByHour[hour].map(renderMedRow)}
                              {/* Explicit PRN tap target — the column itself is clickable,
                                  but when items fill the cell there's no white space to hit
                                  on touch devices. */}
                              <div className="admin-v2-schedule-divider" />
                              {canMedicate && <button
                                type="button"
                                className="admin-v2-schedule-prn-add"
                                onClick={(e) => { e.stopPropagation(); openPrnModal('medication', hour); }}
                                title="Log PRN medication"
                              >
                                + PRN
                              </button>}
                            </div>
                          )}
                        </div>}

                        {/* Nutrition Column */}
                        {showNutrition && <div
                          className={`admin-v2-schedule-col nutrition ${canLogNutrition ? 'admin-v2-schedule-col-clickable' : ''}`}
                          onClick={canLogNutrition ? () => openPrnModal('nutrition', hour) : undefined}
                          role={canLogNutrition ? 'button' : undefined}
                          tabIndex={canLogNutrition ? 0 : undefined}
                          title={canLogNutrition ? 'Log intake or output' : undefined}
                        >
                          {nutritionByHour[hour]?.length > 0 && (
                            <div className="admin-v2-schedule-group nutrition">
                              {canCompleteNutrition && nutritionByHour[hour].some(n => !n.completed && !n.skipped && n.row_kind !== 'diaper_check' && n.row_kind !== 'flush') && (
                                <button
                                  className="admin-v2-schedule-complete-all"
                                  onClick={(e) => { e.stopPropagation(); handleCompleteHour(hour, 'nutrition'); }}
                                  disabled={completing[`hour-${hour}-nutrition`]}
                                  title="Complete all nutrition this hour"
                                >
                                  {completing[`hour-${hour}-nutrition`] ? '...' : <CheckIcon size={12} />}
                                </button>
                              )}
                              {nutritionByHour[hour].map((item, idx) => {
                                // PRN intakes/outputs have no schedule_id — key off log_id.
                                // Flush follow-ups key off their own id.
                                const isFlush = item.row_kind === 'flush';
                                const rowId = isFlush
                                  ? `flush-${item.followup_id}`
                                  : (item.schedule_id ?? `prn-${item.intake_type || 'intake'}-${item.log_id}`);
                                const itemKey = `nutrition-${rowId}-${item.scheduled_time}`;
                                const isPrn = !!item.is_prn;
                                const isOutput = item.intake_type === 'output';
                                const isSkipped = !!item.skipped;
                                const isActionable = !item.completed && !isPrn && !isSkipped &&
                                  (item.row_kind === 'diaper_check'
                                    ? (canLogNutrition && (manager.state?.can_record ?? true))
                                    : canCompleteNutrition);
                                return (
                                  <React.Fragment key={`nutr-${rowId}-${idx}`}>
                                    {idx > 0 && <div className="admin-v2-schedule-divider" />}
                                    <div
                                      className={`admin-v2-schedule-item ${item.completed ? 'completed' : (isActionable ? 'clickable' : '')} ${isSkipped ? 'skipped' : ''} ${completing[itemKey] ? 'completing' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isActionable) return;
                                        if (isFlush) openFlushModal(item);
                                        else if (item.row_kind === 'diaper_check') setFixedCheck(item);
                                        else handleCompleteItem('nutrition', item);
                                      }}
                                      role="button"
                                      tabIndex={isActionable ? 0 : -1}
                                      title={isPrn ? (isOutput ? 'Output logged ad-hoc' : 'Intake logged ad-hoc')
                                        : isFlush ? 'Post-feed flush — run or skip'
                                          : undefined}
                                    >
                                      <div className="admin-v2-schedule-item-header">
                                        <ScheduleItemHeading item={item} />
                                        {item.managed_feed && !item.completed && !item.remind_at && item.effectiveAt?.getTime() !== item.scheduledAt?.getTime() && item.timing_reason && (
                                          <span className="schedule-timing-reason">Usually {slotLabel(item.scheduledAt)} · {item.timing_reason}</span>
                                        )}
                                        {isPrn && (
                                          <span
                                            className={`admin-v2-badge admin-v2-badge-prn admin-v2-badge-prn-${isOutput ? 'out' : 'in'}`}
                                            title={isOutput ? 'Output (PRN)' : 'Intake (PRN)'}
                                          >
                                            {isOutput ? 'PRN Out' : 'PRN In'}
                                          </span>
                                        )}
                                        {isFlush && (
                                          <span
                                            className="admin-v2-badge admin-v2-badge-prn admin-v2-badge-prn-in"
                                            title="Post-feed water flush"
                                          >
                                            Flush
                                          </span>
                                        )}
                                        {isSkipped && (
                                          <span className="admin-v2-badge" title="Deliberately not run">
                                            Skipped
                                          </span>
                                        )}
                                        {item.components?.length ? (
                                          <span
                                            className="admin-v2-schedule-item-dose"
                                            title={item.components.map((c) => `${c.item_name} ${c.amount} ${c.amount_unit}`).join(' + ')}
                                          >
                                            {item.components.length > 1
                                              ? `${item.components.length} items`
                                              : `${item.components[0].item_name} ${item.components[0].amount} ${item.components[0].amount_unit || ''}`}
                                          </span>
                                        ) : (item.fluid_dynamic && !item.completed && item.suggested_amount != null) ? (
                                          // Dynamic water spot: the amount is computed from
                                          // what is left of the daily fluid target.
                                          <span
                                            className="admin-v2-schedule-item-dose"
                                            title={item.water_plan
                                              ? `Target ${item.water_plan.target_ml} mL · logged ${item.water_plan.logged_ml} · ${item.water_plan.expected_food_ml} coming from feeds · ${item.water_plan.spots_remaining} spot${item.water_plan.spots_remaining === 1 ? '' : 's'} left`
                                              : undefined}
                                          >
                                            {item.default_item && <span>{item.default_item} </span>}
                                            {item.suggested_amount > 0
                                              ? `suggested ${item.suggested_amount} ${item.default_amount_unit || 'ml'}${item.default_amount ? ` (of ${item.default_amount})` : ''}`
                                              : 'goal met — skip?'}
                                          </span>
                                        ) : (item.default_amount || item.default_item) && (
                                          <span className="admin-v2-schedule-item-dose">
                                            {item.default_item && <span>{item.default_item}</span>}
                                            {item.default_amount && (
                                              <span> {item.default_amount} {item.default_amount_unit || ''}</span>
                                            )}
                                          </span>
                                        )}
                                        {item.check_outcome && <span className="admin-v2-schedule-item-dose">
                                          {item.check_outcome === 'dry' ? 'Checked dry' : 'Diaper changed'}
                                        </span>}
                                        {item.managed_feed && !item.completed && manager.state?.can_manage && (
                                          <button type="button" className="schedule-move-feed" onClick={(event) => {
                                            event.stopPropagation();
                                            setMoveFeed(item);
                                          }}>Move this feed</button>
                                        )}
                                        {canCompleteNutrition && item.completed && item.log_id ? (
                                          <button
                                            type="button"
                                            className="admin-v2-schedule-item-undo"
                                            onClick={(e) => { e.stopPropagation(); handleUndoItem('nutrition', item); }}
                                            title="Undo — mark as not done"
                                            aria-label="Undo"
                                          >
                                            <UndoIcon size={14} />
                                          </button>
                                        ) : (
                                          <span className={`admin-v2-schedule-item-check ${item.completed ? 'checked' : ''}`}>
                                            {completing[itemKey] ? '...' : <CheckIcon size={14} />}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                              {/* Explicit PRN tap target — mirrors the meds column. */}
                              <div className="admin-v2-schedule-divider" />
                              {canLogNutrition && <button
                                type="button"
                                className="admin-v2-schedule-prn-add"
                                onClick={(e) => { e.stopPropagation(); openPrnModal('nutrition', hour); }}
                                title="Log PRN intake or output"
                              >
                                + PRN
                              </button>}
                            </div>
                          )}
                        </div>}

                        {/* Care Tasks Column */}
                        {showTasks && <div
                          className={`admin-v2-schedule-col tasks ${canPerformTask ? 'admin-v2-schedule-col-clickable' : ''}`}
                          onClick={canPerformTask ? () => openPrnModal('care-task', hour) : undefined}
                          role={canPerformTask ? 'button' : undefined}
                          tabIndex={canPerformTask ? 0 : undefined}
                          title={canPerformTask ? 'Log ad-hoc care task' : undefined}
                        >
                          {careTasksByHour[hour]?.length > 0 && (
                            <div className="admin-v2-schedule-group care-task">
                              {canPerformTask && careTasksByHour[hour].some(t => !t.completed) && (
                                <button
                                  className="admin-v2-schedule-complete-all"
                                  onClick={(e) => { e.stopPropagation(); handleCompleteHour(hour, 'care-task'); }}
                                  disabled={completing[`hour-${hour}-care-task`]}
                                  title="Complete all care tasks this hour"
                                >
                                  {completing[`hour-${hour}-care-task`] ? '...' : <CheckIcon size={12} />}
                                </button>
                              )}
                              {careTasksByHour[hour].map((task, idx) => {
                                // PRN completions have no schedule_id; key off log_id instead.
                                const rowId = task.schedule_id ?? `prn-${task.log_id}`;
                                const itemKey = `care-task-${rowId}-${task.scheduled_time}`;
                                const isPrn = !!task.is_prn;
                                const canComplete = canPerformTask && !task.completed && !isPrn && task.status !== 'skipped';
                                return (
                                  <React.Fragment key={`task-${rowId}-${idx}`}>
                                    {idx > 0 && (
                                      <div
                                        className="admin-v2-schedule-divider"
                                        style={task.category_color !== careTasksByHour[hour][idx-1]?.category_color ? {
                                          height: '2px',
                                          background: `linear-gradient(to right, ${careTasksByHour[hour][idx-1]?.category_color || 'var(--vc-series-3)'}, ${task.category_color || 'var(--vc-series-3)'})`
                                        } : {}}
                                      />
                                    )}
                                    <div
                                      className={`admin-v2-schedule-item ${task.completed ? 'completed' : canComplete ? 'clickable' : ''} ${completing[itemKey] ? 'completing' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); if (canComplete) handleCompleteItem('care-task', task); }}
                                      role={canComplete ? 'button' : undefined}
                                      tabIndex={canComplete ? 0 : undefined}
                                      title={isPrn ? 'PRN care task — completed ad-hoc' : undefined}
                                      style={task.category_color ? { borderLeft: `3px solid ${task.category_color}` } : {}}
                                    >
                                      <div className="admin-v2-schedule-item-header">
                                        <ScheduleItemHeading item={task} />
                                        {isPrn && (
                                          <span className="admin-v2-badge admin-v2-badge-prn" title="As-needed care task">
                                            PRN
                                          </span>
                                        )}
                                        {task.category_name && (
                                          <span 
                                            className="admin-v2-schedule-item-category"
                                            style={task.category_color ? { backgroundColor: task.category_color + '20', color: task.category_color } : {}}
                                          >
                                            {task.category_name}
                                          </span>
                                        )}
                                        {task.status === 'skipped' && <span className="admin-v2-badge">Skipped</span>}
                                        {canPerformTask && task.completed && task.log_id ? (
                                          <button
                                            type="button"
                                            className="admin-v2-schedule-item-undo"
                                            onClick={(e) => { e.stopPropagation(); handleUndoItem('care_task', task); }}
                                            title="Undo — mark as not done"
                                            aria-label="Undo"
                                          >
                                            <UndoIcon size={14} />
                                          </button>
                                        ) : (
                                          <span className={`admin-v2-schedule-item-check ${task.completed ? 'checked' : ''}`}>
                                            {completing[itemKey] ? '...' : <CheckIcon size={14} />}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                              {/* Explicit PRN tap target — mirrors meds/nutrition columns. */}
                              <div className="admin-v2-schedule-divider" />
                              {canPerformTask && <button
                                type="button"
                                className="admin-v2-schedule-prn-add"
                                onClick={(e) => { e.stopPropagation(); openPrnModal('care-task', hour); }}
                                title="Log ad-hoc care task"
                              >
                                + PRN
                              </button>}
                            </div>
                          )}
                        </div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
        {trackedTask && (
          <IntakeSheet open patient={selectedPatient}
            careTaskLogId={trackedTask.log_id ?? trackedTask.id} careTaskName={trackedTask.care_task.name}
            onClose={() => setTrackedTask(null)} onSaved={refreshAfterWrite} />
        )}
        {moveFeed && <MoveFeedDialog item={moveFeed} patientId={selectedPatient.id}
          onClose={() => setMoveFeed(null)} onSaved={() => { setMoveFeed(null); refreshAfterWrite(); }} />}
        {reminder && <OccurrenceReminderDialog item={reminder.item} category={reminder.category}
          patientId={selectedPatient.id} onClose={() => setReminder(null)} onSaved={reminderSaved} />}
        {fixedCheck && <FixedCheckDialog item={fixedCheck} patientId={selectedPatient.id}
          onRemind={() => openReminder('nutrition', fixedCheck)}
          onClose={() => setFixedCheck(null)} onSaved={() => { setFixedCheck(null); refreshAfterWrite(); }} />}

        {/* Completion Confirmation Dialog */}
        <EntityModal
          open={showCompleteModal}
          onOpenChange={(o) => { if (!o) setShowCompleteModal(false); }}
          title={completeModalData.isBulk
            ? `Complete ${completeModalData.items.length} ${completeModalData.type === 'medication' ? 'Medication' : completeModalData.type === 'nutrition' ? 'Nutrition' : 'Care Task'}${completeModalData.items.length > 1 ? 's' : ''}`
            : `Complete ${completeModalData.type === 'medication' ? 'Medication' : completeModalData.type === 'nutrition' ? 'Nutrition' : 'Care Task'}`}
        >
          <div className="em-form">
            <div className="sch-summary">
              {completeModalData.items.map((item, idx) => (
                <div key={idx} className="sch-summary-row">
                  <span className="sch-summary-name">{item.name}</span>
                  <span className="sch-summary-when">
                    Scheduled {reminderDateLabel(item.original_due_at ?? item.scheduled_time) || slotLabel(item.scheduledAt)}
                  </span>
                </div>
              ))}
            </div>

            {!completeModalData.isBulk && completeModalData.items[0]?.can_remind_later && (
              <div><button type="button" className="em-cancel"
                onClick={() => openReminder(completeModalData.type, completeModalData.items[0])}>
                {completeModalData.items[0].remind_at ? 'Adjust reminder' : 'Remind me later'}
              </button></div>
            )}
            <EmField label={completeModalData.items.some(item => item.managed_feed) ? 'Started at' : 'Completed At'}
                     required htmlFor="sch-completed-at"
                     hint={completeModalData.items.some(item => item.managed_feed)
                       ? 'Use the actual start time to update the remaining feeds.'
                       : 'Adjust if completed at a different time'}>
              <input
                id="sch-completed-at"
                className="em-input"
                type="datetime-local"
                value={completeFormData.completed_at}
                onChange={e => setCompleteFormData({ ...completeFormData, completed_at: e.target.value })}
              />
            </EmField>

            {completeModalData.type === 'medication' && !completeModalData.isBulk && (
              <EmField label="Dose Amount" htmlFor="sch-dose">
                <span className="sch-dose">
                  <input
                    id="sch-dose"
                    className="em-input"
                    type="number"
                    step="0.1"
                    value={completeFormData.dose_amount}
                    onChange={e => setCompleteFormData({ ...completeFormData, dose_amount: e.target.value })}
                    placeholder="Amount given"
                  />
                  <span className="sch-dose-unit">{completeFormData.dose_unit || 'units'}</span>
                </span>
              </EmField>
            )}

            {/* Nutrition: the feed's mix as editable rows — adjust amounts,
                drop what was refused, add the extra juice that was given. */}
            {completeModalData.type === 'nutrition' && !completeModalData.isBulk && (
              <>
                <IntakeItemsEditor
                  patient={selectedPatient}
                  items={completeItems}
                  onChange={setCompleteItems}
                  title="What was given"
                  // The feed's planned totals: a live "given / target, N to go"
                  // panel tracks the mix while amounts are adjusted.
                  target={feedTarget(completeModalData.items[0])}
                  targetLabel={completeModalData.items[0]?.name}
                  idPrefix="complete"
                />
                {completeModalData.items[0]?.flush_components?.length > 0 && (
                  <p className="sch-note">
                    {completeModalData.items[0].flush_components
                      .map((c) => `${c.item_name} (${c.amount} ${c.amount_unit})`)
                      .join(' + ')}{' '}
                    will be scheduled as a flush after this feed — based on the
                    tube-feed rate, or one hour if no rate is set.
                  </p>
                )}
              </>
            )}

            <EmField label="Notes (optional)" htmlFor="sch-notes">
              <textarea
                id="sch-notes"
                className="em-input"
                value={completeFormData.notes}
                onChange={e => setCompleteFormData({ ...completeFormData, notes: e.target.value })}
                placeholder="Any additional notes..."
                rows={2}
              />
            </EmField>

            {/* Off-window (early or late) administration warning */}
            {(() => {
              const completedAtUtc = completeFormData.completed_at
                ? localDateTimeToUTC(completeFormData.completed_at)
                : null;
              const checks = completeModalData.items.map(item => ({
                item,
                check: checkAdministrationWindow(item.original_due_at ?? item.effective_time ?? item.scheduled_time, completedAtUtc),
              }));
              const earlyItems = checks.filter(({ check }) => check.status === 'early');
              const lateItems = checks.filter(({ check }) => check.status === 'late');
              if (earlyItems.length === 0 && lateItems.length === 0) return null;
              const typeLabel = completeModalData.type === 'medication'
                ? 'medication'
                : completeModalData.type === 'nutrition'
                  ? 'nutrition item'
                  : 'care task';
              const renderGroup = (group, kind) => {
                if (group.length === 0) return null;
                const direction = kind === 'early' ? 'before' : 'after';
                return (
                  <>
                    <p className="sch-warn-body">
                      {group.length === 1
                        ? `You are about to log this ${typeLabel} more than 1 hour ${direction} its scheduled time.`
                        : `${group.length} items are being logged more than 1 hour ${direction} their scheduled time.`}
                      {' '}Giving a {typeLabel} {kind} can be unsafe. Confirm this is intentional before continuing.
                    </p>
                    <ul className="sch-warn-list">
                      {group.map(({ item, check }, idx) => (
                        <li key={`${kind}-${idx}`}>
                          <strong>{item.name}</strong> — scheduled {check.scheduledLocal}
                          {' '}({formatDurationMinutes(Math.abs(check.minutesOffset))} {kind})
                        </li>
                      ))}
                    </ul>
                  </>
                );
              };
              const headerText = earlyItems.length > 0 && lateItems.length > 0
                ? 'Warning: off-window administration'
                : earlyItems.length > 0
                  ? 'Warning: early administration'
                  : 'Warning: late administration';
              return (
                <div className="sch-warn" role="alert">
                  <p className="sch-warn-title">{headerText}</p>
                  {renderGroup(earlyItems, 'early')}
                  {renderGroup(lateItems, 'late')}
                </div>
              );
            })()}

            <div className="em-footer">
              <button type="button" className="em-cancel" onClick={() => setShowCompleteModal(false)}>
                Cancel
              </button>
              {!completeModalData.isBulk && completeModalData.type !== 'nutrition' && (
                <button type="button" className="em-cancel" disabled={Object.values(completing).some(Boolean)}
                  onClick={() => handleSubmitCompletion(true)}>Skip</button>
              )}
              {(() => {
                const completedAtUtc = completeFormData.completed_at
                  ? localDateTimeToUTC(completeFormData.completed_at)
                  : null;
                const statuses = completeModalData.items.map(
                  item => checkAdministrationWindow(item.original_due_at ?? item.effective_time ?? item.scheduled_time, completedAtUtc).status
                );
                const hasEarly = statuses.some(s => s === 'early');
                const hasLate = statuses.some(s => s === 'late');
                const isOffWindow = hasEarly || hasLate;
                const nutritionInvalid = completeModalData.type === 'nutrition'
                  && !completeModalData.isBulk
                  && (completeItems.length === 0 || !completeItems.every(rowIsValid));
                const saving = Object.values(completing).some(v => v);
                const label = saving
                  ? 'Saving...'
                  : hasEarly && hasLate
                    ? 'Confirm Off-Window Administration'
                    : hasEarly
                      ? 'Confirm Early Administration'
                      : hasLate
                        ? 'Confirm Late Administration'
                        : 'Mark Complete';
                return (
                  <button
                    type="button"
                    className={`em-submit${isOffWindow ? ' warn' : ''}`}
                    onClick={() => handleSubmitCompletion()}
                    disabled={saving || nutritionInvalid}
                  >
                    {label}
                  </button>
                );
              })()}
            </div>
          </div>
        </EntityModal>

        {/* PRN / Quick-log Dialog */}
        <EntityModal
          open={prnModal.open}
          onOpenChange={(o) => { if (!o) closePrnModal(); }}
          title={
            <>
              {prnModal.type === 'medication' && 'Log PRN Medication'}
              {prnModal.type === 'nutrition' && 'Log Nutrition'}
              {prnModal.type === 'care-task' && 'Log Care Task'}
              {prnModal.hour != null && ` — ${formatHour(prnModal.hour)}`}
            </>
          }
        >
          <div className="em-form">
            {prnError && <p className="em-error" role="alert">{prnError}</p>}

            {/* ───────────── Medication ───────────── */}
            {prnModal.type === 'medication' && prnModal.mode === 'pick' && (
              prnMedsLoading ? (
                <p className="sch-empty">Loading PRN medications…</p>
              ) : prnMeds.length === 0 ? (
                <p className="sch-empty">No PRN (as-needed) medications for this patient.</p>
              ) : (
                <div className="cfg-picklist">
                  {prnMeds.map(med => (
                    <button key={med.id} type="button" className="cfg-pick"
                            onClick={() => pickPrnMed(med)}>
                      <span className="cfg-pick-main">
                        <span className="cfg-pick-name">{med.name}</span>
                        <span className="sch-pick-sub">
                          {med.concentration ? `${med.concentration} • ` : ''}
                          Last given: {med.last_administered
                            ? new Date(med.last_administered).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                              })
                            : 'never'}
                        </span>
                      </span>
                      <span className="cfg-pick-meta">Give</span>
                    </button>
                  ))}
                </div>
              )
            )}

            {/* ───────────── Nutrition ───────────── */}
            {prnModal.type === 'nutrition' && prnModal.mode === 'pick' && (
              <div className="sch-choices">
                <button type="button" className="sch-choice primary"
                        onClick={() => { closePrnModal(); setShowPrnIntakeModal(true); }}>
                  <NutritionIcon size={22} />
                  Log Intake
                </button>
                <button type="button" className="sch-choice"
                        onClick={() => { closePrnModal(); setShowPrnOutputModal(true); }}>
                  <NutritionIcon size={22} />
                  Log Output
                </button>
              </div>
            )}

            {/* ───────────── Care tasks ───────────── */}
            {prnModal.type === 'care-task' && prnModal.mode === 'pick' && (
              prnCareTasksLoading ? (
                <p className="sch-empty">Loading care tasks…</p>
              ) : prnCareTasks.length === 0 ? (
                <p className="sch-empty">No active care tasks for this patient.</p>
              ) : (
                <div>
                  {groupCareTasksByCategory(prnCareTasks).map(group => (
                    <div key={group.id ?? 'uncat'} className="sch-group">
                      {/* Category colour rides on the dot, not a stripe. */}
                      <div className="sch-group-head">
                        <span className="sch-dot" style={{ backgroundColor: group.color }} aria-hidden="true" />
                        {group.name}
                      </div>
                      <div className="cfg-picklist">
                        {group.tasks.map(task => (
                          <button key={task.id} type="button" className="cfg-pick"
                                  onClick={() => pickPrnCareTask(task)}>
                            <span className="cfg-pick-main">
                              <span className="cfg-pick-name">{task.name}</span>
                              {task.description && (
                                <span className="sch-pick-sub">{task.description}</span>
                              )}
                            </span>
                            <span className="cfg-pick-meta">Log</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            <div className="em-footer">
              <button type="button" className="em-cancel" onClick={closePrnModal}>Close</button>
            </div>
          </div>
        </EntityModal>
        {/* Shared sub-modals launched from the PRN flow */}
        <IntakeSheet
          open={showPrnIntakeModal}
          onClose={() => setShowPrnIntakeModal(false)}
          onSaved={refreshAfterWrite}
          patient={selectedPatient}
          defaultDateTime={prnNutritionDefaultDt}
        />
        <OutputSheet
          open={showPrnOutputModal}
          onClose={() => setShowPrnOutputModal(false)}
          onSaved={refreshAfterWrite}
          patient={selectedPatient}
          defaultDateTime={prnNutritionDefaultDt}
        />
        <MedicationDoseModal
          open={showDoseModal}
          onClose={() => { setShowDoseModal(false); setDoseModalMed(null); }}
          onSaved={refreshAfterWrite}
          patient={selectedPatient}
          medication={doseModalMed}
          defaultDateTime={doseModalDefaultDt}
        />
        {qtyGate.open && (
          <UpdateQuantityModal
            info={qtyGate.info}
            onClose={() => setQtyGate({ open: false, info: null })}
            onUpdated={() => { setQtyGate({ open: false, info: null }); handleSubmitCompletion(); }}
          />
        )}
        <CareTaskCompleteModal
          open={showCareTaskCompleteModal}
          onClose={() => { setShowCareTaskCompleteModal(false); setCareTaskModalTask(null); }}
          onSaved={(result) => { onTaskRecorded(result); refreshAfterWrite(); }}
          patient={selectedPatient}
          task={careTaskModalTask}
          defaultDateTime={careTaskModalDefaultDt}
        />

        {/* Post-feed flush: run it (logs the water) or skip it (recorded —
            smoothie-heavy mixes already carry enough water). */}
        <EntityModal
          open={flushModal.open}
          onOpenChange={(o) => { if (!o) closeFlushModal(); }}
          title={flushModal.item?.name || 'Water flush'}
        >
          <div className="em-form">
            {flushModal.error && <p className="em-error" role="alert">{flushModal.error}</p>}

            {flushModal.item?.fluid_dynamic && flushModal.item?.water_plan && (
              // The suggestion shows its work so a caregiver can sanity-check
              // it against the day before pouring.
              <p className="sch-note">
                {flushModal.item.suggested_amount > 0
                  ? `Suggested ${flushModal.item.suggested_amount} mL of the queued ${flushModal.item.default_amount ?? '—'}: `
                  : 'Fluid goal already met — skip? '}
                target {flushModal.item.water_plan.target_ml} mL,
                logged {flushModal.item.water_plan.logged_ml},
                {' '}{flushModal.item.water_plan.expected_food_ml} still coming from feeds.
              </p>
            )}

            <EmField label={`Amount (${flushModal.item?.default_amount_unit || 'ml'})`} htmlFor="sch-flush-amount">
              <input
                id="sch-flush-amount"
                className="em-input"
                type="number"
                step="any"
                min="0"
                value={flushModal.amount}
                onChange={(e) => setFlushModal((m) => ({ ...m, amount: e.target.value }))}
              />
            </EmField>

            <EmField label="Notes (optional)" htmlFor="sch-flush-notes">
              <textarea
                id="sch-flush-notes"
                className="em-input"
                rows={2}
                value={flushModal.notes}
                onChange={(e) => setFlushModal((m) => ({ ...m, notes: e.target.value }))}
                placeholder="Anything worth passing on..."
              />
            </EmField>

            <div className="em-footer">
              <button type="button" className="em-cancel" onClick={closeFlushModal}>Cancel</button>
              <button type="button" className="em-cancel" disabled={flushModal.busy}
                      onClick={() => submitFlush(true)}>
                Skip — not needed
              </button>
              <button type="button" className="em-submit"
                      disabled={flushModal.busy || !Number(flushModal.amount)}
                      onClick={() => submitFlush(false)}>
                {flushModal.busy ? 'Saving...' : 'Run flush'}
              </button>
            </div>
          </div>
        </EntityModal>
    </div>
  );
}

export default AdminV2Schedule;
