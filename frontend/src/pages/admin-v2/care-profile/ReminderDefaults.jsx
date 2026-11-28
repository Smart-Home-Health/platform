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
import { useEffect, useState } from 'react';
import MissedWindowField from '../../../components/schedule/MissedWindowField';
import { validMissedWindow } from '../../../components/schedule/reminderTiming';
import { scheduleReminders } from '../../../services/scheduleReminders';
import { CfgGroup, CfgSection } from '../settings/CfgSection';

export default function ReminderDefaults({ patientId }) {
  const [record, setRecord] = useState(null);
  const [minutes, setMinutes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    scheduleReminders.defaults(patientId).then(data => {
      if (!active) return;
      setRecord(data);
      setMinutes(data.reminder_window_minutes ?? null);
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [patientId, attempt]);

  const save = async event => {
    event.preventDefault();
    if (busy || !validMissedWindow(minutes)) return;
    setBusy(true);
    setError('');
    try {
      setRecord(await scheduleReminders.saveDefault(patientId, minutes));
      setNotice('Default for new schedules saved.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return <CfgSection title="Default for new schedules">
    <CfgGroup>
      {record && <form className="em-form" onSubmit={save}>
        <MissedWindowField value={minutes} disabled={!record.can_edit || busy} placeholder="No profile default"
          onChange={value => { setMinutes(value); setNotice(''); }}
          hint="Applies when a new medication, nutrition or care task schedule is created with its duration left blank." />
        {record.can_edit && <div><button className="em-submit" type="submit"
          disabled={busy || !validMissedWindow(minutes) || minutes === (record.reminder_window_minutes ?? null)}>
          {busy ? 'Saving…' : 'Save default'}
        </button></div>}
      </form>}
      {error && <p role="alert" className="em-error">{error}</p>}
      {!record && error && <button className="cfg-ghost" onClick={() => setAttempt(n => n + 1)}>Reload default</button>}
      {notice && <p role="status" className="em-success">{notice}</p>}
    </CfgGroup>
  </CfgSection>;
}
