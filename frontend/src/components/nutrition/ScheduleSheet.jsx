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
// Add or edit a nutrition schedule, in the same vocabulary as the logging
// sheets.
//
// The type picker leads with the distinction that actually matters: a meal or
// a flush produces an intake record, a diaper check does not. Choosing a care
// activity hides the amount and calorie fields rather than collecting numbers
// the backend will correctly refuse to turn into an intake row.
//
// Cron is stored in UTC. Everything shown here is local, and the conversion
// happens on the way in and out.
import { useEffect, useMemo, useState } from 'react';
import EntityModal, { EmField } from '../vc/EntityModal';
import SegmentedControl from '../vc/SegmentedControl';
import ChipGroup from '../vc/ChipGroup';
import DisclosureRow from '../vc/DisclosureRow';
import { ClockIcon, FoodIcon, LiquidIcon, SnackIcon, SupplementIcon } from '../Icons';
import {
  localTimeToUTC, localTimeAndDaysToUTC, utcCronToLocalDaysAndTime,
} from '../../utils/timezone';
import './nutrition-sheet.css';

// Schedules that put food or fluid into the patient...
const NUTRITION_TYPES = [
  { value: 'meal', label: 'Meal', icon: <FoodIcon size={18} /> },
  { value: 'hydration', label: 'Hydration', icon: <LiquidIcon size={18} /> },
  { value: 'snack', label: 'Snack', icon: <SnackIcon size={18} /> },
  { value: 'supplement', label: 'Supplement', icon: <SupplementIcon size={18} /> },
];

// ...and schedules that are a care activity with nothing to record as intake.
const CARE_TYPES = [
  { value: 'diaper_check', label: 'Diaper check' },
  { value: 'bathroom_assist', label: 'Bathroom assist' },
  { value: 'catheter_care', label: 'Catheter care' },
];

const CARE_VALUES = CARE_TYPES.map((t) => t.value);

const DAYS = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const emptyForm = () => ({
  schedule_type: 'meal',
  name: '',
  default_item_name: '',
  default_amount: '',
  default_amount_unit: 'ml',
  default_calories: '',
  create_care_task: true,
  reminder_minutes_before: 15,
  instructions: '',
  notes: '',
  is_active: true,
});

const numberOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function ScheduleSheet({ open, onClose, onSave, editing, saving, error }) {
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState('daily');
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [time, setTime] = useState('08:00');
  const [localError, setLocalError] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    if (!editing) {
      setForm(emptyForm());
      setMode('daily');
      setDays([1, 2, 3, 4, 5]);
      setDayOfMonth(1);
      setTime('08:00');
      return;
    }

    setForm({
      ...emptyForm(),
      schedule_type: editing.schedule_type || 'meal',
      name: editing.name || '',
      default_item_name: editing.default_item_name || '',
      default_amount: editing.default_amount ?? '',
      default_amount_unit: editing.default_amount_unit || 'ml',
      default_calories: editing.default_calories ?? '',
      create_care_task: editing.create_care_task !== false,
      reminder_minutes_before: editing.reminder_minutes_before ?? 15,
      instructions: editing.instructions || '',
      notes: editing.notes || '',
      is_active: editing.is_active !== false,
    });

    // Stored cron is UTC; show it in local time.
    const parts = (editing.cron_expression || '').split(' ');
    if (parts.length < 5) return;
    const [minute, hour, dom, , dow] = parts;
    const asLocalTime = () => {
      const utc = new Date();
      utc.setUTCHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
      return `${String(utc.getHours()).padStart(2, '0')}:${String(utc.getMinutes()).padStart(2, '0')}`;
    };

    if (dom !== '*') {
      setMode('monthly');
      setDayOfMonth(parseInt(dom, 10) || 1);
      setTime(asLocalTime());
    } else if (dow !== '*') {
      // The day list shifts with the time when the conversion crosses midnight,
      // so days and time convert together.
      const utcDays = dow.split(',').map((d) => parseInt(d, 10));
      const local = utcCronToLocalDaysAndTime(parseInt(hour, 10), parseInt(minute, 10), utcDays);
      setMode('weekly');
      setDays(local.days);
      setTime(local.time);
    } else {
      setMode('daily');
      setTime(asLocalTime());
    }
  }, [open, editing]);

  const isCare = CARE_VALUES.includes(form.schedule_type);
  const kind = isCare ? 'care' : 'nutrition';

  const buildCron = () => {
    if (mode === 'weekly') {
      if (days.length === 0) return null;
      const utc = localTimeAndDaysToUTC(time, days);
      return `${utc.minute} ${utc.hour} * * ${utc.days.join(',')}`;
    }
    const utc = localTimeToUTC(time);
    if (mode === 'monthly') return `${utc.minute} ${utc.hour} ${dayOfMonth} * *`;
    return `${utc.minute} ${utc.hour} * * *`;
  };

  const canSave = !!form.name.trim() && !saving
    && !(mode === 'weekly' && days.length === 0);

  const summary = useMemo(() => {
    const when = mode === 'daily'
      ? 'Daily'
      : mode === 'weekly'
        ? (days.length ? DAYS.filter((d) => days.includes(d.value)).map((d) => d.label).join(', ') : 'No days')
        : `Day ${dayOfMonth} monthly`;
    const [h, m] = time.split(':');
    const hour = Number(h);
    const label = Number.isFinite(hour)
      ? `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
      : time;
    return `${when} · ${label}`;
  }, [mode, days, dayOfMonth, time]);

  const submit = (event) => {
    event.preventDefault();
    const cron = buildCron();
    if (!cron) { setLocalError('Pick at least one day for a weekly schedule.'); return; }

    onSave({
      schedule_type: form.schedule_type,
      name: form.name.trim(),
      cron_expression: cron,
      // A care activity records no food or fluid, so it carries no defaults.
      default_item_name: isCare ? null : (form.default_item_name.trim() || null),
      default_amount: isCare ? null : numberOrNull(form.default_amount),
      default_amount_unit: isCare ? null : form.default_amount_unit,
      default_calories: isCare ? null : numberOrNull(form.default_calories),
      create_care_task: form.create_care_task,
      reminder_minutes_before: numberOrNull(form.reminder_minutes_before) ?? 0,
      instructions: form.instructions || null,
      notes: form.notes || null,
      is_active: form.is_active,
    });
  };

  return (
    <EntityModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      title={editing ? 'Edit schedule' : 'Add schedule'}
    >
      <form className="em-form nsheet" onSubmit={submit}>
        <p className="nsheet-sub">A recurring event that helps cover the daily targets.</p>
        {(error || localError) && <div className="em-error">{error || localError}</div>}

        <EmField label="Name" required htmlFor="sched-name">
          <input
            id="sched-name"
            className="em-input"
            value={form.name}
            placeholder="e.g. Morning Peptamen"
            onChange={(e) => set({ name: e.target.value })}
            required
          />
        </EmField>

        {/* Leads with the distinction that decides whether this produces an
            intake record at all. */}
        <SegmentedControl
          label="Kind"
          required
          options={[
            { value: 'nutrition', label: 'Nutrition' },
            { value: 'care', label: 'Care activity' },
          ]}
          value={kind}
          onChange={(next) => set({
            schedule_type: next === 'care' ? CARE_TYPES[0].value : NUTRITION_TYPES[0].value,
          })}
        />

        <SegmentedControl
          label="Type"
          required
          options={isCare ? CARE_TYPES : NUTRITION_TYPES}
          value={form.schedule_type}
          onChange={(schedule_type) => set({ schedule_type })}
        />

        <section className="nsheet-card">
          <header className="nsheet-card-head"><h4>Repeats</h4></header>
          <SegmentedControl
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
            value={mode}
            onChange={setMode}
            ariaLabel="Repeat pattern"
          />

          {mode === 'weekly' && (
            <ChipGroup
              label="Days"
              mode="multi"
              scroll
              options={DAYS}
              value={days}
              onChange={setDays}
            />
          )}

          {mode === 'monthly' && (
            <EmField label="Day of month" htmlFor="sched-dom">
              <select
                id="sched-dom"
                className="em-input"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(parseInt(e.target.value, 10))}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </EmField>
          )}

          <EmField label="Time" required htmlFor="sched-time">
            <div className="nsheet-when">
              <span className="nsheet-when-icon"><ClockIcon size={18} /></span>
              <input
                id="sched-time"
                className="em-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </EmField>
        </section>

        {/* Only a nutrition schedule has anything to prefill. */}
        {!isCare && (
          <section className="nsheet-card">
            <header className="nsheet-card-head"><h4>Defaults when logged</h4></header>
            <EmField label="Item" optional htmlFor="sched-item">
              <input
                id="sched-item"
                className="em-input"
                value={form.default_item_name}
                placeholder="e.g. Peptamen, Water"
                onChange={(e) => set({ default_item_name: e.target.value })}
              />
            </EmField>
            <EmField label="Amount" optional htmlFor="sched-amount">
              <div className="nsheet-amount">
                <input
                  id="sched-amount"
                  className="em-input"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={form.default_amount}
                  onChange={(e) => set({ default_amount: e.target.value })}
                />
                <select
                  className="em-input nsheet-unit"
                  aria-label="Amount unit"
                  value={form.default_amount_unit}
                  onChange={(e) => set({ default_amount_unit: e.target.value })}
                >
                  {['ml', 'oz', 'cups', 'grams', 'servings'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </EmField>
            <EmField label="Calories" optional htmlFor="sched-cal">
              <input
                id="sched-cal"
                className="em-input"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={form.default_calories}
                onChange={(e) => set({ default_calories: e.target.value })}
              />
            </EmField>
            {/* Coverage counts fluid by the unit, so this is worth knowing. */}
            <p className="nsheet-note">
              Amounts in mL, oz or cups count toward the fluid target.
            </p>
          </section>
        )}

        <DisclosureRow label="Reminder and care task" optional>
          <EmField label="Remind (minutes before)" htmlFor="sched-reminder">
            <input
              id="sched-reminder"
              className="em-input"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.reminder_minutes_before}
              onChange={(e) => set({ reminder_minutes_before: e.target.value })}
            />
          </EmField>
          <label className="em-check-row">
            <input
              type="checkbox"
              className="em-check"
              checked={form.create_care_task}
              onChange={(e) => set({ create_care_task: e.target.checked })}
            />
            <span className="em-check-label">Create a care task when this is due</span>
          </label>
        </DisclosureRow>

        <DisclosureRow
          label="Instructions and notes"
          optional
          summary={form.instructions ? form.instructions.slice(0, 50) : undefined}
        >
          <EmField label="Instructions for the caregiver" htmlFor="sched-instructions">
            <textarea
              id="sched-instructions"
              className="em-input"
              rows={2}
              value={form.instructions}
              onChange={(e) => set({ instructions: e.target.value })}
            />
          </EmField>
          <EmField label="Notes" htmlFor="sched-notes">
            <textarea
              id="sched-notes"
              className="em-input"
              rows={2}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </EmField>
        </DisclosureRow>

        {editing && (
          <label className="nsheet-switch-row">
            <span className="nsheet-switch-text">
              <strong>Active</strong>
              <span>Paused schedules stop firing but keep their history</span>
            </span>
            <input
              type="checkbox"
              className="em-check"
              checked={form.is_active}
              onChange={(e) => set({ is_active: e.target.checked })}
            />
          </label>
        )}

        <div className="nsheet-summary">
          <span className="nsheet-summary-icon"><ClockIcon size={18} /></span>
          <div className="nsheet-summary-text">
            <strong>{form.name.trim() || 'New schedule'}</strong>
            <span>{summary}</span>
          </div>
        </div>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="em-submit" disabled={!canSave}>
            {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add schedule')}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
