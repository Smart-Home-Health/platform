/*
 * Smart Home Health Hub
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
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal, IntakeModal, OutputModal, MedicationDoseModal, UpdateQuantityModal, CareTaskCompleteModal } from './components';
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
import { getCurrentLocalDateTime, localDateTimeToUTC, checkAdministrationWindow, formatDurationMinutes } from '../../utils/timezone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Field, FormRow } from '@/components/ui/field';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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

        if (await maybeGateOnQuantity(response)) return;

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

        if (await maybeGateOnQuantity(response)) return;

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
        await fetchSchedule();
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

  // Count totals for summary. These are scheduled-adherence ratios, so PRN /
  // ad-hoc entries (is_prn) are excluded — they still render on the timeline,
  // but they're extra care, not part of "X of Y scheduled items done".
  const totalMeds = scheduleData.medications.filter(m => !m.is_prn).length;
  const completedMeds = scheduleData.medications.filter(m => !m.is_prn && m.completed).length;
  const totalNutrition = scheduleData.nutrition.filter(n => !n.is_prn).length;
  const completedNutrition = scheduleData.nutrition.filter(n => !n.is_prn && n.completed).length;
  const totalTasks = scheduleData.care_tasks.filter(t => !t.is_prn).length;
  const completedTasks = scheduleData.care_tasks.filter(t => !t.is_prn && t.completed).length;

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {error && (
              <div className="tw" style={{ marginBottom: '1rem' }}>
                <Alert variant="destructive">{error}</Alert>
              </div>
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
                                        {med.completed && med.log_id ? (
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
                                        {item.completed && item.log_id ? (
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
                                // PRN completions have no schedule_id; key off log_id instead.
                                const rowId = task.schedule_id ?? `prn-${task.log_id}`;
                                const itemKey = `care-task-${rowId}-${task.scheduled_time}`;
                                const isPrn = !!task.is_prn;
                                return (
                                  <React.Fragment key={`task-${rowId}-${idx}`}>
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
                                      tabIndex={task.completed || isPrn ? -1 : 0}
                                      title={isPrn ? 'PRN care task — completed ad-hoc' : undefined}
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
                                        {task.completed && task.log_id ? (
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
            <div className="tw">
              <Button onClick={() => setShowPatientModal(true)}>
                Select Patient
              </Button>
            </div>
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

        {/* Completion Confirmation Dialog */}
        <Dialog open={showCompleteModal} onOpenChange={(o) => { if (!o) setShowCompleteModal(false); }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[480px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>
                {completeModalData.isBulk
                  ? `Complete ${completeModalData.items.length} ${completeModalData.type === 'medication' ? 'Medication' : completeModalData.type === 'nutrition' ? 'Nutrition' : 'Care Task'}${completeModalData.items.length > 1 ? 's' : ''}`
                  : `Complete ${completeModalData.type === 'medication' ? 'Medication' : completeModalData.type === 'nutrition' ? 'Nutrition' : 'Care Task'}`
                }
              </DialogTitle>
            </DialogHeader>

            {/* Item Summary */}
            <div className="rounded-md bg-secondary p-4">
              {completeModalData.items.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between ${idx > 0 ? 'mt-2 border-t border-border pt-2' : ''}`}
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-sm text-muted-foreground">
                    Scheduled: {String(item.hour).padStart(2, '0')}:{String(item.minute).padStart(2, '0')}
                  </span>
                </div>
              ))}
            </div>

            {/* Completion Time */}
            <Field label="Completed At" required hint="Adjust if completed at a different time">
              <Input
                type="datetime-local"
                value={completeFormData.completed_at}
                onChange={e => setCompleteFormData({...completeFormData, completed_at: e.target.value})}
              />
            </Field>

            {/* Medication-specific fields */}
            {completeModalData.type === 'medication' && !completeModalData.isBulk && (
              <Field label="Dose Amount">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    value={completeFormData.dose_amount}
                    onChange={e => setCompleteFormData({...completeFormData, dose_amount: e.target.value})}
                    placeholder="Amount given"
                    className="flex-1"
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {completeFormData.dose_unit || 'units'}
                  </span>
                </div>
              </Field>
            )}

            {/* Nutrition-specific fields */}
            {completeModalData.type === 'nutrition' && !completeModalData.isBulk && (
              <>
                <Field label="Item Name">
                  <Input
                    type="text"
                    value={completeFormData.item_name}
                    onChange={e => setCompleteFormData({...completeFormData, item_name: e.target.value})}
                    placeholder="What was consumed?"
                  />
                </Field>
                <FormRow>
                  <Field label="Amount">
                    <Input
                      type="number"
                      step="0.1"
                      value={completeFormData.amount}
                      onChange={e => setCompleteFormData({...completeFormData, amount: e.target.value})}
                      placeholder="Amount"
                    />
                  </Field>
                  <Field label="Unit">
                    <Select
                      value={completeFormData.amount_unit || undefined}
                      onValueChange={v => setCompleteFormData({...completeFormData, amount_unit: v})}
                    >
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ml">ml</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="cups">cups</SelectItem>
                        <SelectItem value="grams">grams</SelectItem>
                        <SelectItem value="servings">servings</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </FormRow>
              </>
            )}

            {/* Notes */}
            <Field label="Notes (optional)">
              <Textarea
                value={completeFormData.notes}
                onChange={e => setCompleteFormData({...completeFormData, notes: e.target.value})}
                placeholder="Any additional notes..."
                rows={2}
              />
            </Field>

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
                    <div className="mb-1.5">
                      {group.length === 1
                        ? `You are about to log this ${typeLabel} more than 1 hour ${direction} its scheduled time.`
                        : `${group.length} items are being logged more than 1 hour ${direction} their scheduled time.`}
                      {' '}Giving a {typeLabel} {kind} can be unsafe. Confirm this is intentional before continuing.
                    </div>
                    <ul className="mb-2 list-disc pl-5 text-xs">
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
                <Alert variant="warning">
                  <AlertTitle className="text-[#f0883e]">{headerText}</AlertTitle>
                  <AlertDescription>
                    {renderGroup(earlyItems, 'early')}
                    {renderGroup(lateItems, 'late')}
                  </AlertDescription>
                </Alert>
              );
            })()}

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCompleteModal(false)}
              >
                Cancel
              </Button>
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
                  <Button
                    type="button"
                    onClick={handleSubmitCompletion}
                    disabled={saving}
                    className={isOffWindow ? 'bg-[#bb8009] text-[var(--background)] hover:bg-[#bb8009]/90' : undefined}
                  >
                    {label}
                  </Button>
                );
              })()}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PRN / Quick-log Dialog */}
        <Dialog open={prnModal.open} onOpenChange={(o) => { if (!o) closePrnModal(); }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[480px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>
                {prnModal.type === 'medication' && 'Log PRN Medication'}
                {prnModal.type === 'nutrition' && 'Log Nutrition'}
                {prnModal.type === 'care-task' && 'Log Care Task'}
                {prnModal.hour != null && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    — {formatHour(prnModal.hour)}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            {prnError && <Alert variant="destructive">{prnError}</Alert>}

            {/* ───────────── Medication ───────────── */}
            {prnModal.type === 'medication' && prnModal.mode === 'pick' && (
              prnMedsLoading ? (
                <p className="text-sm text-muted-foreground">Loading PRN medications...</p>
              ) : prnMeds.length === 0 ? (
                <p className="py-2 text-center text-muted-foreground">
                  No PRN (as-needed) medications for this patient.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {prnMeds.map(med => (
                    <Button
                      key={med.id}
                      type="button"
                      variant="secondary"
                      className="h-auto w-full justify-between whitespace-normal px-4 py-3 text-left"
                      onClick={() => pickPrnMed(med)}
                    >
                      <span className="flex min-w-0 flex-col">
                        <strong>{med.name}</strong>
                        <span className="text-xs font-normal text-muted-foreground">
                          {med.concentration ? `${med.concentration} • ` : ''}
                          Last given: {med.last_administered
                            ? new Date(med.last_administered).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                              })
                            : 'never'}
                        </span>
                      </span>
                      <Badge className="ml-2 shrink-0">Give</Badge>
                    </Button>
                  ))}
                </div>
              )
            )}

            {/* ───────────── Nutrition ───────────── */}
            {prnModal.type === 'nutrition' && prnModal.mode === 'pick' && (
              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  className="h-auto flex-col gap-2 py-6"
                  onClick={() => { closePrnModal(); setShowPrnIntakeModal(true); }}
                >
                  <NutritionIcon size={24} />
                  <span>Log Intake</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-auto flex-col gap-2 py-6"
                  onClick={() => { closePrnModal(); setShowPrnOutputModal(true); }}
                >
                  <NutritionIcon size={24} />
                  <span>Log Output</span>
                </Button>
              </div>
            )}

            {/* ───────────── Care tasks ───────────── */}
            {prnModal.type === 'care-task' && prnModal.mode === 'pick' && (
              prnCareTasksLoading ? (
                <p className="text-sm text-muted-foreground">Loading care tasks...</p>
              ) : prnCareTasks.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
                  <TasksIcon size={48} />
                  <p>No active care tasks for this patient.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {groupCareTasksByCategory(prnCareTasks).map(group => (
                    <div key={group.id ?? 'uncat'}>
                      <div
                        className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide"
                        style={{ color: group.color }}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: group.color }}
                        />
                        {group.name}
                      </div>
                      <div className="flex flex-col gap-2">
                        {group.tasks.map(task => (
                          <Button
                            key={task.id}
                            type="button"
                            variant="secondary"
                            className="h-auto w-full justify-between whitespace-normal px-4 py-3 text-left"
                            style={{ borderLeft: `4px solid ${group.color}` }}
                            onClick={() => pickPrnCareTask(task)}
                          >
                            <span className="flex min-w-0 flex-col">
                              <strong>{task.name}</strong>
                              {task.description && (
                                <span className="text-xs font-normal leading-snug text-muted-foreground">
                                  {task.description}
                                </span>
                              )}
                            </span>
                            <Badge className="ml-2 shrink-0">Log</Badge>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closePrnModal}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
