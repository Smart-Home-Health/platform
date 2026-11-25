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
import { getLocalDateTimeString } from '../../utils/timezone';
import { scheduleManagerService } from '../../services/scheduleManager';

export default function MoveFeedDialog({ item, patientId, onClose, onSaved }) {
  const [start, setStart] = useState(() => getLocalDateTimeString(
    new Date(item.start_override_at || item.effective_time || item.scheduled_time)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (earliest) => {
    setBusy(true);
    setError('');
    try {
      await scheduleManagerService.moveFeed(patientId, {
        schedule_id: item.schedule_id, scheduled_time: item.scheduled_time, earliest_start: earliest,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return <EntityModal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title={`Move ${item.name}`}>
    <form className="em-form" onSubmit={(event) => { event.preventDefault(); save(new Date(start).toISOString()); }}>
      <EmField label="Earliest start for this occurrence" htmlFor="move-feed-start"
        hint="Later feeds will adjust to keep the selected spacing.">
        <input className="em-input" id="move-feed-start" type="datetime-local" required value={start}
          min={getLocalDateTimeString(new Date(item.scheduled_time))}
          max={getLocalDateTimeString(new Date(Date.parse(item.scheduled_time) + 86400000))}
          onChange={(event) => setStart(event.target.value)} />
      </EmField>
      {error && <p className="em-error" role="alert">{error}</p>}
      <div className="sm-actions">
        {item.start_override_at && <button type="button" className="em-cancel" disabled={busy}
          onClick={() => save(null)}>Clear one-time move</button>}
        <button type="submit" className="em-submit" disabled={busy}>Save one-time move</button>
      </div>
    </form>
  </EntityModal>;
}
