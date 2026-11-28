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
import config, { apiFetch } from '../../../config';
import { parseScheduleTimestamp } from '../../../utils/timezone';
import EntityModal from '../../../components/vc/EntityModal';
import '../../../components/schedule/schedule-panel.css';

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
      const when = parseScheduleTimestamp(row.completed_at || row.consumed_at);
      const status = type === 'nutrition' ? 'Logged'
        : ({ skipped: 'Skipped', partial: 'Partial', completed: 'Done' }[row.completion_status] || 'Done');
      return (
        <div className="ld-dose-history-row" key={row.id}>
          <span className="ld-dose-history-when">{when?.toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          }) || '—'}</span>
          <span className={`ld-dose-history-status ${status === 'Skipped' ? 'skipped' : 'given'}`}>{status}</span>
          {row.amount != null && <span className="ld-dose-history-dose">{row.amount} {row.amount_unit}</span>}
          {row.notes && <span className="ld-dose-history-note">{row.notes}</span>}
        </div>
      );
    })}
  </div>;
}

export default function ItemHistoryModal({ type, patientId, item, onClose }) {
  if (!patientId || !item) return null;
  const query = type === 'nutrition'
    ? `/api/patients/${patientId}/nutrition-intake?item_id=${item.id}&limit=10`
    : `/api/care-tasks/history?patient_id=${patientId}&task_id=${item.id}&limit=10`;
  return (
    <EntityModal open onOpenChange={value => { if (!value) onClose(); }} title={`Recent history · ${item.name}`}>
      <HistoryList key={query} type={type} query={query} />
    </EntityModal>
  );
}
