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
// The completion record, opened from the Overview rather than living in the
// nav — it is something you consult about the numbers on that page.
//
// Owns its own filters and fetch, since a range only matters while it is open.
import { useCallback, useEffect, useMemo, useState } from 'react';
import EntityModal, { EmField } from '../../../components/vc/EntityModal';
import ChipGroup from '../../../components/vc/ChipGroup';
import { careTaskService } from '../../../services/careTasks';
import { CheckIcon, ClockIcon, XIcon } from '../../../components/Icons';
import './care-tasks-page.css';

const DEFAULT_DAYS = 14;

const isoDay = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const defaultRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (DEFAULT_DAYS - 1));
  return { start: isoDay(start), end: isoDay(end) };
};

const STATUS = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'skipped', label: 'Skipped' },
];

const timingOf = (row) => {
  if (row.status === 'skipped') return { label: 'Skipped', tone: 'idle' };
  if (row.completed_late) return { label: 'Late', tone: 'due' };
  if (row.completed_early) return { label: 'Early', tone: 'due' };
  if (row.scheduled_time) return { label: 'On time', tone: 'ok' };
  // No scheduled time to be measured against — done as needed.
  return { label: 'As needed', tone: 'idle' };
};

export default function CareTaskHistoryModal({
  open, onOpenChange, patient, categories = [], formatDateTime,
}) {
  const [range, setRange] = useState(defaultRange);
  const [status, setStatus] = useState('all');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setRange(defaultRange()); setStatus('all'); setCategoryId(''); setSearch(''); }
  }, [open]);

  const fetchRows = useCallback(async () => {
    if (!open || !patient) return;
    setLoading(true);
    try {
      const body = await careTaskService.history({
        patient_id: patient.id,
        limit: 200,
        start_date: range.start,
        end_date: range.end,
        category_id: categoryId || undefined,
        status_filter: status === 'all' ? undefined : status,
        task_name: search.trim() || undefined,
      });
      setRows(body.history || body.logs || (Array.isArray(body) ? body : []));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [open, patient, range.start, range.end, categoryId, status, search]);

  // Debounced so typing a task name does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(fetchRows, 250);
    return () => clearTimeout(timer);
  }, [fetchRows]);

  const totals = useMemo(() => ({
    total: rows.length,
    completed: rows.filter((r) => r.status === 'completed').length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
    late: rows.filter((r) => r.completed_late).length,
  }), [rows]);

  return (
    <EntityModal open={open} onOpenChange={onOpenChange} wide title="Completion history">
      <div className="em-form cth">
        <div className="ec-daterange">
          <label className="ec-daterange-field">
            <span>From</span>
            <input type="date" value={range.start}
                   onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
          </label>
          <label className="ec-daterange-field">
            <span>To</span>
            <input type="date" value={range.end}
                   onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
          </label>
          <EmField label="Category" optional htmlFor="cth-cat">
            <select id="cth-cat" className="em-input" value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </EmField>
        </div>

        <ChipGroup label="Status" scroll options={STATUS} value={status}
                   onChange={(v) => setStatus(v || 'all')} />

        <EmField label="Task" optional htmlFor="cth-search">
          <input id="cth-search" className="em-input" value={search}
                 placeholder="Search by task name"
                 onChange={(e) => setSearch(e.target.value)} />
        </EmField>

        <div className="cth-totals">
          <span><strong>{totals.total}</strong> entries</span>
          <span><strong>{totals.completed}</strong> completed</span>
          <span><strong>{totals.skipped}</strong> skipped</span>
          <span><strong>{totals.late}</strong> late</span>
        </div>

        {loading ? (
          <p className="ct-empty">Loading history…</p>
        ) : rows.length === 0 ? (
          <p className="ct-empty">Nothing recorded in this range.</p>
        ) : (
          <ul className="cth-list">
            {rows.map((row) => {
              const timing = timingOf(row);
              return (
                <li key={row.id} className="cth-row">
                  <span className={`cth-icon ${timing.tone}`}>
                    {row.status === 'skipped'
                      ? <XIcon size={15} />
                      : timing.label === 'On time' ? <CheckIcon size={15} /> : <ClockIcon size={15} />}
                  </span>
                  <span className="cth-text">
                    <span className="cth-name">{row.task_name}</span>
                    <span className="cth-meta">
                      {formatDateTime(row.completed_at)}
                      {row.task_category_name ? ` · ${row.task_category_name}` : ''}
                    </span>
                    {row.notes && <span className="cth-notes">{row.notes}</span>}
                  </span>
                  <span className={`cth-tag ${timing.tone}`}>{timing.label}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </div>
      </div>
    </EntityModal>
  );
}
