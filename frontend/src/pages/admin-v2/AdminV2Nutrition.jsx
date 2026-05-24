import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientHeader, PatientSelectorModal, IntakeModal, OutputModal, NutritionOverview } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  NutritionIcon,
  ClockIcon,
  DropletIcon,
  FlameIcon,
  ToiletIcon,
  UrineIcon,
  BowelIcon,
  VomitIcon,
  NotesIcon,
  DiaperIcon,
  CatheterIcon,
  BloodIcon,
  MucusIcon,
  PainIcon,
  StrainingIcon,
  SizeSmearIcon,
  SizeSmallIcon,
  SizeMediumIcon,
  SizeLargeIcon,
  WetnessDryIcon,
  WetnessWetIcon,
  WetnessSoakedIcon,
  LeafIcon,
  BarChartIcon,
  LiquidIcon,
  FoodIcon,
  SupplementIcon,
  BreakfastIcon,
  LunchIcon,
  DinnerIcon,
  SnackIcon,
  TubeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
  CheckIcon,
  TargetIcon
} from '../../components/Icons';
import { localTimeToUTC, localTimeAndDaysToUTC, utcCronToLocalDaysAndTime, formatCronExpression, getCurrentLocalDateTime, localDateTimeToUTC, getLocalDateTimeString } from '../../utils/timezone';
import './AdminV2.css';

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
    if (path.includes('/nutrition/intake')) return 'intake';
    if (path.includes('/nutrition/output')) return 'output';
    if (path.includes('/nutrition/schedules')) return 'schedules';
    if (path.includes('/nutrition/goals')) return 'goals';
    return 'overview'; // default — /care/nutrition lands here
  };
  
  const activeTab = getActiveTabFromPath();
  
  // Loading/error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Data states
  const [intakes, setIntakes] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [goals, setGoals] = useState([]);
  const [currentGoal, setCurrentGoal] = useState(null);

  // Overview-tab state — single date the page is showing, plus that day's
  // intake + output records pulled from the daily endpoints.
  const [overviewDate, setOverviewDate] = useState(new Date());
  const [dailyIntakes, setDailyIntakes] = useState([]);
  const [dailyOutputs, setDailyOutputs] = useState([]);
  
  // Reference data
  const [outputTypes, setOutputTypes] = useState({});
  const [scheduleTypes, setScheduleTypes] = useState([]);
  
  // Modal states
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteType, setDeleteType] = useState(null);
  
  // Intake/output form state lives inside the shared modal components now.

  const [scheduleForm, setScheduleForm] = useState({
    schedule_type: 'meal',
    name: '',
    cron_expression: '',
    default_item_name: '',
    default_amount: '',
    default_amount_unit: 'ml',
    default_calories: '',
    is_active: true,
    create_care_task: true,
    reminder_minutes_before: 15,
    instructions: '',
    notes: ''
  });
  
  // Schedule time helpers
  const [scheduleMode, setScheduleMode] = useState('weekly');
  const [selectedDays, setSelectedDays] = useState([]);
  const [selectedDayOfMonth, setSelectedDayOfMonth] = useState(1);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const [goalForm, setGoalForm] = useState({
    water_ml_target: '',
    total_fluid_ml_target: '',
    calories_target: '',
    calories_min: '',
    calories_max: '',
    protein_grams_target: '',
    carbs_grams_target: '',
    fat_grams_target: '',
    fiber_grams_target: '',
    sodium_mg_max: '',
    urine_output_ml_min: '',
    bowel_movements_target: '',
    effective_date: new Date().toISOString().split('T')[0],
    notes: ''
  });
  
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
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient) {
      setSearchParams({ patient: contextPatient.id.toString() });
    }
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
      } else if (activeTab === 'intake') {
        const response = await fetch(
          `${config.apiUrl}/api/patients/${selectedPatient.id}/nutrition-intake`,
          { credentials: 'include' }
        );
        if (response.ok) {
          setIntakes(await response.json());
        }
      } else if (activeTab === 'output') {
        const response = await fetch(
          `${config.apiUrl}/api/nutrition/outputs/patient/${selectedPatient.id}?limit=100`,
          { credentials: 'include' }
        );
        if (response.ok) {
          setOutputs(await response.json());
        }
      } else if (activeTab === 'schedules') {
        const response = await fetch(
          `${config.apiUrl}/api/nutrition/schedules/patient/${selectedPatient.id}?active_only=false`,
          { credentials: 'include' }
        );
        if (response.ok) {
          setSchedules(await response.json());
        }
      } else if (activeTab === 'goals') {
        const [goalsRes, currentRes] = await Promise.all([
          fetch(`${config.apiUrl}/api/nutrition/goals/patient/${selectedPatient.id}?active_only=false`, { credentials: 'include' }),
          fetch(`${config.apiUrl}/api/nutrition/goals/patient/${selectedPatient.id}/current`, { credentials: 'include' })
        ]);
        if (goalsRes.ok) {
          setGoals(await goalsRes.json());
        }
        if (currentRes.ok) {
          const current = await currentRes.json();
          setCurrentGoal(current);
        }
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
  // SCHEDULE HANDLERS
  // ========================
  
  const openScheduleModal = (schedule = null) => {
    if (schedule) {
      setEditingItem(schedule);
      setScheduleForm({
        schedule_type: schedule.schedule_type || 'meal',
        name: schedule.name || '',
        cron_expression: schedule.cron_expression || '',
        default_item_name: schedule.default_item_name || '',
        default_amount: schedule.default_amount || '',
        default_amount_unit: schedule.default_amount_unit || 'ml',
        default_calories: schedule.default_calories || '',
        is_active: schedule.is_active !== false,
        create_care_task: schedule.create_care_task !== false,
        reminder_minutes_before: schedule.reminder_minutes_before || 15,
        instructions: schedule.instructions || '',
        notes: schedule.notes || ''
      });
      // Parse cron expression
      parseCronForEdit(schedule.cron_expression);
    } else {
      setEditingItem(null);
      setScheduleForm({
        schedule_type: 'meal',
        name: '',
        cron_expression: '',
        default_item_name: '',
        default_amount: '',
        default_amount_unit: 'ml',
        default_calories: '',
        is_active: true,
        create_care_task: true,
        reminder_minutes_before: 15,
        instructions: '',
        notes: ''
      });
      setScheduleMode('weekly');
      setSelectedDays([]);
      setScheduleTime('08:00');
    }
    setFormError(null);
    setShowScheduleModal(true);
  };

  const parseCronForEdit = (cronExpr) => {
    if (!cronExpr) return;
    const parts = cronExpr.split(' ');
    if (parts.length < 5) return;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    if (dayOfMonth !== '*') {
      // Cron times are stored in UTC; convert hour/minute to local for display.
      const utc = new Date();
      utc.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
      setScheduleTime(
        `${String(utc.getHours()).padStart(2, '0')}:${String(utc.getMinutes()).padStart(2, '0')}`
      );
      setScheduleMode('monthly');
      setSelectedDayOfMonth(parseInt(dayOfMonth) || 1);
    } else if (dayOfWeek !== '*') {
      // Shift UTC days back to local days so the day checkboxes match what the
      // user originally picked. utcCronToLocalDaysAndTime also returns the
      // local HH:MM derived from the UTC hour/minute.
      const utcDayList = dayOfWeek.split(',').map(d => parseInt(d, 10));
      const { time, days } = utcCronToLocalDaysAndTime(
        parseInt(hour, 10),
        parseInt(minute, 10),
        utcDayList,
      );
      setScheduleTime(time);
      setScheduleMode('weekly');
      setSelectedDays(days);
    } else {
      const utc = new Date();
      utc.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
      setScheduleTime(
        `${String(utc.getHours()).padStart(2, '0')}:${String(utc.getMinutes()).padStart(2, '0')}`
      );
      setScheduleMode('daily');
    }
  };

  const buildCronExpression = () => {
    if (scheduleMode === 'daily') {
      const utc = localTimeToUTC(scheduleTime);
      return `${utc.minute} ${utc.hour} * * *`;
    } else if (scheduleMode === 'weekly') {
      if (selectedDays.length === 0) return null;
      // Convert local time AND local days-of-week to UTC together — the cron's
      // day list must shift when the time conversion crosses midnight.
      const utc = localTimeAndDaysToUTC(scheduleTime, selectedDays);
      return `${utc.minute} ${utc.hour} * * ${utc.days.join(',')}`;
    } else if (scheduleMode === 'monthly') {
      const utc = localTimeToUTC(scheduleTime);
      return `${utc.minute} ${utc.hour} ${selectedDayOfMonth} * *`;
    }
    return null;
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;
    
    const cronExpr = editingItem ? scheduleForm.cron_expression : buildCronExpression();
    if (!cronExpr && !editingItem) {
      setFormError('Please select schedule timing');
      return;
    }
    
    setSaving(true);
    setFormError(null);
    
    try {
      const payload = {
        ...scheduleForm,
        patient_id: selectedPatient.id,
        cron_expression: cronExpr || scheduleForm.cron_expression,
        default_amount: scheduleForm.default_amount ? parseFloat(scheduleForm.default_amount) : null,
        default_calories: scheduleForm.default_calories ? parseFloat(scheduleForm.default_calories) : null
      };
      
      const url = editingItem
        ? `${config.apiUrl}/api/nutrition/schedules/${editingItem.id}`
        : `${config.apiUrl}/api/nutrition/schedules`;
      
      const response = await fetch(url, {
        method: editingItem ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to save schedule');
      }
      
      setShowScheduleModal(false);
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
  
  const openGoalModal = (goal = null) => {
    if (goal) {
      setEditingItem(goal);
      setGoalForm({
        water_ml_target: goal.water_ml_target || '',
        total_fluid_ml_target: goal.total_fluid_ml_target || '',
        calories_target: goal.calories_target || '',
        calories_min: goal.calories_min || '',
        calories_max: goal.calories_max || '',
        protein_grams_target: goal.protein_grams_target || '',
        carbs_grams_target: goal.carbs_grams_target || '',
        fat_grams_target: goal.fat_grams_target || '',
        fiber_grams_target: goal.fiber_grams_target || '',
        sodium_mg_max: goal.sodium_mg_max || '',
        urine_output_ml_min: goal.urine_output_ml_min || '',
        bowel_movements_target: goal.bowel_movements_target || '',
        effective_date: goal.effective_date ? goal.effective_date.split('T')[0] : new Date().toISOString().split('T')[0],
        notes: goal.notes || ''
      });
    } else {
      setEditingItem(null);
      setGoalForm({
        water_ml_target: '',
        total_fluid_ml_target: '',
        calories_target: '',
        calories_min: '',
        calories_max: '',
        protein_grams_target: '',
        carbs_grams_target: '',
        fat_grams_target: '',
        fiber_grams_target: '',
        sodium_mg_max: '',
        urine_output_ml_min: '',
        bowel_movements_target: '',
        effective_date: new Date().toISOString().split('T')[0],
        notes: ''
      });
    }
    setFormError(null);
    setShowGoalModal(true);
  };

  const handleSaveGoal = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;
    
    setSaving(true);
    setFormError(null);
    
    try {
      const payload = {
        patient_id: selectedPatient.id,
        water_ml_target: goalForm.water_ml_target ? parseFloat(goalForm.water_ml_target) : null,
        total_fluid_ml_target: goalForm.total_fluid_ml_target ? parseFloat(goalForm.total_fluid_ml_target) : null,
        calories_target: goalForm.calories_target ? parseFloat(goalForm.calories_target) : null,
        calories_min: goalForm.calories_min ? parseFloat(goalForm.calories_min) : null,
        calories_max: goalForm.calories_max ? parseFloat(goalForm.calories_max) : null,
        protein_grams_target: goalForm.protein_grams_target ? parseFloat(goalForm.protein_grams_target) : null,
        carbs_grams_target: goalForm.carbs_grams_target ? parseFloat(goalForm.carbs_grams_target) : null,
        fat_grams_target: goalForm.fat_grams_target ? parseFloat(goalForm.fat_grams_target) : null,
        fiber_grams_target: goalForm.fiber_grams_target ? parseFloat(goalForm.fiber_grams_target) : null,
        sodium_mg_max: goalForm.sodium_mg_max ? parseFloat(goalForm.sodium_mg_max) : null,
        urine_output_ml_min: goalForm.urine_output_ml_min ? parseFloat(goalForm.urine_output_ml_min) : null,
        bowel_movements_target: goalForm.bowel_movements_target ? parseInt(goalForm.bowel_movements_target) : null,
        effective_date: new Date(goalForm.effective_date).toISOString(),
        notes: goalForm.notes || null,
        is_active: true
      };
      
      const url = editingItem
        ? `${config.apiUrl}/api/nutrition/goals/${editingItem.id}`
        : `${config.apiUrl}/api/nutrition/goals`;
      
      const response = await fetch(url, {
        method: editingItem ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to save goal');
      }
      
      setShowGoalModal(false);
      fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ========================
  // DELETE HANDLERS
  // ========================
  
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
          url = `${config.apiUrl}/api/nutrition-intake/${deletingItem.id}`;
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
  const FLUID_ITEM_TYPES = new Set(['liquid', 'hydration']);
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

  // Calculate daily occurrences from cron expression
  const getDailyOccurrences = (cronExpr) => {
    if (!cronExpr) return 0;
    const parts = cronExpr.split(' ');
    if (parts.length < 5) return 0;
    
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    // Daily schedule (* * * * *) = 1 per day
    if (dayOfMonth === '*' && dayOfWeek === '*') {
      return 1;
    }
    // Specific days of week (e.g., 0,1,2,3,4,5,6)
    if (dayOfWeek !== '*') {
      const days = dayOfWeek.split(',').length;
      return days / 7; // Average per day
    }
    // Monthly schedule
    if (dayOfMonth !== '*') {
      return 1 / 30; // Average per day
    }
    return 1;
  };

  // Calculate scheduled totals for summary cards
  const getScheduledTotals = () => {
    const activeSchedules = schedules.filter(s => s.is_active);
    
    let totalWaterMl = 0;
    let totalCalories = 0;
    let hydrationCount = 0;
    let mealCount = 0;
    let bathroomCheckCount = 0;
    
    activeSchedules.forEach(schedule => {
      const dailyOccurrences = getDailyOccurrences(schedule.cron_expression);
      
      if (schedule.schedule_type === 'hydration') {
        hydrationCount += dailyOccurrences;
        if (schedule.default_amount && schedule.default_amount_unit === 'ml') {
          totalWaterMl += schedule.default_amount * dailyOccurrences;
        } else if (schedule.default_amount && schedule.default_amount_unit === 'oz') {
          totalWaterMl += schedule.default_amount * 29.5735 * dailyOccurrences;
        }
      }
      
      if (['meal', 'snack'].includes(schedule.schedule_type)) {
        mealCount += dailyOccurrences;
        if (schedule.default_calories) {
          totalCalories += schedule.default_calories * dailyOccurrences;
        }
      }
      
      if (['diaper_check', 'bathroom_assist', 'catheter_care'].includes(schedule.schedule_type)) {
        bathroomCheckCount += dailyOccurrences;
      }
    });
    
    return {
      totalWaterMl: Math.round(totalWaterMl),
      totalCalories: Math.round(totalCalories),
      hydrationCount: Math.round(hydrationCount * 10) / 10,
      mealCount: Math.round(mealCount * 10) / 10,
      bathroomCheckCount: Math.round(bathroomCheckCount * 10) / 10
    };
  };

  const getScheduleTypeLabel = (type) => {
    const labels = {
      'meal': 'Meal',
      'hydration': 'Hydration',
      'snack': 'Snack',
      'supplement': 'Supplement',
      'diaper_check': 'Diaper Check',
      'bathroom_assist': 'Bathroom Assist',
      'catheter_care': 'Catheter Care'
    };
    return labels[type] || type;
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
          <div className="admin-v2-empty-state">
            <NutritionIcon size={48} />
            <h3>No Patient Selected</h3>
            <p>Please select a patient to manage nutrition and output tracking.</p>
            <button 
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={() => setShowPatientModal(true)}
            >
              Select Patient
            </button>
          </div>
        ) : (
          <>
            {error && <div className="admin-v2-error">{error}</div>}

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
              />
            )}

            {/* Content based on active tab */}
            {activeTab !== 'overview' && (
            <div className="admin-v2-content">
              {/* INTAKE TAB */}
              {activeTab === 'intake' && (
                <div className="admin-v2-section">
                  <div className="admin-v2-section-header">
                    <h3>Intake Log</h3>
                    {hasPermission('nutrition.create') && (
                      <button 
                        className="admin-v2-btn admin-v2-btn-primary"
                        onClick={() => openIntakeModal()}
                      >
                        <PlusIcon size={16} />
                        Log Intake
                      </button>
                    )}
                  </div>
                  
                  {loading ? (
                    <div className="admin-v2-loading">Loading...</div>
                  ) : intakes.length === 0 ? (
                    <div className="admin-v2-empty-state">
                      <p>No intake records found</p>
                    </div>
                  ) : (
                    <div className="admin-v2-table-container">
                      <table className="admin-v2-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Item</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Calories</th>
                            <th>Meal</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {intakes.map(intake => (
                            <tr key={intake.id}>
                              <td>{formatDateTime(intake.consumed_at)}</td>
                              <td><strong>{intake.item_name}</strong></td>
                              <td>
                                <span className={`admin-v2-badge admin-v2-badge-${intake.item_type}`}>
                                  {intake.item_type}
                                </span>
                              </td>
                              <td>{intake.amount} {intake.amount_unit}</td>
                              <td>{intake.calories || '-'}</td>
                              <td>{intake.meal_type || '-'}</td>
                              <td>
                                <div className="admin-v2-table-actions">
                                  {hasPermission('nutrition.update') && (
                                    <button 
                                      className="admin-v2-action-btn admin-v2-action-btn-edit"
                                      onClick={() => openIntakeModal(intake)}
                                    >
                                      <EditIcon size={14} />
                                    </button>
                                  )}
                                  {hasPermission('nutrition.delete') && (
                                    <button 
                                      className="admin-v2-action-btn admin-v2-action-btn-delete"
                                      onClick={() => openDeleteModal(intake, 'intake')}
                                    >
                                      <TrashIcon size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* OUTPUT TAB */}
              {activeTab === 'output' && (
                <div className="admin-v2-section">
                  <div className="admin-v2-section-header">
                    <h3>Output Log</h3>
                    {hasPermission('nutrition.create') && (
                      <button 
                        className="admin-v2-btn admin-v2-btn-primary"
                        onClick={() => openOutputModal()}
                      >
                        <PlusIcon size={16} />
                        Log Output
                      </button>
                    )}
                  </div>
                  
                  {loading ? (
                    <div className="admin-v2-loading">Loading...</div>
                  ) : outputs.length === 0 ? (
                    <div className="admin-v2-empty-state">
                      <p>No output records found</p>
                    </div>
                  ) : (
                    <div className="admin-v2-table-container">
                      <table className="admin-v2-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Type</th>
                            <th>Details</th>
                            <th>Amount</th>
                            <th>Concerns</th>
                            <th>Notes</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {outputs.map(output => (
                            <tr key={output.id}>
                              <td>{formatDateTime(output.occurred_at)}</td>
                              <td>
                                <span className={`admin-v2-badge admin-v2-badge-${output.output_type}`}>
                                  {output.output_type}
                                </span>
                                {output.is_diaper && <span className="admin-v2-badge admin-v2-badge-info" style={{ marginLeft: '4px' }}>Diaper</span>}
                              </td>
                              <td>
                                {output.consistency && <span>{output.consistency}</span>}
                                {output.color && <span>, {output.color}</span>}
                                {output.clarity && <span>, {output.clarity}</span>}
                                {output.diaper_wetness && <span>Wetness: {output.diaper_wetness}</span>}
                              </td>
                              <td>{output.amount ? `${output.amount} ${output.amount_unit || ''}` : '-'}</td>
                              <td>
                                {(output.has_blood || output.has_mucus || output.pain_reported || output.straining) ? (
                                  <span className="admin-v2-badge admin-v2-badge-danger">
                                    {[
                                      output.has_blood && 'Blood',
                                      output.has_mucus && 'Mucus',
                                      output.pain_reported && 'Pain',
                                      output.straining && 'Straining'
                                    ].filter(Boolean).join(', ')}
                                  </span>
                                ) : '-'}
                              </td>
                              <td>{output.notes || '-'}</td>
                              <td>
                                <div className="admin-v2-table-actions">
                                  {hasPermission('nutrition.update') && (
                                    <button 
                                      className="admin-v2-action-btn admin-v2-action-btn-edit"
                                      onClick={() => openOutputModal(output)}
                                    >
                                      <EditIcon size={14} />
                                    </button>
                                  )}
                                  {hasPermission('nutrition.delete') && (
                                    <button 
                                      className="admin-v2-action-btn admin-v2-action-btn-delete"
                                      onClick={() => openDeleteModal(output, 'output')}
                                    >
                                      <TrashIcon size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SCHEDULES TAB */}
              {activeTab === 'schedules' && (
                <div className="admin-v2-section">
                  {/* Schedule Summary Cards */}
                  {(() => {
                    const totals = getScheduledTotals();
                    const waterTarget = currentGoal?.water_ml_target || currentGoal?.total_fluid_ml_target || 0;
                    const calorieTarget = currentGoal?.calories_target || 0;
                    const waterRemaining = Math.max(0, waterTarget - totals.totalWaterMl);
                    const calorieRemaining = Math.max(0, calorieTarget - totals.totalCalories);
                    const waterPercent = waterTarget > 0 ? Math.min(100, (totals.totalWaterMl / waterTarget) * 100) : 0;
                    const caloriePercent = calorieTarget > 0 ? Math.min(100, (totals.totalCalories / calorieTarget) * 100) : 0;
                    
                    return (
                      <div className="admin-v2-schedule-summary">
                        <div className="admin-v2-schedule-summary-card">
                          <div className="admin-v2-schedule-summary-header">
                            <span className="admin-v2-schedule-summary-icon water"><DropletIcon size={24} /></span>
                            <span className="admin-v2-schedule-summary-title">Daily Fluids</span>
                          </div>
                          <div className="admin-v2-schedule-summary-values">
                            <div className="admin-v2-schedule-summary-row">
                              <span className="label">Goal:</span>
                              <span className="value">{waterTarget > 0 ? `${waterTarget} ml` : 'Not set'}</span>
                            </div>
                            <div className="admin-v2-schedule-summary-row">
                              <span className="label">Scheduled:</span>
                              <span className="value scheduled">{totals.totalWaterMl} ml</span>
                            </div>
                            <div className="admin-v2-schedule-summary-row">
                              <span className="label">Remaining:</span>
                              <span className={`value ${waterRemaining > 0 ? 'warning' : 'success'}`}>
                                {waterRemaining > 0 ? `${waterRemaining} ml needed` : '✓ Covered'}
                              </span>
                            </div>
                          </div>
                          {waterTarget > 0 && (
                            <div className="admin-v2-schedule-progress">
                              <div 
                                className={`admin-v2-schedule-progress-bar ${waterPercent >= 100 ? 'success' : waterPercent >= 75 ? 'good' : 'warning'}`}
                                style={{ width: `${waterPercent}%` }}
                              />
                            </div>
                          )}
                          <div className="admin-v2-schedule-summary-detail">
                            {totals.hydrationCount} hydration times/day
                          </div>
                        </div>

                        <div className="admin-v2-schedule-summary-card">
                          <div className="admin-v2-schedule-summary-header">
                            <span className="admin-v2-schedule-summary-icon calories"><FlameIcon size={24} /></span>
                            <span className="admin-v2-schedule-summary-title">Daily Calories</span>
                          </div>
                          <div className="admin-v2-schedule-summary-values">
                            <div className="admin-v2-schedule-summary-row">
                              <span className="label">Goal:</span>
                              <span className="value">{calorieTarget > 0 ? `${calorieTarget} cal` : 'Not set'}</span>
                            </div>
                            <div className="admin-v2-schedule-summary-row">
                              <span className="label">Scheduled:</span>
                              <span className="value scheduled">{totals.totalCalories} cal</span>
                            </div>
                            <div className="admin-v2-schedule-summary-row">
                              <span className="label">Remaining:</span>
                              <span className={`value ${calorieRemaining > 0 ? 'warning' : 'success'}`}>
                                {calorieRemaining > 0 ? `${calorieRemaining} cal needed` : '✓ Covered'}
                              </span>
                            </div>
                          </div>
                          {calorieTarget > 0 && (
                            <div className="admin-v2-schedule-progress">
                              <div 
                                className={`admin-v2-schedule-progress-bar ${caloriePercent >= 100 ? 'success' : caloriePercent >= 75 ? 'good' : 'warning'}`}
                                style={{ width: `${caloriePercent}%` }}
                              />
                            </div>
                          )}
                          <div className="admin-v2-schedule-summary-detail">
                            {totals.mealCount} meals/snacks per day
                          </div>
                        </div>

                        <div className="admin-v2-schedule-summary-card">
                          <div className="admin-v2-schedule-summary-header">
                            <span className="admin-v2-schedule-summary-icon care"><ToiletIcon size={24} /></span>
                            <span className="admin-v2-schedule-summary-title">Care Checks</span>
                          </div>
                          <div className="admin-v2-schedule-summary-values">
                            <div className="admin-v2-schedule-summary-row">
                              <span className="label">Bathroom/Diaper:</span>
                              <span className="value">{totals.bathroomCheckCount}x daily</span>
                            </div>
                          </div>
                          <div className="admin-v2-schedule-summary-detail">
                            {schedules.filter(s => s.is_active).length} active schedules
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="admin-v2-section-header">
                    <h3>Nutrition & Care Schedules</h3>
                    {hasPermission('nutrition.create') && (
                      <button 
                        className="admin-v2-btn admin-v2-btn-primary"
                        onClick={() => openScheduleModal()}
                      >
                        <PlusIcon size={16} />
                        Add Schedule
                      </button>
                    )}
                  </div>
                  
                  {loading ? (
                    <div className="admin-v2-loading">Loading...</div>
                  ) : schedules.length === 0 ? (
                    <div className="admin-v2-empty-state">
                      <p>No schedules found</p>
                    </div>
                  ) : (
                    <div className="admin-v2-table-container">
                      <table className="admin-v2-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Timing</th>
                            <th>Default Amount</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedules.map(schedule => (
                            <tr key={schedule.id}>
                              <td><strong>{schedule.name}</strong></td>
                              <td>
                                <span className="admin-v2-badge admin-v2-badge-info">
                                  {getScheduleTypeLabel(schedule.schedule_type)}
                                </span>
                              </td>
                              <td>{formatCronExpression(schedule.cron_expression)}</td>
                              <td>
                                {schedule.default_amount 
                                  ? `${schedule.default_amount} ${schedule.default_amount_unit || ''}`
                                  : '-'
                                }
                                {schedule.default_calories && ` (${schedule.default_calories} cal)`}
                              </td>
                              <td>
                                <span className={`admin-v2-badge ${schedule.is_active ? 'admin-v2-badge-success' : 'admin-v2-badge-secondary'}`}>
                                  {schedule.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td>
                                <div className="admin-v2-table-actions">
                                  {hasPermission('nutrition.update') && (
                                    <>
                                      <button 
                                        className={`admin-v2-action-btn admin-v2-action-btn-${schedule.is_active ? 'warning' : 'success'}`}
                                        onClick={() => handleToggleSchedule(schedule.id)}
                                        title={schedule.is_active ? 'Deactivate' : 'Activate'}
                                      >
                                        <ClockIcon size={14} />
                                      </button>
                                      <button 
                                        className="admin-v2-action-btn admin-v2-action-btn-edit"
                                        onClick={() => openScheduleModal(schedule)}
                                      >
                                        <EditIcon size={14} />
                                      </button>
                                    </>
                                  )}
                                  {hasPermission('nutrition.delete') && (
                                    <button 
                                      className="admin-v2-action-btn admin-v2-action-btn-delete"
                                      onClick={() => openDeleteModal(schedule, 'schedule')}
                                    >
                                      <TrashIcon size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* GOALS TAB */}
              {activeTab === 'goals' && (
                <div className="admin-v2-section">
                  <div className="admin-v2-section-header">
                    <h3>Daily Nutrition Goals</h3>
                    {hasPermission('nutrition.create') && (
                      <button 
                        className="admin-v2-btn admin-v2-btn-primary"
                        onClick={() => openGoalModal()}
                      >
                        <PlusIcon size={16} />
                        Set New Goals
                      </button>
                    )}
                  </div>

                  {currentGoal && (
                    <div className="admin-v2-card nutrition-goals-card" style={{ marginBottom: '1.5rem' }}>
                      <div className="admin-v2-card-header">
                        <h4>Current Active Goals</h4>
                        <span className="admin-v2-badge admin-v2-badge-success">Active</span>
                      </div>
                      <div className="admin-v2-card-body">
                        <div className="nutrition-goals-grid">
                          {/* Fluids Section */}
                          <div className="nutrition-goal-card">
                            <div className="nutrition-goal-card-header">
                              <DropletIcon size={18} />
                              <h5>Fluids</h5>
                            </div>
                            <div className="nutrition-goal-card-body">
                              {currentGoal.water_ml_target ? (
                                <div className="nutrition-goal-stat">
                                  <span className="nutrition-goal-value">{currentGoal.water_ml_target}</span>
                                  <span className="nutrition-goal-unit">ml water</span>
                                </div>
                              ) : null}
                              {currentGoal.total_fluid_ml_target ? (
                                <div className="nutrition-goal-stat secondary">
                                  <span className="nutrition-goal-label">Total Fluids:</span>
                                  <span className="nutrition-goal-amount">{currentGoal.total_fluid_ml_target} ml</span>
                                </div>
                              ) : null}
                              {!currentGoal.water_ml_target && !currentGoal.total_fluid_ml_target && (
                                <span className="nutrition-goal-empty">Not set</span>
                              )}
                            </div>
                          </div>

                          {/* Calories Section */}
                          <div className="nutrition-goal-card">
                            <div className="nutrition-goal-card-header">
                              <FlameIcon size={18} />
                              <h5>Calories</h5>
                            </div>
                            <div className="nutrition-goal-card-body">
                              {currentGoal.calories_target ? (
                                <div className="nutrition-goal-stat">
                                  <span className="nutrition-goal-value">{currentGoal.calories_target}</span>
                                  <span className="nutrition-goal-unit">kcal</span>
                                </div>
                              ) : null}
                              {(currentGoal.calories_min || currentGoal.calories_max) && (
                                <div className="nutrition-goal-range">
                                  {currentGoal.calories_min && <span>Min: {currentGoal.calories_min}</span>}
                                  {currentGoal.calories_min && currentGoal.calories_max && <span className="range-divider">–</span>}
                                  {currentGoal.calories_max && <span>Max: {currentGoal.calories_max}</span>}
                                </div>
                              )}
                              {!currentGoal.calories_target && !currentGoal.calories_min && !currentGoal.calories_max && (
                                <span className="nutrition-goal-empty">Not set</span>
                              )}
                            </div>
                          </div>

                          {/* Macros Section */}
                          <div className="nutrition-goal-card">
                            <div className="nutrition-goal-card-header">
                              <LeafIcon size={18} />
                              <h5>Macros</h5>
                            </div>
                            <div className="nutrition-goal-card-body">
                              <div className="nutrition-goal-macros">
                                {currentGoal.protein_grams_target ? (
                                  <div className="macro-item protein">
                                    <span className="macro-value">{currentGoal.protein_grams_target}g</span>
                                    <span className="macro-label">Protein</span>
                                  </div>
                                ) : null}
                                {currentGoal.carbs_grams_target ? (
                                  <div className="macro-item carbs">
                                    <span className="macro-value">{currentGoal.carbs_grams_target}g</span>
                                    <span className="macro-label">Carbs</span>
                                  </div>
                                ) : null}
                                {currentGoal.fat_grams_target ? (
                                  <div className="macro-item fat">
                                    <span className="macro-value">{currentGoal.fat_grams_target}g</span>
                                    <span className="macro-label">Fat</span>
                                  </div>
                                ) : null}
                                {currentGoal.fiber_grams_target ? (
                                  <div className="macro-item fiber">
                                    <span className="macro-value">{currentGoal.fiber_grams_target}g</span>
                                    <span className="macro-label">Fiber</span>
                                  </div>
                                ) : null}
                              </div>
                              {!currentGoal.protein_grams_target && !currentGoal.carbs_grams_target && 
                               !currentGoal.fat_grams_target && !currentGoal.fiber_grams_target && (
                                <span className="nutrition-goal-empty">Not set</span>
                              )}
                            </div>
                          </div>

                          {/* Limits & Output Section */}
                          <div className="nutrition-goal-card">
                            <div className="nutrition-goal-card-header">
                              <BarChartIcon size={18} />
                              <h5>Limits & Output</h5>
                            </div>
                            <div className="nutrition-goal-card-body">
                              <div className="nutrition-goal-limits">
                                {currentGoal.sodium_mg_max ? (
                                  <div className="limit-item">
                                    <span className="limit-label">Sodium Max</span>
                                    <span className="limit-value">{currentGoal.sodium_mg_max} mg</span>
                                  </div>
                                ) : null}
                                {currentGoal.urine_output_ml_min ? (
                                  <div className="limit-item">
                                    <span className="limit-label">Min Urine</span>
                                    <span className="limit-value">{currentGoal.urine_output_ml_min} ml</span>
                                  </div>
                                ) : null}
                                {currentGoal.bowel_movements_target ? (
                                  <div className="limit-item">
                                    <span className="limit-label">BM Target</span>
                                    <span className="limit-value">{currentGoal.bowel_movements_target}/day</span>
                                  </div>
                                ) : null}
                              </div>
                              {!currentGoal.sodium_mg_max && !currentGoal.urine_output_ml_min && 
                               !currentGoal.bowel_movements_target && (
                                <span className="nutrition-goal-empty">Not set</span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="nutrition-goals-footer">
                          <span className="effective-date">
                            Effective: {formatDate(currentGoal.effective_date)}
                          </span>
                          {hasPermission('nutrition.update') && (
                            <button 
                              className="admin-v2-btn admin-v2-btn-secondary"
                              onClick={() => openGoalModal(currentGoal)}
                            >
                              <EditIcon size={14} />
                              Edit Current Goals
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {loading ? (
                    <div className="admin-v2-loading">Loading...</div>
                  ) : goals.length === 0 ? (
                    <div className="admin-v2-empty-state">
                      <p>No goals configured</p>
                    </div>
                  ) : (
                    <div className="admin-v2-table-container">
                      <h4 style={{ marginBottom: '1rem' }}>Goal History</h4>
                      <table className="admin-v2-table">
                        <thead>
                          <tr>
                            <th>Effective Date</th>
                            <th>Water Target</th>
                            <th>Calories</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {goals.map(goal => (
                            <tr key={goal.id}>
                              <td>{formatDate(goal.effective_date)}</td>
                              <td>{goal.water_ml_target ? `${goal.water_ml_target} ml` : '-'}</td>
                              <td>{goal.calories_target ? `${goal.calories_target} kcal` : '-'}</td>
                              <td>
                                <span className={`admin-v2-badge ${goal.is_active ? 'admin-v2-badge-success' : 'admin-v2-badge-secondary'}`}>
                                  {goal.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td>
                                <div className="admin-v2-table-actions">
                                  {hasPermission('nutrition.update') && (
                                    <button 
                                      className="admin-v2-action-btn admin-v2-action-btn-edit"
                                      onClick={() => openGoalModal(goal)}
                                    >
                                      <EditIcon size={14} />
                                    </button>
                                  )}
                                  {hasPermission('nutrition.delete') && (
                                    <button 
                                      className="admin-v2-action-btn admin-v2-action-btn-delete"
                                      onClick={() => openDeleteModal(goal, 'goal')}
                                    >
                                      <TrashIcon size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
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

      <IntakeModal
        open={showIntakeModal}
        onClose={() => { setShowIntakeModal(false); setEditingItem(null); }}
        onSaved={fetchData}
        patient={selectedPatient}
        editing={editingItem}
      />

      <OutputModal
        open={showOutputModal}
        onClose={() => { setShowOutputModal(false); setEditingItem(null); }}
        onSaved={fetchData}
        patient={selectedPatient}
        editing={editingItem}
      />


      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="admin-v2-modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="admin-v2-modal admin-v2-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="admin-v2-modal-header">
              <h3>{editingItem ? 'Edit Schedule' : 'Add Schedule'}</h3>
              <button className="admin-v2-modal-close" onClick={() => setShowScheduleModal(false)}>
                <XIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveSchedule}>
              <div className="admin-v2-modal-body">
                {formError && <div className="admin-v2-form-error">{formError}</div>}
                
                <div className="admin-v2-form-row">
                  <div className="admin-v2-form-group">
                    <label>Schedule Type *</label>
                    <select
                      value={scheduleForm.schedule_type}
                      onChange={e => setScheduleForm({...scheduleForm, schedule_type: e.target.value})}
                    >
                      <option value="meal">Meal</option>
                      <option value="hydration">Hydration</option>
                      <option value="snack">Snack</option>
                      <option value="supplement">Supplement</option>
                      <option value="diaper_check">Diaper Check</option>
                      <option value="bathroom_assist">Bathroom Assist</option>
                      <option value="catheter_care">Catheter Care</option>
                    </select>
                  </div>
                  <div className="admin-v2-form-group" style={{ flex: 2 }}>
                    <label>Name *</label>
                    <input
                      type="text"
                      value={scheduleForm.name}
                      onChange={e => setScheduleForm({...scheduleForm, name: e.target.value})}
                      placeholder="e.g., Morning Feed, Afternoon Water"
                      required
                    />
                  </div>
                </div>

                {!editingItem && (
                  <div className="admin-v2-form-section">
                    <h4>Timing</h4>
                    <div className="admin-v2-schedule-mode">
                      <label>
                        <input
                          type="radio"
                          name="scheduleMode"
                          checked={scheduleMode === 'daily'}
                          onChange={() => setScheduleMode('daily')}
                        />
                        Daily
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="scheduleMode"
                          checked={scheduleMode === 'weekly'}
                          onChange={() => setScheduleMode('weekly')}
                        />
                        Weekly
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="scheduleMode"
                          checked={scheduleMode === 'monthly'}
                          onChange={() => setScheduleMode('monthly')}
                        />
                        Monthly
                      </label>
                    </div>

                    {scheduleMode === 'weekly' && (
                      <div className="admin-v2-day-picker">
                        {daysOfWeek.map((day, index) => (
                          <label key={day} className={`admin-v2-day-chip ${selectedDays.includes(index) ? 'selected' : ''}`}>
                            <input
                              type="checkbox"
                              checked={selectedDays.includes(index)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedDays([...selectedDays, index]);
                                } else {
                                  setSelectedDays(selectedDays.filter(d => d !== index));
                                }
                              }}
                            />
                            {day}
                          </label>
                        ))}
                      </div>
                    )}

                    {scheduleMode === 'monthly' && (
                      <div className="admin-v2-form-group">
                        <label>Day of Month</label>
                        <select
                          value={selectedDayOfMonth}
                          onChange={e => setSelectedDayOfMonth(parseInt(e.target.value))}
                        >
                          {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="admin-v2-form-group">
                      <label>Time</label>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={e => setScheduleTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {['meal', 'hydration', 'snack', 'supplement'].includes(scheduleForm.schedule_type) && (
                  <div className="admin-v2-form-section">
                    <h4>Default Values (optional)</h4>
                    <div className="admin-v2-form-row">
                      <div className="admin-v2-form-group">
                        <label>Item Name</label>
                        <input
                          type="text"
                          value={scheduleForm.default_item_name}
                          onChange={e => setScheduleForm({...scheduleForm, default_item_name: e.target.value})}
                          placeholder="e.g., Peptamen, Water"
                        />
                      </div>
                      <div className="admin-v2-form-group">
                        <label>Amount</label>
                        <input
                          type="number"
                          step="0.1"
                          value={scheduleForm.default_amount}
                          onChange={e => setScheduleForm({...scheduleForm, default_amount: e.target.value})}
                        />
                      </div>
                      <div className="admin-v2-form-group">
                        <label>Unit</label>
                        <select
                          value={scheduleForm.default_amount_unit}
                          onChange={e => setScheduleForm({...scheduleForm, default_amount_unit: e.target.value})}
                        >
                          <option value="ml">ml</option>
                          <option value="oz">oz</option>
                          <option value="cups">cups</option>
                        </select>
                      </div>
                      <div className="admin-v2-form-group">
                        <label>Calories</label>
                        <input
                          type="number"
                          step="1"
                          value={scheduleForm.default_calories}
                          onChange={e => setScheduleForm({...scheduleForm, default_calories: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="admin-v2-form-row">
                  <div className="admin-v2-form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={scheduleForm.create_care_task}
                        onChange={e => setScheduleForm({...scheduleForm, create_care_task: e.target.checked})}
                      />
                      {' '}Create Care Task
                    </label>
                  </div>
                  <div className="admin-v2-form-group">
                    <label>Reminder (minutes before)</label>
                    <input
                      type="number"
                      value={scheduleForm.reminder_minutes_before}
                      onChange={e => setScheduleForm({...scheduleForm, reminder_minutes_before: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </div>

                <div className="admin-v2-form-group">
                  <label>Instructions</label>
                  <textarea
                    value={scheduleForm.instructions}
                    onChange={e => setScheduleForm({...scheduleForm, instructions: e.target.value})}
                    rows={2}
                    placeholder="Instructions for caregiver..."
                  />
                </div>

                <div className="admin-v2-form-group">
                  <label>Notes</label>
                  <textarea
                    value={scheduleForm.notes}
                    onChange={e => setScheduleForm({...scheduleForm, notes: e.target.value})}
                    rows={2}
                  />
                </div>
              </div>
              <div className="admin-v2-modal-footer">
                <button type="button" className="admin-v2-btn admin-v2-btn-secondary" onClick={() => setShowScheduleModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="admin-v2-btn admin-v2-btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : (editingItem ? 'Update' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Goal Modal */}
      {showGoalModal && (
        <div className="admin-v2-modal-overlay" onClick={() => setShowGoalModal(false)}>
          <div className="admin-v2-modal admin-v2-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="admin-v2-modal-header">
              <h3>{editingItem ? 'Edit Goals' : 'Set Daily Goals'}</h3>
              <button className="admin-v2-modal-close" onClick={() => setShowGoalModal(false)}>
                <XIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveGoal}>
              <div className="admin-v2-modal-body">
                {formError && <div className="admin-v2-form-error">{formError}</div>}
                
                <div className="admin-v2-form-group">
                  <label>Effective Date *</label>
                  <input
                    type="date"
                    value={goalForm.effective_date}
                    onChange={e => setGoalForm({...goalForm, effective_date: e.target.value})}
                    required
                  />
                </div>

                <div className="admin-v2-form-section">
                  <h4>Fluid Targets</h4>
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Water Target (ml)</label>
                      <input
                        type="number"
                        value={goalForm.water_ml_target}
                        onChange={e => setGoalForm({...goalForm, water_ml_target: e.target.value})}
                        placeholder="e.g., 2000"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Total Fluids (ml)</label>
                      <input
                        type="number"
                        value={goalForm.total_fluid_ml_target}
                        onChange={e => setGoalForm({...goalForm, total_fluid_ml_target: e.target.value})}
                        placeholder="Including food liquids"
                      />
                    </div>
                  </div>
                </div>

                <div className="admin-v2-form-section">
                  <h4>Calorie Targets</h4>
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Calories Target</label>
                      <input
                        type="number"
                        value={goalForm.calories_target}
                        onChange={e => setGoalForm({...goalForm, calories_target: e.target.value})}
                        placeholder="e.g., 2000"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Min Calories</label>
                      <input
                        type="number"
                        value={goalForm.calories_min}
                        onChange={e => setGoalForm({...goalForm, calories_min: e.target.value})}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Max Calories</label>
                      <input
                        type="number"
                        value={goalForm.calories_max}
                        onChange={e => setGoalForm({...goalForm, calories_max: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="admin-v2-form-section">
                  <h4>Macronutrient Targets</h4>
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Protein (g)</label>
                      <input
                        type="number"
                        value={goalForm.protein_grams_target}
                        onChange={e => setGoalForm({...goalForm, protein_grams_target: e.target.value})}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Carbs (g)</label>
                      <input
                        type="number"
                        value={goalForm.carbs_grams_target}
                        onChange={e => setGoalForm({...goalForm, carbs_grams_target: e.target.value})}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Fat (g)</label>
                      <input
                        type="number"
                        value={goalForm.fat_grams_target}
                        onChange={e => setGoalForm({...goalForm, fat_grams_target: e.target.value})}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Fiber (g)</label>
                      <input
                        type="number"
                        value={goalForm.fiber_grams_target}
                        onChange={e => setGoalForm({...goalForm, fiber_grams_target: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="admin-v2-form-section">
                  <h4>Restrictions & Output Targets</h4>
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Max Sodium (mg)</label>
                      <input
                        type="number"
                        value={goalForm.sodium_mg_max}
                        onChange={e => setGoalForm({...goalForm, sodium_mg_max: e.target.value})}
                        placeholder="For low-sodium diets"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Min Urine Output (ml)</label>
                      <input
                        type="number"
                        value={goalForm.urine_output_ml_min}
                        onChange={e => setGoalForm({...goalForm, urine_output_ml_min: e.target.value})}
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>BM Target (per day)</label>
                      <input
                        type="number"
                        value={goalForm.bowel_movements_target}
                        onChange={e => setGoalForm({...goalForm, bowel_movements_target: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="admin-v2-form-group">
                  <label>Notes</label>
                  <textarea
                    value={goalForm.notes}
                    onChange={e => setGoalForm({...goalForm, notes: e.target.value})}
                    rows={2}
                    placeholder="Any special dietary notes..."
                  />
                </div>
              </div>
              <div className="admin-v2-modal-footer">
                <button type="button" className="admin-v2-btn admin-v2-btn-secondary" onClick={() => setShowGoalModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="admin-v2-btn admin-v2-btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : (editingItem ? 'Update' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="admin-v2-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="admin-v2-modal-header">
              <h3>Confirm Delete</h3>
              <button className="admin-v2-modal-close" onClick={() => setShowDeleteModal(false)}>
                <XIcon size={20} />
              </button>
            </div>
            <div className="admin-v2-modal-body">
              <p>Are you sure you want to delete this {deleteType}? This action cannot be undone.</p>
            </div>
            <div className="admin-v2-modal-footer">
              <button className="admin-v2-btn admin-v2-btn-secondary" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className="admin-v2-btn admin-v2-btn-danger" onClick={handleDelete} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminV2Layout>
  );
};

export default AdminV2Nutrition;
