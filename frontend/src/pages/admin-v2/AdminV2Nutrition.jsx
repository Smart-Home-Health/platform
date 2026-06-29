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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { localTimeToUTC, localTimeAndDaysToUTC, utcCronToLocalDaysAndTime, formatCronExpression, getCurrentLocalDateTime, localDateTimeToUTC, getLocalDateTimeString } from '../../utils/timezone';
import './AdminV2.css';

// Module-scope so the inputs don't lose focus on each keystroke (a component
// defined inside render remounts every change).
function ScheduleFormFields({
  scheduleForm, setScheduleForm, editingItem,
  scheduleMode, setScheduleMode,
  selectedDays, setSelectedDays,
  selectedDayOfMonth, setSelectedDayOfMonth,
  scheduleTime, setScheduleTime,
  daysOfWeek,
}) {
  const showDefaults = ['meal', 'hydration', 'snack', 'supplement'].includes(scheduleForm.schedule_type);
  return (
    <div className="flex flex-col gap-4">
      <FormRow>
        <Field label="Schedule Type" required>
          <Select
            value={scheduleForm.schedule_type}
            onValueChange={(v) => setScheduleForm({ ...scheduleForm, schedule_type: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="meal">Meal</SelectItem>
              <SelectItem value="hydration">Hydration</SelectItem>
              <SelectItem value="snack">Snack</SelectItem>
              <SelectItem value="supplement">Supplement</SelectItem>
              <SelectItem value="diaper_check">Diaper Check</SelectItem>
              <SelectItem value="bathroom_assist">Bathroom Assist</SelectItem>
              <SelectItem value="catheter_care">Catheter Care</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Name" required htmlFor="sched-name">
          <Input
            id="sched-name"
            value={scheduleForm.name}
            onChange={e => setScheduleForm({ ...scheduleForm, name: e.target.value })}
            placeholder="e.g., Morning Feed, Afternoon Water"
            required
          />
        </Field>
      </FormRow>

      {!editingItem && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h4 className="text-sm font-semibold text-foreground">Timing</h4>
          <div className="flex flex-wrap gap-2">
            {['daily', 'weekly', 'monthly'].map(m => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={scheduleMode === m ? 'default' : 'secondary'}
                className="capitalize"
                onClick={() => setScheduleMode(m)}
              >
                {m}
              </Button>
            ))}
          </div>

          {scheduleMode === 'weekly' && (
            <div className="flex flex-wrap gap-2">
              {daysOfWeek.map((day, index) => (
                <Button
                  key={day}
                  type="button"
                  size="sm"
                  variant={selectedDays.includes(index) ? 'default' : 'secondary'}
                  onClick={() => setSelectedDays(
                    selectedDays.includes(index)
                      ? selectedDays.filter(d => d !== index)
                      : [...selectedDays, index]
                  )}
                >
                  {day}
                </Button>
              ))}
            </div>
          )}

          {scheduleMode === 'monthly' && (
            <Field label="Day of Month">
              <Select
                value={String(selectedDayOfMonth)}
                onValueChange={(v) => setSelectedDayOfMonth(parseInt(v, 10))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                    <SelectItem key={day} value={String(day)}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Time" htmlFor="sched-time">
            <Input
              id="sched-time"
              type="time"
              value={scheduleTime}
              onChange={e => setScheduleTime(e.target.value)}
            />
          </Field>
        </div>
      )}

      {showDefaults && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h4 className="text-sm font-semibold text-foreground">Default Values (optional)</h4>
          <FormRow cols={4}>
            <Field label="Item Name" htmlFor="sched-item">
              <Input
                id="sched-item"
                value={scheduleForm.default_item_name}
                onChange={e => setScheduleForm({ ...scheduleForm, default_item_name: e.target.value })}
                placeholder="e.g., Peptamen, Water"
              />
            </Field>
            <Field label="Amount" htmlFor="sched-amount">
              <Input
                id="sched-amount"
                type="number"
                step="0.1"
                value={scheduleForm.default_amount}
                onChange={e => setScheduleForm({ ...scheduleForm, default_amount: e.target.value })}
              />
            </Field>
            <Field label="Unit">
              <Select
                value={scheduleForm.default_amount_unit}
                onValueChange={(v) => setScheduleForm({ ...scheduleForm, default_amount_unit: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ml">ml</SelectItem>
                  <SelectItem value="oz">oz</SelectItem>
                  <SelectItem value="cups">cups</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Calories" htmlFor="sched-cal">
              <Input
                id="sched-cal"
                type="number"
                step="1"
                value={scheduleForm.default_calories}
                onChange={e => setScheduleForm({ ...scheduleForm, default_calories: e.target.value })}
              />
            </Field>
          </FormRow>
        </div>
      )}

      <FormRow>
        <Field label="Reminder (minutes before)" htmlFor="sched-reminder">
          <Input
            id="sched-reminder"
            type="number"
            value={scheduleForm.reminder_minutes_before}
            onChange={e => setScheduleForm({ ...scheduleForm, reminder_minutes_before: parseInt(e.target.value) || 0 })}
          />
        </Field>
        <div className="flex items-center gap-2 pt-7">
          <Checkbox
            id="sched-care-task"
            checked={scheduleForm.create_care_task}
            onCheckedChange={(c) => setScheduleForm({ ...scheduleForm, create_care_task: c === true })}
          />
          <Label htmlFor="sched-care-task">Create Care Task</Label>
        </div>
      </FormRow>

      <Field label="Instructions" htmlFor="sched-instructions">
        <Textarea
          id="sched-instructions"
          value={scheduleForm.instructions}
          onChange={e => setScheduleForm({ ...scheduleForm, instructions: e.target.value })}
          rows={2}
          placeholder="Instructions for caregiver..."
        />
      </Field>

      <Field label="Notes" htmlFor="sched-notes">
        <Textarea
          id="sched-notes"
          value={scheduleForm.notes}
          onChange={e => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
          rows={2}
        />
      </Field>
    </div>
  );
}

function GoalFormFields({ goalForm, setGoalForm }) {
  const set = (k) => (e) => setGoalForm({ ...goalForm, [k]: e.target.value });
  return (
    <div className="flex flex-col gap-4">
      <Field label="Effective Date" required htmlFor="goal-date">
        <Input id="goal-date" type="date" value={goalForm.effective_date} onChange={set('effective_date')} required />
      </Field>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h4 className="text-sm font-semibold text-foreground">Fluid Targets</h4>
        <FormRow>
          <Field label="Water Target (ml)" htmlFor="goal-water">
            <Input id="goal-water" type="number" value={goalForm.water_ml_target} onChange={set('water_ml_target')} placeholder="e.g., 2000" />
          </Field>
          <Field label="Total Fluids (ml)" htmlFor="goal-total-fluid">
            <Input id="goal-total-fluid" type="number" value={goalForm.total_fluid_ml_target} onChange={set('total_fluid_ml_target')} placeholder="Including food liquids" />
          </Field>
        </FormRow>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h4 className="text-sm font-semibold text-foreground">Calorie Targets</h4>
        <FormRow cols={4}>
          <Field label="Calories Target" htmlFor="goal-cal"><Input id="goal-cal" type="number" value={goalForm.calories_target} onChange={set('calories_target')} placeholder="e.g., 2000" /></Field>
          <Field label="Min Calories" htmlFor="goal-cal-min"><Input id="goal-cal-min" type="number" value={goalForm.calories_min} onChange={set('calories_min')} /></Field>
          <Field label="Max Calories" htmlFor="goal-cal-max"><Input id="goal-cal-max" type="number" value={goalForm.calories_max} onChange={set('calories_max')} /></Field>
        </FormRow>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h4 className="text-sm font-semibold text-foreground">Macronutrient Targets</h4>
        <FormRow cols={4}>
          <Field label="Protein (g)" htmlFor="goal-protein"><Input id="goal-protein" type="number" value={goalForm.protein_grams_target} onChange={set('protein_grams_target')} /></Field>
          <Field label="Carbs (g)" htmlFor="goal-carbs"><Input id="goal-carbs" type="number" value={goalForm.carbs_grams_target} onChange={set('carbs_grams_target')} /></Field>
          <Field label="Fat (g)" htmlFor="goal-fat"><Input id="goal-fat" type="number" value={goalForm.fat_grams_target} onChange={set('fat_grams_target')} /></Field>
          <Field label="Fiber (g)" htmlFor="goal-fiber"><Input id="goal-fiber" type="number" value={goalForm.fiber_grams_target} onChange={set('fiber_grams_target')} /></Field>
        </FormRow>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h4 className="text-sm font-semibold text-foreground">Restrictions & Output Targets</h4>
        <FormRow cols={4}>
          <Field label="Max Sodium (mg)" htmlFor="goal-sodium"><Input id="goal-sodium" type="number" value={goalForm.sodium_mg_max} onChange={set('sodium_mg_max')} placeholder="For low-sodium diets" /></Field>
          <Field label="Min Urine Output (ml)" htmlFor="goal-urine"><Input id="goal-urine" type="number" value={goalForm.urine_output_ml_min} onChange={set('urine_output_ml_min')} /></Field>
          <Field label="BM Target (per day)" htmlFor="goal-bm"><Input id="goal-bm" type="number" value={goalForm.bowel_movements_target} onChange={set('bowel_movements_target')} /></Field>
        </FormRow>
      </div>

      <Field label="Notes" htmlFor="goal-notes">
        <Textarea id="goal-notes" value={goalForm.notes} onChange={set('notes')} rows={2} placeholder="Any special dietary notes..." />
      </Field>
    </div>
  );
}

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

  // Date-range filters for the Intake / Output history tabs.
  const [intakeStart, setIntakeStart] = useState('');
  const [intakeEnd, setIntakeEnd] = useState('');
  const [outputStart, setOutputStart] = useState('');
  const [outputEnd, setOutputEnd] = useState('');

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
  }, [selectedPatient, activeTab, overviewDate, intakeStart, intakeEnd, outputStart, outputEnd]);

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
        const params = new URLSearchParams({ limit: '500' });
        if (intakeStart) params.append('start_date', new Date(`${intakeStart}T00:00:00`).toISOString());
        if (intakeEnd) params.append('end_date', new Date(`${intakeEnd}T23:59:59`).toISOString());
        const response = await fetch(
          `${config.apiUrl}/api/patients/${selectedPatient.id}/nutrition-intake?${params.toString()}`,
          { credentials: 'include' }
        );
        if (response.ok) {
          setIntakes(await response.json());
        }
      } else if (activeTab === 'output') {
        const params = new URLSearchParams({ limit: '500' });
        if (outputStart) params.append('start_date', new Date(`${outputStart}T00:00:00`).toISOString());
        if (outputEnd) params.append('end_date', new Date(`${outputEnd}T23:59:59`).toISOString());
        const response = await fetch(
          `${config.apiUrl}/api/nutrition/outputs/patient/${selectedPatient.id}?${params.toString()}`,
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

  // Output display helpers (shared by single + merged rows).
  const outputDetailText = (o) =>
    [o.consistency, o.color, o.clarity, o.diaper_wetness ? `Wetness: ${o.diaper_wetness}` : null]
      .filter(Boolean)
      .join(', ');
  const outputConcernText = (o) =>
    [o.has_blood && 'Blood', o.has_mucus && 'Mucus', o.pain_reported && 'Pain', o.straining && 'Straining']
      .filter(Boolean)
      .join(', ');

  // Stool size is qualitative (smear/small/medium/large) and stored in
  // amount_unit with amount=null; measured outputs (urine) use amount + unit.
  const SIZE_UNITS = new Set(['smear', 'small', 'medium', 'large']);
  const outputAmountText = (o) => {
    if (o.amount != null && o.amount !== '') {
      return `${o.amount}${o.amount_unit ? ` ${o.amount_unit}` : ''}`;
    }
    if (o.amount_unit && SIZE_UNITS.has(String(o.amount_unit).toLowerCase())) {
      const s = String(o.amount_unit);
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    return '';
  };

  // Diaper outputs logged within a few minutes of each other are one physical
  // change (e.g. urine + bowel) — merge them into a single display event,
  // mirroring the schedule view's 3-minute window. Backend already date-filters.
  const DIAPER_MERGE_WINDOW_MS = 3 * 60 * 1000;
  const buildOutputEvents = (list) => {
    const sorted = [...list].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    const diaperGroups = [];
    sorted.filter(o => o.is_diaper).forEach((o) => {
      const last = diaperGroups[diaperGroups.length - 1];
      if (last && (new Date(o.occurred_at) - new Date(last[last.length - 1].occurred_at)) <= DIAPER_MERGE_WINDOW_MS) {
        last.push(o);
      } else {
        diaperGroups.push([o]);
      }
    });
    const events = [];
    diaperGroups.forEach(g => events.push(
      g.length > 1
        ? { kind: 'merged', members: g, time: g[0].occurred_at }
        : { kind: 'single', output: g[0], time: g[0].occurred_at }
    ));
    sorted.filter(o => !o.is_diaper).forEach(o => events.push({ kind: 'single', output: o, time: o.occurred_at }));
    events.sort((a, b) => new Date(b.time) - new Date(a.time));
    return events;
  };
  const outputEvents = buildOutputEvents(outputs);

  // Delete every record in a merged diaper event (mirrors the schedule undo,
  // which voids all members of a mixed diaper together).
  const handleDeleteOutputEvent = async (members) => {
    const types = members.map(m => m.output_type).join(' + ');
    if (!window.confirm(`Delete this diaper event (${types})? This removes ${members.length} records.`)) return;
    setSaving(true);
    try {
      await Promise.all(members.map(m =>
        fetch(`${config.apiUrl}/api/nutrition/outputs/${m.id}`, { method: 'DELETE', credentials: 'include' })
      ));
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
          <div className="admin-v2-empty-state">
            <NutritionIcon size={48} />
            <h3>No Patient Selected</h3>
            <p>Please select a patient to manage nutrition and output tracking.</p>
            <div className="tw">
              <Button onClick={() => setShowPatientModal(true)}>Select Patient</Button>
            </div>
          </div>
        ) : (
          <>
            {error && <div className="tw"><Alert variant="destructive">{error}</Alert></div>}

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
                  {/* Date range filter */}
                  <div className="tw mb-4">
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="From" htmlFor="intake-from">
                          <Input
                            id="intake-from"
                            type="date"
                            value={intakeStart}
                            onChange={e => setIntakeStart(e.target.value)}
                          />
                        </Field>
                        <Field label="To" htmlFor="intake-to">
                          <Input
                            id="intake-to"
                            type="date"
                            value={intakeEnd}
                            onChange={e => setIntakeEnd(e.target.value)}
                          />
                        </Field>
                        {(intakeStart || intakeEnd) && (
                          <div>
                            <Button
                              variant="secondary"
                              onClick={() => { setIntakeStart(''); setIntakeEnd(''); }}
                            >
                              Clear Filters
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {loading ? (
                    <div className="admin-v2-loading">Loading...</div>
                  ) : intakes.length === 0 ? (
                    <div className="admin-v2-empty-state">
                      <p>No intake records found</p>
                    </div>
                  ) : (
                    <div className="admin-v2-table-container admin-v2-table-cards-wrap">
                      <table className="admin-v2-table admin-v2-table-cards">
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
                              <td data-label="Time">{formatDateTime(intake.consumed_at)}</td>
                              <td className="admin-v2-cell-name"><strong>{intake.item_name}</strong></td>
                              <td data-label="Type">
                                <span className={`admin-v2-badge admin-v2-badge-${intake.item_type}`}>
                                  {intake.item_type}
                                </span>
                              </td>
                              <td data-label="Amount">{intake.amount} {intake.amount_unit}</td>
                              <td data-label="Calories">{intake.calories || '-'}</td>
                              <td data-label="Meal">{intake.meal_type || '-'}</td>
                              <td className="admin-v2-cell-actions">
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
                  {/* Date range filter */}
                  <div className="tw mb-4">
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="From" htmlFor="output-from">
                          <Input
                            id="output-from"
                            type="date"
                            value={outputStart}
                            onChange={e => setOutputStart(e.target.value)}
                          />
                        </Field>
                        <Field label="To" htmlFor="output-to">
                          <Input
                            id="output-to"
                            type="date"
                            value={outputEnd}
                            onChange={e => setOutputEnd(e.target.value)}
                          />
                        </Field>
                        {(outputStart || outputEnd) && (
                          <div>
                            <Button
                              variant="secondary"
                              onClick={() => { setOutputStart(''); setOutputEnd(''); }}
                            >
                              Clear Filters
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {loading ? (
                    <div className="admin-v2-loading">Loading...</div>
                  ) : outputEvents.length === 0 ? (
                    <div className="admin-v2-empty-state">
                      <p>No output records found</p>
                    </div>
                  ) : (
                    <div className="admin-v2-table-container admin-v2-table-cards-wrap">
                      <table className="admin-v2-table admin-v2-table-cards">
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
                          {outputEvents.map((ev) => {
                            if (ev.kind === 'merged') {
                              const members = ev.members;
                              const concerns = members.map(outputConcernText).filter(Boolean).join(', ');
                              const notes = members.map(m => m.notes).filter(Boolean).join('; ');
                              return (
                                <tr key={`merged-${members.map(m => m.id).join('-')}`}>
                                  <td className="admin-v2-cell-name">{formatDateTime(ev.time)}</td>
                                  <td data-label="Type">
                                    {members.map(m => (
                                      <span key={m.id} className={`admin-v2-badge admin-v2-badge-${m.output_type}`} style={{ marginRight: '4px' }}>
                                        {m.output_type}
                                      </span>
                                    ))}
                                    <span className="admin-v2-badge admin-v2-badge-info">Diaper</span>
                                  </td>
                                  <td data-label="Details" className="admin-v2-cell-stack">
                                    {members.map(m => {
                                      const line = [outputDetailText(m), outputAmountText(m)].filter(Boolean).join(', ');
                                      return (
                                        <span key={m.id} className="admin-v2-output-detail-line">
                                          <span className="admin-v2-output-detail-type">{m.output_type}</span>
                                          {line || '—'}
                                        </span>
                                      );
                                    })}
                                  </td>
                                  <td data-label="Amount">-</td>
                                  <td data-label="Concerns">
                                    {concerns ? <span className="admin-v2-badge admin-v2-badge-danger">{concerns}</span> : '-'}
                                  </td>
                                  <td data-label="Notes">{notes || '-'}</td>
                                  <td className="admin-v2-cell-actions">
                                    <div className="admin-v2-table-actions">
                                      {hasPermission('nutrition.update') && members.map(m => (
                                        <button
                                          key={m.id}
                                          className="admin-v2-action-btn admin-v2-action-btn-edit"
                                          onClick={() => openOutputModal(m)}
                                          title={`Edit ${m.output_type}`}
                                        >
                                          <EditIcon size={14} />
                                          <span>{m.output_type}</span>
                                        </button>
                                      ))}
                                      {hasPermission('nutrition.delete') && (
                                        <button
                                          className="admin-v2-action-btn admin-v2-action-btn-delete"
                                          onClick={() => handleDeleteOutputEvent(members)}
                                          title="Delete diaper event"
                                        >
                                          <TrashIcon size={14} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            }
                            const output = ev.output;
                            return (
                              <tr key={output.id}>
                                <td className="admin-v2-cell-name">{formatDateTime(output.occurred_at)}</td>
                                <td data-label="Type">
                                  <span className={`admin-v2-badge admin-v2-badge-${output.output_type}`}>
                                    {output.output_type}
                                  </span>
                                  {output.is_diaper && <span className="admin-v2-badge admin-v2-badge-info" style={{ marginLeft: '4px' }}>Diaper</span>}
                                </td>
                                <td data-label="Details" className="admin-v2-cell-stack">{outputDetailText(output)}</td>
                                <td data-label="Amount">{outputAmountText(output) || '-'}</td>
                                <td data-label="Concerns">
                                  {outputConcernText(output)
                                    ? <span className="admin-v2-badge admin-v2-badge-danger">{outputConcernText(output)}</span>
                                    : '-'}
                                </td>
                                <td data-label="Notes">{output.notes || '-'}</td>
                                <td className="admin-v2-cell-actions">
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
                            );
                          })}
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
                      <div className="tw">
                        <Button onClick={() => openScheduleModal()}>
                          <PlusIcon size={16} />
                          Add Schedule
                        </Button>
                      </div>
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
                      <div className="tw">
                        <Button onClick={() => openGoalModal()}>
                          <PlusIcon size={16} />
                          Set New Goals
                        </Button>
                      </div>
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
                            <div className="tw">
                              <Button variant="secondary" onClick={() => openGoalModal(currentGoal)}>
                                <EditIcon size={14} />
                                Edit Current Goals
                              </Button>
                            </div>
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
      <Dialog open={showScheduleModal} onOpenChange={(o) => { if (!o) setShowScheduleModal(false); }}>
        <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Schedule' : 'Add Schedule'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveSchedule} className="flex flex-col gap-4">
            {formError && <Alert variant="destructive">{formError}</Alert>}
            <ScheduleFormFields
              scheduleForm={scheduleForm}
              setScheduleForm={setScheduleForm}
              editingItem={editingItem}
              scheduleMode={scheduleMode}
              setScheduleMode={setScheduleMode}
              selectedDays={selectedDays}
              setSelectedDays={setSelectedDays}
              selectedDayOfMonth={selectedDayOfMonth}
              setSelectedDayOfMonth={setSelectedDayOfMonth}
              scheduleTime={scheduleTime}
              setScheduleTime={setScheduleTime}
              daysOfWeek={daysOfWeek}
            />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowScheduleModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : (editingItem ? 'Update' : 'Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Goal Modal */}
      <Dialog open={showGoalModal} onOpenChange={(o) => { if (!o) setShowGoalModal(false); }}>
        <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Goals' : 'Set Daily Goals'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveGoal} className="flex flex-col gap-4">
            {formError && <Alert variant="destructive">{formError}</Alert>}
            <GoalFormFields goalForm={goalForm} setGoalForm={setGoalForm} />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowGoalModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : (editingItem ? 'Update' : 'Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteType}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminV2Layout>
  );
};

export default AdminV2Nutrition;
