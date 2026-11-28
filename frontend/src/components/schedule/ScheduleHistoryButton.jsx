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
import config, { apiFetch } from '../../config';
import { parseScheduleTimestamp } from '../../utils/timezone';
import EntityModal from '../vc/EntityModal';
import './schedule-panel.css';

const STATUS_LABELS = { 'on-time': 'On time', early: 'Early', late: 'Late', skipped: 'Skipped' };

function historyQuery(type, item, patientId) {
  if (!patientId || !item) return null;
  if (type === 'medication' && item.medication_id) {
    return `/api/medications/history?medication_id=${item.medication_id}&patient_id=${patientId}&limit=10`;
  }
  if (type === 'care-task' && item.care_task_id) {
    return `/api/care-tasks/history?task_id=${item.care_task_id}&patient_id=${patientId}&limit=10`;
  }
  if (type === 'nutrition' && item.schedule_id && !['diaper_check', 'flush'].includes(item.row_kind)) {
    return `/api/patients/${patientId}/nutrition-intake?schedule_id=${item.schedule_id}&limit=10`;
  }
  return null;
}

function HistoryList({ type, query }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await apiFetch(`${config.apiUrl}${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error('History request failed');
        const data = await response.json();
        if (!controller.signal.aborted) setRows(Array.isArray(data) ? data : (data.history || []));
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    load();
    return () => controller.abort();
  }, [query]);

  if (failed) return <p className="em-error" role="alert">Could not load history.</p>;
  if (!rows) return <p role="status">Loading history…</p>;
  if (!rows.length) return <p>No records yet.</p>;

  return <div className="ld-dose-history">
    {rows.map(row => {
      const when = parseScheduleTimestamp(row.administered_at || row.completed_at || row.consumed_at);
      const amount = type === 'medication' ? row.dose_amount : row.amount;
      const unit = type === 'medication' ? row.dose_unit : row.amount_unit;
      const status = type === 'care-task' ? (row.completion_status === 'skipped' ? 'Skipped' : 'Done')
        : type === 'nutrition' ? 'Taken' : (STATUS_LABELS[row.status] || row.status);
      return (
        <div className="ld-dose-history-row" key={row.id}>
          <span className="ld-dose-history-when">{when?.toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          }) || '—'}</span>
          <span className={`ld-dose-history-status ${status === 'Skipped' ? 'skipped' : 'given'}`}>{status}</span>
          {amount != null && <span className="ld-dose-history-dose">{amount}{unit && ` ${unit}`}</span>}
          {row.notes && <span className="ld-dose-history-note">{row.notes}</span>}
        </div>
      );
    })}
  </div>;
}

export default function ScheduleHistoryButton({ type, item, patientId }) {
  const query = historyQuery(type, item, patientId);
  const [openQuery, setOpenQuery] = useState(null);
  if (!query) return null;
  const open = query === openQuery;
  return (
    <span onClick={event => event.stopPropagation()}>
      <button type="button" className="admin-v2-btn admin-v2-btn-sm"
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpenQuery(query)}>
        Recent history
      </button>
      {open && (
        <EntityModal open onOpenChange={value => { if (!value) setOpenQuery(null); }}
          title={`Recent history · ${item.name}`}>
          <HistoryList key={query} type={type} query={query} />
        </EntityModal>
      )}
    </span>
  );
}
