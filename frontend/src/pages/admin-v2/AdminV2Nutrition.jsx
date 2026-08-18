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
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { nutritionService } from '../../services/nutrition';
import { FLUID_ITEM_TYPES } from '../../components/nutrition/intakeVocab';
import {
  PatientHeader, PatientSelectorModal, IntakeSheet, OutputSheet, NutritionOverview,
  NutritionIntakeTab, NutritionOutputTab, NutritionPlanTab, GoalHistoryModal,
} from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { NutritionIcon } from '../../components/Icons';
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
import { localTimeToUTC, localTimeAndDaysToUTC, utcCronToLocalDaysAndTime } from '../../utils/timezone';
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
    // /schedules and /goals kept as aliases so old links still land somewhere
    // sensible now that the two views are one.
    if (path.includes('/nutrition/plan')) return 'plan';
    if (path.includes('/nutrition/schedules')) return 'plan';
    if (path.includes('/nutrition/goals')) return 'plan';
    return 'overview'; // default — /care/nutrition lands here
  };
  
  const activeTab = getActiveTabFromPath();
  const navigate = useNavigate();
  
  // Loading/error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Data states
  const [intakes, setIntakes] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [goals, setGoals] = useState([]);
  const [currentGoal, setCurrentGoal] = useState(null);
  const [plan, setPlan] = useState(null);
  const [showGoalHistory, setShowGoalHistory] = useState(false);

  // Overview-tab state — single date the page is showing, plus that day's
  // intake + output records pulled from the daily endpoints.
  const [overviewDate, setOverviewDate] = useState(new Date());
  const [dailyIntakes, setDailyIntakes] = useState([]);
  const [dailyOutputs, setDailyOutputs] = useState([]);
  
  // Reference data
  const [outputTypes, setOutputTypes] = useState({});
  const [, setScheduleTypes] = useState([]);
  
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

    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

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
  
  const openGoalHistory = () => setShowGoalHistory(true);

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
                onViewIntake={() => navigate('/care/nutrition/intake')}
                onViewOutput={() => navigate('/care/nutrition/output')}
              />
            )}

            {/* Content based on active tab */}
            {activeTab !== 'overview' && (
            <div className="admin-v2-content">
              {/* INTAKE TAB */}
              {activeTab === 'intake' && (
                <div className="admin-v2-section">
                  <NutritionIntakeTab
                    intakes={intakes}
                    loading={loading}
                    canCreate={hasPermission('nutrition.create')}
                    canUpdate={hasPermission('nutrition.update')}
                    canDelete={hasPermission('nutrition.delete')}
                    onAdd={() => openIntakeModal()}
                    onEdit={openIntakeModal}
                    onDelete={(intake) => openDeleteModal(intake, 'intake')}
                    formatDateTime={formatDateTime}
                    dateRange={{
                      start: intakeStart,
                      end: intakeEnd,
                      onStartChange: setIntakeStart,
                      onEndChange: setIntakeEnd,
                      onClear: () => { setIntakeStart(''); setIntakeEnd(''); },
                    }}
                  />
                </div>
              )}

              {/* OUTPUT TAB */}
              {activeTab === 'output' && (
                <div className="admin-v2-section">
                  <NutritionOutputTab
                    outputs={outputs}
                    loading={loading}
                    canCreate={hasPermission('nutrition.create')}
                    canUpdate={hasPermission('nutrition.update')}
                    canDelete={hasPermission('nutrition.delete')}
                    onAdd={() => openOutputModal()}
                    onEdit={openOutputModal}
                    onDeleteEvent={handleDeleteOutputEvent}
                    formatDateTime={formatDateTime}
                    dateRange={{
                      start: outputStart,
                      end: outputEnd,
                      onStartChange: setOutputStart,
                      onEndChange: setOutputEnd,
                      onClear: () => { setOutputStart(''); setOutputEnd(''); },
                    }}
                  />
                </div>
              )}

              {/* PLAN TAB — targets, coverage and the schedules that meet them */}
              {activeTab === 'plan' && (
                <div className="admin-v2-section">
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

      <GoalHistoryModal
        open={showGoalHistory}
        onOpenChange={setShowGoalHistory}
        goals={goals}
        formatDate={formatDate}
      />

      <IntakeSheet
        open={showIntakeModal}
        onClose={() => { setShowIntakeModal(false); setEditingItem(null); }}
        onSaved={fetchData}
        patient={selectedPatient}
        editing={editingItem}
      />

      <OutputSheet
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
