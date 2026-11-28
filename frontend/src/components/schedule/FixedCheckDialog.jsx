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
import EntityModal from '../vc/EntityModal';
import { scheduleManagerService } from '../../services/scheduleManager';

export default function FixedCheckDialog({ item, patientId, onClose, onSaved, onRemind }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const record = async (action) => {
    setBusy(true);
    setError('');
    try {
      await scheduleManagerService.record(patientId, {
        action, check_schedule_id: item.schedule_id, check_scheduled_time: item.scheduled_time,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return <EntityModal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title={item.name}>
    <div className="em-form">
      <p>Record the outcome of this scheduled check.</p>
      {item.can_remind_later && onRemind && <div><button className="em-cancel" type="button" disabled={busy}
        onClick={onRemind}>{item.remind_at ? 'Adjust reminder' : 'Remind me later'}</button></div>}
      {error && <p role="alert" className="em-error">{error}</p>}
      <div className="sm-actions">
        <button type="button" className="em-cancel" disabled={busy} onClick={() => record('dry')}>Checked dry</button>
        <button type="button" className="em-submit" disabled={busy} onClick={() => record('changed')}>Diaper changed</button>
      </div>
    </div>
  </EntityModal>;
}
