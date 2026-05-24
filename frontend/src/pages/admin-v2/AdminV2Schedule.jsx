import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal, IntakeModal, OutputModal, MedicationDoseModal, CareTaskCompleteModal } from './components';
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
  PatientsIcon,
  XIcon,
  EditIcon,
  PrintIcon
} from '../../components/Icons';
import { getCurrentLocalDateTime, localDateTimeToUTC, checkAdministrationWindow, formatDurationMinutes } from '../../utils/timezone';
import './AdminV2.css';

const AdminV2Schedule = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const scrollContainerRef = useRef(null);
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  // Use context patient as the source of truth
  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);
  
  // Schedule date state
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Mobile tab state (for showing one section at a time on mobile)
  const [mobileTab, setMobileTab] = useState('medications');
  
  // Schedule data state
  const [scheduleData, setScheduleData] = useState({
    medications: [],
    nutrition: [],
    care_tasks: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [completing, setCompleting] = useState({}); // Track items being completed
  
  // Completion modal state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
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

  // PRN / Quick-log modal state
  const navigate = useNavigate();
  const [prnModal, setPrnModal] = useState({
    open: false,
    type: null,          // 'medication' | 'nutrition' | 'care-task'
    hour: null,
    mode: null,          // nutrition: 'pick' | 'intake' | 'output'  |  medication: 'pick' | 'admin'
    selectedMed: null,   // the PRN med chosen when mode === 'admin'
  });
  const [prnMeds, setPrnMeds] = useState([]);
  const [prnMedsLoading, setPrnMedsLoading] = useState(false);
  const [prnSaving, setPrnSaving] = useState(false);
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
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

  // Fetch schedule when patient or date changes
  useEffect(() => {
    if (selectedPatient) {
      fetchSchedule();
    }
  }, [selectedPatient, selectedDate]);

  // Scroll to current hour on load
  useEffect(() => {
    if (scrollContainerRef.current && isToday(selectedDate)) {
      const currentHour = new Date().getHours();
      const hourRow = scrollContainerRef.current.querySelector(`[data-hour="${currentHour}"]`);
      if (hourRow) {
        hourRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [scheduleData, selectedDate]);

  const fetchSchedule = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const dateParam = formatDateForApi(selectedDate);
      // Pass user's TZ offset (minutes user-local is ahead of UTC). The backend
      // uses this to compute the user-local day's UTC range so cron firings,
      // completion logs, and PRN doses all bucket onto the right day.
      const tzOffsetMinutes = -new Date().getTimezoneOffset();
      const response = await fetch(
        `${config.apiUrl}/api/schedule/daily?patient_id=${selectedPatient.id}&target_date=${dateParam}&tz_offset_minutes=${tzOffsetMinutes}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Convert UTC scheduled times to local timezone for display
        // Backend returns times in UTC, we need to compute local hour/minute
        const convertToLocalTime = (item) => {
          if (!item.scheduled_time) return item;
          // Ensure the time is parsed as UTC (add Z if missing)
          const utcTime = item.scheduled_time.endsWith('Z') || item.scheduled_time.includes('+') 
            ? item.scheduled_time 
            : item.scheduled_time + 'Z';
          const localDate = new Date(utcTime);
          return {
            ...item,
            hour: localDate.getHours(),
            minute: localDate.getMinutes()
          };
        };
        
        setScheduleData({
          medications: (data.medications || []).map(convertToLocalTime),
          nutrition: (data.nutrition || []).map(convertToLocalTime),
          care_tasks: (data.care_tasks || []).map(convertToLocalTime)
        });
      } else {
        setError('Failed to load schedule');
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
    setShowPatientModal(false);
  };

  // Open completion modal for a single item
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
      amount: item.default_amount || '',
      amount_unit: item.default_amount_unit || '',
      item_name: item.default_item || item.name || ''
    });
    
    setShowCompleteModal(true);
  };

  // Open completion modal for all items in an hour
  const openCompleteHourModal = (hour, type) => {
    const items = type === 'medication' ? medicationsByHour[hour] :
                  type === 'nutrition' ? nutritionByHour[hour] :
                  careTasksByHour[hour];
    
    const incompleteItems = items?.filter(i => !i.completed) || [];
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

  // Submit completion from modal
  const handleSubmitCompletion = async () => {
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
      const { status } = checkAdministrationWindow(item.scheduled_time, completedAtUtc);
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
          }),
          ...(type === 'nutrition' && {
            amount: item.default_amount,
            amount_unit: item.default_amount_unit,
            item_name: item.default_item
          })
        }));
        
        const response = await fetch(`${config.apiUrl}/api/schedule/complete/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
          setScheduleData(prev => ({
            ...prev,
            [key]: prev[key].map(i => {
              const wasCompleted = items.some(
                inc => inc.schedule_id === i.schedule_id && inc.scheduled_time === i.scheduled_time
              );
              return wasCompleted ? { ...i, completed: true } : i;
            })
          }));
          setShowCompleteModal(false);
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
            notes: completeFormData.notes || null,
            completed_at: localDateTimeToUTC(completeFormData.completed_at),
            early_override: itemIsOffWindow(item),
            // Include type-specific data
            ...(type === 'medication' && {
              dose_amount: completeFormData.dose_amount,
              dose_unit: completeFormData.dose_unit
            }),
            ...(type === 'nutrition' && {
              amount: completeFormData.amount,
              amount_unit: completeFormData.amount_unit,
              item_name: completeFormData.item_name
            })
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            const key = type === 'medication' ? 'medications' : 
                       type === 'nutrition' ? 'nutrition' : 'care_tasks';
            setScheduleData(prev => ({
              ...prev,
              [key]: prev[key].map(i => 
                i.schedule_id === item.schedule_id && i.scheduled_time === item.scheduled_time
                  ? { ...i, completed: true }
                  : i
              )
            }));
            setShowCompleteModal(false);
          }
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

  const handleCompleteHour = (hour, type) => {
    openCompleteHourModal(hour, type);
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
          color: t.category_color || '#a371f7',
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
  // completed items sink to the bottom. Inside each group, keep the scheduled
  // minute order so timing within the hour stays readable.
  const getItemsByHour = (items) => {
    const byHour = {};
    for (let h = 0; h < 24; h++) {
      byHour[h] = [];
    }
    items.forEach(item => {
      if (byHour[item.hour] !== undefined) {
        byHour[item.hour].push(item);
      }
    });
    Object.values(byHour).forEach(group => {
      group.sort((a, b) => {
        if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
        return (a.minute ?? 0) - (b.minute ?? 0);
      });
    });
    return byHour;
  };

  const medicationsByHour = getItemsByHour(scheduleData.medications);
  const nutritionByHour = getItemsByHour(scheduleData.nutrition);
  const careTasksByHour = getItemsByHour(scheduleData.care_tasks);

  // Format hour for display
  const formatHour = (hour) => {
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

  // For the time chip on each row: when an item has been completed, show the
  // actual administered/completed time (local); otherwise show the scheduled
  // time. Items still bucket into their scheduled hour either way (item.hour
  // drives getItemsByHour above).
  const itemDisplayTime = (item) => {
    const scheduledText = `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`;
    if (!item.completed || !item.completed_at) {
      return { text: scheduledText, title: undefined };
    }
    const raw = item.completed_at;
    const utc = raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z';
    const d = new Date(utc);
    if (isNaN(d.getTime())) {
      return { text: scheduledText, title: undefined };
    }
    const completedText = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return {
      text: completedText,
      title: `Given at ${completedText} (scheduled ${scheduledText})`,
    };
  };

  // Count totals for summary
  const totalMeds = scheduleData.medications.length;
  const completedMeds = scheduleData.medications.filter(m => m.completed).length;
  const totalNutrition = scheduleData.nutrition.length;
  const completedNutrition = scheduleData.nutrition.filter(n => n.completed).length;
  const totalTasks = scheduleData.care_tasks.length;
  const completedTasks = scheduleData.care_tasks.filter(t => t.completed).length;

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {error && (
              <div className="admin-v2-error-banner">{error}</div>
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
                value={formatDateForApi(selectedDate)}
                onChange={(e) => setSelectedDate(new Date(e.target.value + 'T00:00:00'))}
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

            {/* Summary Stats - on mobile: compact cards side-by-side, act as tab selector (no separate tab bar) */}
            <div className="admin-v2-summary-stats admin-v2-schedule-stats" style={{ marginBottom: '1.5rem' }}>
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
            </div>

            {/* Schedule Grid - which column(s) show is controlled by mobileTab (cards above are the selector) */}
            <div className={`admin-v2-schedule-container mobile-tab-${mobileTab}`}>
              {loading ? (
                <div className="admin-v2-loading">Loading schedule...</div>
              ) : (
                <>
                  {/* Column Headers - long labels for desktop, short for mobile */}
                  <div className="admin-v2-schedule-header">
                    <div className="admin-v2-schedule-time-col">Time</div>
                    <div className="admin-v2-schedule-col medications">
                      <MedicationsIcon size={16} />
                      <span className="admin-v2-schedule-col-long">Medications</span>
                      <span className="admin-v2-schedule-col-short">Meds</span>
                    </div>
                    <div className="admin-v2-schedule-col nutrition">
                      <NutritionIcon size={16} />
                      <span className="admin-v2-schedule-col-long">Nutrition</span>
                      <span className="admin-v2-schedule-col-short">Nutrition</span>
                    </div>
                    <div className="admin-v2-schedule-col tasks">
                      <TasksIcon size={16} />
                      <span className="admin-v2-schedule-col-long">Care Tasks</span>
                      <span className="admin-v2-schedule-col-short">Tasks</span>
                    </div>
                  </div>

                  {/* Scrollable Hour Rows */}
                  <div className="admin-v2-schedule-body" ref={scrollContainerRef}>
                    {[...Array(24)].map((_, hour) => (
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
                        <div
                          className="admin-v2-schedule-col medications admin-v2-schedule-col-clickable"
                          onClick={() => openPrnModal('medication', hour)}
                          role="button"
                          tabIndex={0}
                          title="Log PRN medication"
                        >
                          {medicationsByHour[hour]?.length > 0 && (
                            <div className="admin-v2-schedule-group medication">
                              {medicationsByHour[hour].some(m => !m.completed) && (
                                <button
                                  className="admin-v2-schedule-complete-all"
                                  onClick={(e) => { e.stopPropagation(); handleCompleteHour(hour, 'medication'); }}
                                  disabled={completing[`hour-${hour}-medication`]}
                                  title="Complete all medications this hour"
                                >
                                  {completing[`hour-${hour}-medication`] ? '...' : <CheckIcon size={12} />}
                                </button>
                              )}
                              {medicationsByHour[hour].map((med, idx) => {
                                // PRN doses have no schedule_id; key off log_id instead.
                                const rowId = med.schedule_id ?? `prn-${med.log_id}`;
                                const itemKey = `medication-${rowId}-${med.scheduled_time}`;
                                const isPrn = !!med.is_prn;
                                return (
                                  <React.Fragment key={`med-${rowId}-${idx}`}>
                                    {idx > 0 && <div className="admin-v2-schedule-divider" />}
                                    <div
                                      className={`admin-v2-schedule-item ${med.completed ? 'completed' : 'clickable'} ${completing[itemKey] ? 'completing' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); if (!med.completed) handleCompleteItem('medication', med); }}
                                      role="button"
                                      tabIndex={med.completed || isPrn ? -1 : 0}
                                      title={isPrn ? 'PRN dose — administered ad-hoc' : undefined}
                                    >
                                      <div className="admin-v2-schedule-item-header">
                                        {(() => {
                                          const t = itemDisplayTime(med);
                                          return (
                                            <span className="admin-v2-schedule-item-time" title={t.title}>
                                              <ClockIcon size={12} />
                                              {t.text}
                                            </span>
                                          );
                                        })()}
                                        <span className="admin-v2-schedule-item-name">{med.name}</span>
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
                                        <span className={`admin-v2-schedule-item-check ${med.completed ? 'checked' : ''}`}>
                                          {completing[itemKey] ? '...' : <CheckIcon size={14} />}
                                        </span>
                                      </div>
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                              {/* Explicit PRN tap target — the column itself is clickable,
                                  but when items fill the cell there's no white space to hit
                                  on touch devices. */}
                              <div className="admin-v2-schedule-divider" />
                              <button
                                type="button"
                                className="admin-v2-schedule-prn-add"
                                onClick={(e) => { e.stopPropagation(); openPrnModal('medication', hour); }}
                                title="Log PRN medication"
                              >
                                + PRN
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Nutrition Column */}
                        <div
                          className="admin-v2-schedule-col nutrition admin-v2-schedule-col-clickable"
                          onClick={() => openPrnModal('nutrition', hour)}
                          role="button"
                          tabIndex={0}
                          title="Log intake or output"
                        >
                          {nutritionByHour[hour]?.length > 0 && (
                            <div className="admin-v2-schedule-group nutrition">
                              {nutritionByHour[hour].some(n => !n.completed) && (
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
                                const rowId = item.schedule_id ?? `prn-${item.intake_type || 'intake'}-${item.log_id}`;
                                const itemKey = `nutrition-${rowId}-${item.scheduled_time}`;
                                const isPrn = !!item.is_prn;
                                const isOutput = item.intake_type === 'output';
                                return (
                                  <React.Fragment key={`nutr-${rowId}-${idx}`}>
                                    {idx > 0 && <div className="admin-v2-schedule-divider" />}
                                    <div
                                      className={`admin-v2-schedule-item ${item.completed ? 'completed' : 'clickable'} ${completing[itemKey] ? 'completing' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); if (!item.completed && !isPrn) handleCompleteItem('nutrition', item); }}
                                      role="button"
                                      tabIndex={item.completed || isPrn ? -1 : 0}
                                      title={isPrn ? (isOutput ? 'Output logged ad-hoc' : 'Intake logged ad-hoc') : undefined}
                                    >
                                      <div className="admin-v2-schedule-item-header">
                                        {(() => {
                                          const t = itemDisplayTime(item);
                                          return (
                                            <span className="admin-v2-schedule-item-time" title={t.title}>
                                              <ClockIcon size={12} />
                                              {t.text}
                                            </span>
                                          );
                                        })()}
                                        <span className="admin-v2-schedule-item-name">{item.name}</span>
                                        {isPrn && (
                                          <span
                                            className={`admin-v2-badge admin-v2-badge-prn admin-v2-badge-prn-${isOutput ? 'out' : 'in'}`}
                                            title={isOutput ? 'Output (PRN)' : 'Intake (PRN)'}
                                          >
                                            {isOutput ? 'PRN Out' : 'PRN In'}
                                          </span>
                                        )}
                                        {(item.default_amount || item.default_item) && (
                                          <span className="admin-v2-schedule-item-dose">
                                            {item.default_item && <span>{item.default_item}</span>}
                                            {item.default_amount && (
                                              <span> {item.default_amount} {item.default_amount_unit || ''}</span>
                                            )}
                                          </span>
                                        )}
                                        <span className={`admin-v2-schedule-item-check ${item.completed ? 'checked' : ''}`}>
                                          {completing[itemKey] ? '...' : <CheckIcon size={14} />}
                                        </span>
                                      </div>
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                              {/* Explicit PRN tap target — mirrors the meds column. */}
                              <div className="admin-v2-schedule-divider" />
                              <button
                                type="button"
                                className="admin-v2-schedule-prn-add"
                                onClick={(e) => { e.stopPropagation(); openPrnModal('nutrition', hour); }}
                                title="Log PRN intake or output"
                              >
                                + PRN
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Care Tasks Column */}
                        <div
                          className="admin-v2-schedule-col tasks admin-v2-schedule-col-clickable"
                          onClick={() => openPrnModal('care-task', hour)}
                          role="button"
                          tabIndex={0}
                          title="Log ad-hoc care task"
                        >
                          {careTasksByHour[hour]?.length > 0 && (
                            <div className="admin-v2-schedule-group care-task">
                              {careTasksByHour[hour].some(t => !t.completed) && (
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
                                const itemKey = `care-task-${task.schedule_id}-${task.scheduled_time}`;
                                return (
                                  <React.Fragment key={`task-${task.schedule_id}-${idx}`}>
                                    {idx > 0 && (
                                      <div
                                        className="admin-v2-schedule-divider"
                                        style={task.category_color !== careTasksByHour[hour][idx-1]?.category_color ? {
                                          height: '2px',
                                          background: `linear-gradient(to right, ${careTasksByHour[hour][idx-1]?.category_color || '#a371f7'}, ${task.category_color || '#a371f7'})`
                                        } : {}}
                                      />
                                    )}
                                    <div
                                      className={`admin-v2-schedule-item ${task.completed ? 'completed' : 'clickable'} ${completing[itemKey] ? 'completing' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); if (!task.completed) handleCompleteItem('care-task', task); }}
                                      role="button"
                                      tabIndex={task.completed ? -1 : 0}
                                      style={task.category_color ? { borderLeft: `3px solid ${task.category_color}` } : {}}
                                    >
                                      <div className="admin-v2-schedule-item-header">
                                        {(() => {
                                          const t = itemDisplayTime(task);
                                          return (
                                            <span className="admin-v2-schedule-item-time" title={t.title}>
                                              <ClockIcon size={12} />
                                              {t.text}
                                            </span>
                                          );
                                        })()}
                                        <span className="admin-v2-schedule-item-name">{task.name}</span>
                                        {task.category_name && (
                                          <span 
                                            className="admin-v2-schedule-item-category"
                                            style={task.category_color ? { backgroundColor: task.category_color + '20', color: task.category_color } : {}}
                                          >
                                            {task.category_name}
                                          </span>
                                        )}
                                        <span className={`admin-v2-schedule-item-check ${task.completed ? 'checked' : ''}`}>
                                          {completing[itemKey] ? '...' : <CheckIcon size={14} />}
                                        </span>
                                      </div>
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                              {/* Explicit PRN tap target — mirrors meds/nutrition columns. */}
                              <div className="admin-v2-schedule-divider" />
                              <button
                                type="button"
                                className="admin-v2-schedule-prn-add"
                                onClick={(e) => { e.stopPropagation(); openPrnModal('care-task', hour); }}
                                title="Log ad-hoc care task"
                              >
                                + PRN
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="schedule-select-patient">
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their daily schedule</p>
            <button 
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={() => setShowPatientModal(true)}
            >
              Select Patient
            </button>
          </div>
        )}

        {/* Patient Selection Modal */}
        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}

        {/* Completion Confirmation Modal */}
        {showCompleteModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCompleteModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>
                  {completeModalData.isBulk 
                    ? `Complete ${completeModalData.items.length} ${completeModalData.type === 'medication' ? 'Medication' : completeModalData.type === 'nutrition' ? 'Nutrition' : 'Care Task'}${completeModalData.items.length > 1 ? 's' : ''}`
                    : `Complete ${completeModalData.type === 'medication' ? 'Medication' : completeModalData.type === 'nutrition' ? 'Nutrition' : 'Care Task'}`
                  }
                </h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCompleteModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              
              <div className="admin-v2-modal-body">
                {/* Item Summary */}
                <div style={{ 
                  background: '#21262d', 
                  borderRadius: '6px', 
                  padding: '1rem', 
                  marginBottom: '1.5rem' 
                }}>
                  {completeModalData.items.map((item, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: idx > 0 ? '0.5rem 0 0' : 0,
                      borderTop: idx > 0 ? '1px solid #30363d' : 'none',
                      marginTop: idx > 0 ? '0.5rem' : 0
                    }}>
                      <span style={{ fontWeight: 500, color: '#e6edf3' }}>{item.name}</span>
                      <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>
                        Scheduled: {String(item.hour).padStart(2, '0')}:{String(item.minute).padStart(2, '0')}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Completion Time */}
                <div className="admin-v2-form-group">
                  <label>Completed At *</label>
                  <input
                    type="datetime-local"
                    value={completeFormData.completed_at}
                    onChange={e => setCompleteFormData({...completeFormData, completed_at: e.target.value})}
                    style={{ width: '100%' }}
                  />
                  <small style={{ color: '#8b949e' }}>Adjust if completed at a different time</small>
                </div>

                {/* Medication-specific fields */}
                {completeModalData.type === 'medication' && !completeModalData.isBulk && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="admin-v2-form-group">
                      <label>Dose Amount</label>
                      <input
                        type="number"
                        step="0.1"
                        value={completeFormData.dose_amount}
                        onChange={e => setCompleteFormData({...completeFormData, dose_amount: e.target.value})}
                        placeholder="Amount given"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Unit</label>
                      <input
                        type="text"
                        value={completeFormData.dose_unit}
                        onChange={e => setCompleteFormData({...completeFormData, dose_unit: e.target.value})}
                        placeholder="mg, ml, tablets..."
                      />
                    </div>
                  </div>
                )}

                {/* Nutrition-specific fields */}
                {completeModalData.type === 'nutrition' && !completeModalData.isBulk && (
                  <>
                    <div className="admin-v2-form-group">
                      <label>Item Name</label>
                      <input
                        type="text"
                        value={completeFormData.item_name}
                        onChange={e => setCompleteFormData({...completeFormData, item_name: e.target.value})}
                        placeholder="What was consumed?"
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="admin-v2-form-group">
                        <label>Amount</label>
                        <input
                          type="number"
                          step="0.1"
                          value={completeFormData.amount}
                          onChange={e => setCompleteFormData({...completeFormData, amount: e.target.value})}
                          placeholder="Amount"
                        />
                      </div>
                      <div className="admin-v2-form-group">
                        <label>Unit</label>
                        <select
                          value={completeFormData.amount_unit}
                          onChange={e => setCompleteFormData({...completeFormData, amount_unit: e.target.value})}
                        >
                          <option value="">Select...</option>
                          <option value="ml">ml</option>
                          <option value="oz">oz</option>
                          <option value="cups">cups</option>
                          <option value="grams">grams</option>
                          <option value="servings">servings</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {/* Notes */}
                <div className="admin-v2-form-group">
                  <label>Notes (optional)</label>
                  <textarea
                    value={completeFormData.notes}
                    onChange={e => setCompleteFormData({...completeFormData, notes: e.target.value})}
                    placeholder="Any additional notes..."
                    rows={2}
                  />
                </div>

                {/* Off-window (early or late) administration warning */}
                {(() => {
                  const completedAtUtc = completeFormData.completed_at
                    ? localDateTimeToUTC(completeFormData.completed_at)
                    : null;
                  const checks = completeModalData.items.map(item => ({
                    item,
                    check: checkAdministrationWindow(item.scheduled_time, completedAtUtc),
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
                        <div style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                          {group.length === 1
                            ? `You are about to log this ${typeLabel} more than 1 hour ${direction} its scheduled time.`
                            : `${group.length} items are being logged more than 1 hour ${direction} their scheduled time.`}
                          {' '}Giving a {typeLabel} {kind} can be unsafe. Confirm this is intentional before continuing.
                        </div>
                        <ul style={{ margin: '0 0 0.5rem', paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#c9d1d9' }}>
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
                    <div
                      role="alert"
                      style={{
                        background: 'rgba(187, 128, 9, 0.15)',
                        border: '1px solid rgba(187, 128, 9, 0.6)',
                        borderRadius: 6,
                        padding: '0.75rem 1rem',
                        marginTop: '0.5rem',
                        color: '#e6edf3'
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#f0883e', marginBottom: '0.35rem' }}>
                        {headerText}
                      </div>
                      {renderGroup(earlyItems, 'early')}
                      {renderGroup(lateItems, 'late')}
                    </div>
                  );
                })()}
              </div>

              <div className="admin-v2-modal-footer">
                <button
                  type="button"
                  className="admin-v2-btn"
                  onClick={() => setShowCompleteModal(false)}
                >
                  Cancel
                </button>
                {(() => {
                  const completedAtUtc = completeFormData.completed_at
                    ? localDateTimeToUTC(completeFormData.completed_at)
                    : null;
                  const statuses = completeModalData.items.map(
                    item => checkAdministrationWindow(item.scheduled_time, completedAtUtc).status
                  );
                  const hasEarly = statuses.some(s => s === 'early');
                  const hasLate = statuses.some(s => s === 'late');
                  const isOffWindow = hasEarly || hasLate;
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
                      className={`admin-v2-btn ${isOffWindow ? 'admin-v2-btn-warning' : 'admin-v2-btn-primary'}`}
                      onClick={handleSubmitCompletion}
                      disabled={saving}
                      style={isOffWindow ? { background: '#bb8009', borderColor: '#bb8009', color: '#0d1117' } : undefined}
                    >
                      {label}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* PRN / Quick-log modal */}
        {prnModal.open && (
          <div className="admin-v2-modal-overlay" onClick={closePrnModal}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>
                  {prnModal.type === 'medication' && 'Log PRN Medication'}
                  {prnModal.type === 'nutrition' && 'Log Nutrition'}
                  {prnModal.type === 'care-task' && 'Log Care Task'}
                  {prnModal.hour != null && (
                    <span style={{ color: '#8b949e', fontWeight: 400, marginLeft: '0.5rem', fontSize: '0.9rem' }}>
                      — {formatHour(prnModal.hour)}
                    </span>
                  )}
                </h2>
                <button className="admin-v2-modal-close" onClick={closePrnModal}>
                  <XIcon size={20} />
                </button>
              </div>

              <div className="admin-v2-modal-body">
                {prnError && <div className="admin-v2-error-banner" style={{ marginBottom: '1rem' }}>{prnError}</div>}

                {/* ───────────── Medication ───────────── */}
                {prnModal.type === 'medication' && prnModal.mode === 'pick' && (
                  <>
                    {prnMedsLoading ? (
                      <div className="admin-v2-loading">Loading PRN medications...</div>
                    ) : prnMeds.length === 0 ? (
                      <div className="admin-v2-empty-state">
                        <p>No PRN (as-needed) medications for this patient.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {prnMeds.map(med => (
                          <button
                            key={med.id}
                            type="button"
                            className="admin-v2-btn"
                            onClick={() => pickPrnMed(med)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.75rem 1rem',
                              textAlign: 'left',
                              background: '#21262d',
                              border: '1px solid #30363d',
                            }}
                          >
                            <span style={{ display: 'flex', flexDirection: 'column' }}>
                              <strong style={{ color: '#e6edf3' }}>{med.name}</strong>
                              <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>
                                {med.concentration ? `${med.concentration} • ` : ''}
                                Last given: {med.last_administered
                                  ? new Date(med.last_administered).toLocaleString(undefined, {
                                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                                    })
                                  : 'never'}
                              </span>
                            </span>
                            <span className="admin-v2-badge admin-v2-badge-primary">Give</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                
                {/* ───────────── Nutrition ───────────── */}
                {prnModal.type === 'nutrition' && prnModal.mode === 'pick' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <button
                      type="button"
                      className="admin-v2-btn admin-v2-btn-primary"
                      onClick={() => { closePrnModal(); setShowPrnIntakeModal(true); }}
                      style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <NutritionIcon size={24} />
                      <span>Log Intake</span>
                    </button>
                    <button
                      type="button"
                      className="admin-v2-btn"
                      onClick={() => { closePrnModal(); setShowPrnOutputModal(true); }}
                      style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <NutritionIcon size={24} />
                      <span>Log Output</span>
                    </button>
                  </div>
                )}

                
                
                {/* ───────────── Care tasks ───────────── */}
                {prnModal.type === 'care-task' && prnModal.mode === 'pick' && (
                  <>
                    {prnCareTasksLoading ? (
                      <div className="admin-v2-loading">Loading care tasks...</div>
                    ) : prnCareTasks.length === 0 ? (
                      <div className="admin-v2-empty-state">
                        <TasksIcon size={48} />
                        <p className="admin-v2-text-muted">No active care tasks for this patient.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {groupCareTasksByCategory(prnCareTasks).map(group => (
                          <div key={group.id ?? 'uncat'}>
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              marginBottom: 6,
                              fontSize: '0.8rem', fontWeight: 700,
                              color: group.color, textTransform: 'uppercase', letterSpacing: 0.5,
                            }}>
                              <span style={{
                                width: 10, height: 10, borderRadius: '50%',
                                backgroundColor: group.color,
                              }} />
                              {group.name}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {group.tasks.map(task => (
                                <button
                                  key={task.id}
                                  type="button"
                                  className="admin-v2-btn"
                                  onClick={() => pickPrnCareTask(task)}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.75rem 1rem',
                                    textAlign: 'left',
                                    background: '#21262d',
                                    border: '1px solid #30363d',
                                    borderLeft: `4px solid ${group.color}`,
                                  }}
                                >
                                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    <strong style={{ color: '#e6edf3' }}>{task.name}</strong>
                                    {task.description && (
                                      <span style={{ color: '#8b949e', fontSize: '0.8rem', lineHeight: 1.3 }}>
                                        {task.description}
                                      </span>
                                    )}
                                  </span>
                                  <span className="admin-v2-badge admin-v2-badge-primary" style={{ flexShrink: 0, marginLeft: 8 }}>
                                    Log
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="admin-v2-modal-footer">
                {prnModal.mode === 'pick' && (
                  <button type="button" className="admin-v2-btn" onClick={closePrnModal}>
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Shared sub-modals launched from the PRN flow */}
        <IntakeModal
          open={showPrnIntakeModal}
          onClose={() => setShowPrnIntakeModal(false)}
          onSaved={fetchSchedule}
          patient={selectedPatient}
          defaultDateTime={prnNutritionDefaultDt}
        />
        <OutputModal
          open={showPrnOutputModal}
          onClose={() => setShowPrnOutputModal(false)}
          onSaved={fetchSchedule}
          patient={selectedPatient}
          defaultDateTime={prnNutritionDefaultDt}
        />
        <MedicationDoseModal
          open={showDoseModal}
          onClose={() => { setShowDoseModal(false); setDoseModalMed(null); }}
          onSaved={fetchSchedule}
          patient={selectedPatient}
          medication={doseModalMed}
          defaultDateTime={doseModalDefaultDt}
        />
        <CareTaskCompleteModal
          open={showCareTaskCompleteModal}
          onClose={() => { setShowCareTaskCompleteModal(false); setCareTaskModalTask(null); }}
          onSaved={fetchSchedule}
          patient={selectedPatient}
          task={careTaskModalTask}
          defaultDateTime={careTaskModalDefaultDt}
        />
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Schedule;
