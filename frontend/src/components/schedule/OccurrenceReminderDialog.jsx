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
import { useState } from 'react';
import EntityModal, { EmField } from '../vc/EntityModal';
import { getLocalDateTimeString, parseScheduleTimestamp } from '../../utils/timezone';
import { scheduleReminders } from '../../services/scheduleReminders';
import { reminderDateLabel } from './reminderTiming';

export default function OccurrenceReminderDialog({ item, category, patientId, onClose, onSaved }) {
  const original = item.original_due_at ?? item.scheduled_time;
  const [deadline, setDeadline] = useState(() => parseScheduleTimestamp(item.deadline_at));
  const [choice, setChoice] = useState(() => {
    const previous = parseScheduleTimestamp(item.remind_at);
    const due = parseScheduleTimestamp(original);
    const suggested = Math.max(Date.now(), due?.getTime() ?? 0) + 30 * 60_000;
    return getLocalDateTimeString(previous ?? new Date(Math.min(suggested, deadline?.getTime() ?? Infinity)));
  });
  const [chosenOffset, setChosenOffset] = useState(() => parseScheduleTimestamp(item.remind_at)?.getTimezoneOffset());
  const [next, setNext] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const first = new Date(choice);
  const valid = Boolean(choice) && Number.isFinite(first.getTime()) && getLocalDateTimeString(first) === choice;
  // datetime-local omits the UTC offset. Offer both actual instants in a repeated hour.
  const tomorrow = new Date(first);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const shift = tomorrow.getTimezoneOffset() - first.getTimezoneOffset();
  const later = valid && shift > 0 ? new Date(first.getTime() + shift * 60_000) : null;
  const repeated = later && getLocalDateTimeString(later) === choice;
  const selected = repeated && later.getTimezoneOffset() === chosenOffset ? later : first;
  const [earliest, setEarliest] = useState(() => parseScheduleTimestamp(original));
  const beforeDue = valid && earliest && selected < earliest;
  const afterDeadline = valid && deadline && selected > deadline;
  const occurrence = { patient_id: patientId, schedule_id: item.schedule_id,
    scheduled_time: /(?:Z|[+-]\d{2}:?\d{2})$/i.test(item.scheduled_time)
      ? item.scheduled_time : parseScheduleTimestamp(item.scheduled_time)?.toISOString() };
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function save(target, confirmNext) {
    if (busy || !target) return;
    setError('');
    if (target.getTime() <= Date.now()) {
      setError('Choose a reminder time in the future.');
      return;
    }
    setBusy(true);
    try {
      await scheduleReminders.move(category, {
        ...occurrence, remind_at: target.toISOString(),
        ...(confirmNext && { confirm_next_at: confirmNext }),
      });
      onSaved(target);
    } catch (err) {
      const detail = err.detail;
      if (detail?.code === 'overlaps_next' && detail.next_at) {
        setNext({ at: detail.next_at, target });
      } else if (detail?.code === 'after_deadline' && parseScheduleTimestamp(detail.deadline_at)) {
        setDeadline(parseScheduleTimestamp(detail.deadline_at));
        setNext(null);
      } else if (detail?.code === 'before_due' && parseScheduleTimestamp(detail.original_due_at)) {
        setEarliest(parseScheduleTimestamp(detail.original_due_at));
        setNext(null);
      } else if (detail?.code === 'reminder_in_past') {
        setError('Choose a reminder time in the future.');
      } else if (detail?.code === 'occurrence_closed') {
        setClosed(true);
        setError('This occurrence has already closed. Refresh the schedule to see its status.');
      } else setError(err.message);
    } finally { setBusy(false); }
  }

  async function cancelReminder() {
    setBusy(true);
    setError('');
    try {
      await scheduleReminders.cancel(category, occurrence);
      onSaved(parseScheduleTimestamp(original));
    } catch (err) {
      if (err.detail?.code === 'occurrence_closed') {
        setClosed(true);
        setError('This occurrence has already closed.');
      } else setError(err.message);
    }
    finally { setBusy(false); }
  }

  return <EntityModal open title={item.remind_at ? 'Adjust reminder' : 'Remind me later'}
    onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <form className="em-form" onSubmit={event => {
      event.preventDefault();
      if (valid && !beforeDue && !afterDeadline && !next && !closed) save(selected);
    }}>
      <p><strong>{item.name}</strong><br />Originally due {reminderDateLabel(original)}</p>
      <EmField label="Remind me on" htmlFor="occurrence-remind-at"
        hint={`Enter times in ${deviceZone}.${deadline ? ' Mark missed at ' + reminderDateLabel(deadline.toISOString()) + '.' : ''}`}>
        <input id="occurrence-remind-at" className="em-input" type="datetime-local" required value={choice}
          disabled={busy || closed} onChange={event => {
            setChoice(event.target.value); setChosenOffset(undefined); setNext(null); setError('');
          }} />
      </EmField>
      {choice && !valid && <p className="em-error">Choose a local time that exists on this date.</p>}
      {repeated && <EmField label="Which time?" htmlFor="reminder-clock-offset">
        <select id="reminder-clock-offset" className="em-input" value={selected.getTimezoneOffset()}
          onChange={event => { setChosenOffset(Number(event.target.value)); setNext(null); }}>
          {[first, later].map(date => <option key={date.getTime()} value={date.getTimezoneOffset()}>
            {reminderDateLabel(date.toISOString())}
          </option>)}
        </select>
      </EmField>}
      {beforeDue && !closed && <p className="em-error" role="alert">
        Choose the original due time or later, starting {reminderDateLabel(earliest.toISOString())}.
      </p>}
      {afterDeadline && !next && !closed && <div className="sch-warn" role="alert">
        <p>That time is after this occurrence will be marked missed.</p>
        <button className="em-cancel" type="button" disabled={busy} onClick={() => save(deadline)}>
          Remind me at the deadline
        </button>
      </div>}
      {next && !closed && <div className="sch-warn" role="alert">
        <p>The next occurrence is due {reminderDateLabel(next.at)}. Both occurrences will have their own reminders.</p>
        <button type="button" className="em-cancel" disabled={busy} onClick={() => save(next.target, next.at)}>
          Confirm overlapping reminder
        </button>
      </div>}
      {error && <p className="em-error" role="alert">{error}</p>}
      <div className="em-footer">
        {item.remind_at && !closed && <button type="button" className="cfg-ghost" disabled={busy}
          onClick={cancelReminder}>Cancel reminder change</button>}
        <button type="button" className="em-cancel" disabled={busy} onClick={onClose}>Close</button>
        {closed && <button type="button" className="em-submit" onClick={() => onSaved(null)}>Refresh schedule</button>}
        {!afterDeadline && !next && !closed && <button className="em-submit" disabled={busy || !valid || beforeDue}>
          {busy ? 'Saving…' : 'Save reminder'}
        </button>}
      </div>
    </form>
  </EntityModal>;
}
