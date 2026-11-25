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
import { useRef, useState } from 'react';
import { scheduleManagerService } from '../../../services/scheduleManager';
import { newEncounterUid } from '../../capture/useCaptureDraft';
import { CfgGroup, CfgSection } from '../settings/CfgSection';
import { formatDateTime } from './careProfileFormat';
import './schedule-manager.css';

const ACTION_MESSAGE = {
  dry: 'Dry check recorded.',
  changed: 'Diaper change recorded.',
  snooze: 'Check snoozed for 30 minutes.',
  dismiss: 'Suggestion dismissed.',
};

export function BathroomCheckCard({ state, patientId, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pendingRequest = useRef(null);
  const locked = useRef(false);
  const suggestion = state.suggestion;

  async function record(action) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    const key = `${patientId}:${action}:${suggestion?.trigger_key || ''}`;
    try {
      if (pendingRequest.current?.key !== key) {
        pendingRequest.current = { key, id: newEncounterUid() };
      }
      const updated = await scheduleManagerService.record(patientId, {
        action, request_id: pendingRequest.current.id,
        ...(suggestion && { trigger_key: suggestion.trigger_key }),
      });
      pendingRequest.current = null;
      onUpdate(updated);
      setNotice(ACTION_MESSAGE[action]);
    } catch (err) {
      setError(err.message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <CfgSection title={suggestion ? 'Diaper check suggested' : 'Record a bathroom check'}>
      <CfgGroup>
        {suggestion && (
          <p className="cfg-fine">
            {suggestion.feed_name} started {formatDateTime(suggestion.feed_started_at)}.{' '}
            {suggestion.last_change_at
              ? `Last recorded change was ${formatDateTime(suggestion.last_change_at)}.`
              : 'No recent diaper change is recorded.'}
          </p>
        )}
        {suggestion?.check_scheduled_time && <p className="cfg-fine">
          Recording a check here will also complete the one scheduled for {formatDateTime(suggestion.check_scheduled_time)}.
        </p>}
        {state.can_record && (
          <div className="sm-actions">
            <button type="button" className="cfg-ghost" disabled={busy} onClick={() => record('dry')}>Checked dry</button>
            <button type="button" className="cfg-ghost" disabled={busy} onClick={() => record('changed')}>Diaper changed</button>
            {suggestion && <>
              <button type="button" className="cfg-ghost" disabled={busy} onClick={() => record('snooze')}>Snooze 30 min</button>
              <button type="button" className="cfg-ghost" disabled={busy} onClick={() => record('dismiss')}>Dismiss</button>
            </>}
          </div>
        )}
        {error && <p role="alert" className="em-error">{error}</p>}
        {notice && <p role="status" className="em-success">{notice}</p>}
      </CfgGroup>
    </CfgSection>
  );
}
