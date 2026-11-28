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
import { useEffect, useRef, useState } from 'react';
import { EmField, EmRow, EmSelect } from '../vc/EntityModal';
import MissedWindowField from '../schedule/MissedWindowField';
import { validMissedWindow } from '../schedule/reminderTiming';
import { DAYS } from '../vc/useCronSchedule';
import { localTimeAndDaysToUTC, localTimeToUTC, parseCronExpression } from '../../utils/timezone';

function readTiming(schedule) {
  const parsed = parseCronExpression(schedule?.cron_expression);
  const daily = parsed?.type === 'daily';
  return {
    mode: daily ? 'weekly' : parsed?.type ?? (schedule ? 'custom' : 'weekly'),
    days: daily ? DAYS.map(d => d.value) : parsed?.dayNumbers ?? [],
    dayOfMonth: parsed?.dayOfMonth ?? 1,
    time: parsed?.time ?? '08:00',
  };
}

function writeTiming({ mode, time, days, dayOfMonth }) {
  if (mode === 'custom') return {};
  if (mode === 'weekly') {
    const utc = localTimeAndDaysToUTC(time, days);
    const labels = DAYS.filter(d => days.includes(d.value)).map(d => d.label);
    return {
      cron_expression: `${utc.minute} ${utc.hour} * * ${utc.days.join(',')}`,
      description: `${labels.join(', ')} at ${time}`,
    };
  }
  const utc = localTimeToUTC(time);
  return {
    cron_expression: `${utc.minute} ${utc.hour} ${dayOfMonth} * *`,
    description: `Day ${dayOfMonth} (UTC) of each month at ${time} local time`,
  };
}

export default function MedicationScheduleForm({
  schedule, medication, patients, currentPatientId, saving, onSave, onCancel,
}) {
  const [initialTiming] = useState(() => readTiming(schedule));
  const [timing, setTiming] = useState(initialTiming);
  const [dose, setDose] = useState(schedule ? String(schedule.dose_amount ?? '') : '1.000');
  const existingWindow = schedule?.reminder_window_minutes
    ?? (schedule?.grace_period_hours != null ? schedule.grace_period_hours * 60 : null);
  const [windowMinutes, setWindowMinutes] = useState(existingWindow);
  const [patientId, setPatientId] = useState(String((schedule ? schedule.patient_id : currentPatientId) ?? ''));
  const heading = useRef(null);
  useEffect(() => {
    if (schedule) heading.current?.focus();
  }, [schedule]);

  const setMode = mode => setTiming({ ...timing, mode });
  const toggleDay = day => setTiming({
    ...timing,
    days: timing.days.includes(day) ? timing.days.filter(d => d !== day) : [...timing.days, day],
  });
  const custom = timing.mode === 'custom';
  const validDose = Number(dose) > 0 || (schedule && schedule.dose_amount == null && dose === '');
  const valid = validDose && (windowMinutes === existingWindow || validMissedWindow(windowMinutes))
    && (custom || (timing.time && (timing.mode !== 'weekly' || timing.days.length > 0)))
    && (!medication.is_global || patientId || (schedule && schedule.patient_id == null));

  async function submit(event) {
    event.preventDefault();
    if (!valid || saving) return;
    const fields = writeTiming(timing);
    // Comparing the two form selections preserves equivalent stored expressions
    // (e.g. daily '*') and custom descriptions when only the dose changes.
    const payload = !schedule || fields.cron_expression !== writeTiming(initialTiming).cron_expression
      ? fields : {};
    const newDose = dose === '' ? null : Number(dose);
    if (!schedule || newDose !== schedule.dose_amount) payload.dose_amount = newDose;
    if (windowMinutes !== existingWindow) {
      payload.reminder_window_minutes = windowMinutes;
      if (schedule?.grace_period_hours != null) payload.grace_period_hours = null;
    }
    if (medication.is_global && patientId && Number(patientId) !== schedule?.patient_id) {
      payload.patient_id = Number(patientId);
    }
    if (await onSave(payload) && !schedule) {
      setTiming(initialTiming);
      setDose('1.000');
      setWindowMinutes(null);
    }
  }

  return (
    <form className="em-form" onSubmit={submit}>
      <h4 className="cfg-group-title" ref={heading} tabIndex={-1}>
        {schedule ? 'Edit Schedule' : 'Add New Schedule'}
      </h4>
      <div className="cfg-tabs" role="group" aria-label="Schedule cadence">
        {initialTiming.mode === 'custom' && (
          <button type="button" className="cfg-tab" aria-selected={custom} onClick={() => setMode('custom')}>
            Custom
          </button>
        )}
        {['weekly', 'monthly'].map(mode => (
          <button key={mode} type="button" className="cfg-tab"
                  aria-selected={timing.mode === mode} onClick={() => setMode(mode)}>
            {mode === 'weekly' ? 'Weekly' : 'Monthly'}
          </button>
        ))}
      </div>
      {custom && <p className="em-hint">Current timing (UTC) <code>{schedule.cron_expression}</code></p>}
      {timing.mode === 'weekly' && (
        <EmField label="Select Days">
          <div className="cfg-daypick">
            {DAYS.map(({ value, label }) => (
              <button key={value} type="button" aria-pressed={timing.days.includes(value)}
                      onClick={() => toggleDay(value)}>{label}</button>
            ))}
          </div>
        </EmField>
      )}
      {timing.mode === 'monthly' && (
        <EmField label="Day of Month (UTC)" htmlFor="med-sched-dom">
          <EmSelect id="med-sched-dom" value={timing.dayOfMonth}
                    onChange={e => setTiming({ ...timing, dayOfMonth: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </EmSelect>
        </EmField>
      )}
      {medication.is_global && (
        <EmField label="Patient" required={!schedule || schedule.patient_id != null} htmlFor="med-sched-patient">
          <EmSelect id="med-sched-patient" value={patientId} onChange={e => setPatientId(e.target.value)}>
            <option value="">{schedule && schedule.patient_id == null ? 'Unassigned' : 'Select a patient...'}</option>
            {patients.map(patient => (
              <option key={patient.id} value={patient.id}>{patient.first_name} {patient.last_name}</option>
            ))}
          </EmSelect>
        </EmField>
      )}
      <EmRow>
        {!custom && (
          <EmField label="Time" htmlFor="med-sched-time">
            <input id="med-sched-time" className="em-input" type="time" required value={timing.time}
                   onChange={e => setTiming({ ...timing, time: e.target.value })} />
          </EmField>
        )}
        <EmField label={`Dose Amount (${medication.quantity_unit || 'units'})`} htmlFor="med-sched-dose">
          <input id="med-sched-dose" className="em-input" type="number" step="any" min="0"
                 value={dose} onChange={e => setDose(e.target.value)} placeholder="1.000" />
        </EmField>
      </EmRow>
      <MissedWindowField value={windowMinutes} onChange={setWindowMinutes} legacyValue={existingWindow}
        placeholder={schedule ? 'Automatic' : 'Profile default'}
        hint={schedule ? 'Leave blank to use 60% of the time until the next dose.'
          : 'Leave blank to use the profile default. Without a default, a dose is marked missed after 60% of the time until its next occurrence.'} />
      <div className={schedule ? 'em-footer' : 'cfg-actions'}>
        {schedule && <button type="button" className="em-cancel" disabled={saving} onClick={onCancel}>Cancel</button>}
        <button type="submit" className="em-submit" disabled={saving || !valid}>
          {saving ? 'Saving…' : schedule ? 'Save Changes' : 'Add Schedule'}
        </button>
      </div>
    </form>
  );
}
