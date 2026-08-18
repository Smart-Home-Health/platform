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
// Dose details for the selected row, shown beside the schedule at the wide dock
// stop. Rendered inline inside the same ModalBase rather than as a second
// overlay — the same shape AlertDetailInline takes inside AlertsList.
//
// Recording and skipping are the host's handlers, unchanged: they already carry
// the 409 paths for off-window administration and insufficient quantity, and
// re-implementing those here would be a second place to get them wrong.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import config, { apiFetch } from '../../config';
import { bucketFor, recurrenceLabel } from './scheduleRollup';
import { DOSE_LABELS } from './scheduleLabels';
import { ChevronRightIcon } from '../Icons';

const STATUS_TEXT = {
  completed: 'Given',
  skipped: 'Skipped',
  missed: 'Missed',
  pending: 'Upcoming',
  upcoming: 'Upcoming',
  due_on_time: 'Due',
  due_warning: 'Due',
  due_late: 'Due',
};

const HISTORY_STATUS = {
  'on-time': 'On time',
  early: 'Early',
  late: 'Late',
  skipped: 'Skipped',
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

// Medication defaults. Filtering by medication_id, not name: the name filter
// is a substring match, so "Pro" would pull in every medication starting with
// it.
const defaultHistoryQuery = (item) => {
  const id = item?._raw?.medication_id;
  return id ? `/api/medications/history?medication_id=${id}` : null;
};

const HISTORY_STATUS_TONE = { skipped: 'skipped' };

const defaultHistoryRow = (row) => ({
  id: row.id,
  at: row.administered_at,
  status: HISTORY_STATUS[row.status] || row.status,
  tone: HISTORY_STATUS_TONE[row.status] || 'given',
  meta: `${row.dose_amount}${row.dose_unit ? ` ${row.dose_unit}` : ''}`,
  note: row.notes,
});

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

/* History differs per section: medications filter by medication_id and report
 * a dose, care tasks filter by task_id and report a completion status. The
 * shell is the same, so the caller supplies the query and the row mapping
 * rather than this growing a second copy. */
export default function DoseDetailPane({
  item,
  patientId,
  recordingAs,
  onRecord,
  onSkip,
  busy = false,
  labels = DOSE_LABELS,
  historyQuery,
  mapHistoryRow,
  scheduleHref = '/care/medications/schedule',
  skipNote = 'Recorded as a zero dose with your note',
}) {
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [history, setHistory] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState(false);

  const query = historyQuery ? historyQuery(item) : defaultHistoryQuery(item);

  // The note belongs to the dose in front of you, not to the pane.
  useEffect(() => {
    setNote('');
    setHistoryOpen(false);
  }, [item?.id]);

  // Filter by medication_id, not name: the name filter is a substring match,
  // so "Pro" would pull in every medication starting with it.
  //
  // apiFetch, not fetch: inside a cross-origin iframe (the Home Assistant
  // embed) SameSite blocks the session cookie, and the wrapper falls back to
  // the bearer token.
  useEffect(() => {
    if (!historyOpen || !query || !patientId) return undefined;
    let cancelled = false;
    setHistoryError(false);
    (async () => {
      try {
        const res = await apiFetch(`${config.apiUrl}${query}&patient_id=${patientId}&limit=10`);
        if (cancelled) return;
        if (!res.ok) { setHistoryError(true); return; }
        const data = await res.json();
        if (!cancelled) setHistory(data.history || []);
      } catch {
        if (!cancelled) setHistoryError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [historyOpen, query, patientId]);

  const bucket = useMemo(() => (item ? bucketFor(item.status) : null), [item]);

  if (!item) {
    return (
      <div className="ld-dose-detail empty">
        <p>Select a {labels.one} to see its details and history.</p>
      </div>
    );
  }

  const done = item.is_completed;

  return (
    <div className="ld-dose-detail">
      <div className="ld-dose-detail-head">
        <h3 className="ld-dose-detail-name">{item.name}</h3>
        {item.extra && <span className="ld-dose-detail-amount">{item.extra}</span>}
      </div>

      <dl className="ld-dose-detail-rows">
        <div>
          <dt>Scheduled</dt>
          <dd>
            {fmtTime(item.scheduled_time)}
            {recurrenceLabel(item.description) ? ` · ${recurrenceLabel(item.description)}` : ''}
            {item.is_yesterday ? ' · yesterday' : ''}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className={`ld-dose-detail-status ${bucket}`}>
            {bucket !== 'given' && bucket !== 'skipped' && <span className="ld-dose-dot" aria-hidden="true" />}
            {STATUS_TEXT[item.status] || item.status}
          </dd>
        </div>
        {item._raw?.completed_at && (
          <div>
            <dt>Recorded</dt>
            <dd>{fmtDateTime(item._raw.completed_at)}</dd>
          </div>
        )}
      </dl>

      {!done && (
        <>
          <label className="ld-dose-detail-label" htmlFor="ld-dose-note">
            Add note (optional)
          </label>
          <textarea
            id="ld-dose-note"
            className="ld-dose-note"
            rows={2}
            maxLength={500}
            value={note}
            placeholder={labels.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />

          <button
            type="button"
            className="ld-dose-btn primary block"
            disabled={busy}
            onClick={() => onRecord && onRecord(item, { note: note.trim() || undefined })}
          >
            {busy ? 'Saving…' : labels.primary}
          </button>
        </>
      )}

      <div className="ld-dose-detail-actions">
        <span className="ld-dose-detail-label">Other actions</span>
        {!done && onSkip && (
          <button
            type="button"
            className="ld-dose-action"
            disabled={busy}
            onClick={() => onSkip(item, { note: note.trim() || undefined })}
          >
            <span>
              Skip
              <em>{skipNote}</em>
            </span>
            <ChevronRightIcon size={16} />
          </button>
        )}
        <button
          type="button"
          className="ld-dose-action"
          onClick={() => navigate(scheduleHref)}
        >
          <span>Correct schedule</span>
          <ChevronRightIcon size={16} />
        </button>
        <button
          type="button"
          className="ld-dose-action"
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((v) => !v)}
        >
          <span>{historyOpen ? 'Hide history' : 'View history'}</span>
          <ChevronRightIcon size={16} />
        </button>
      </div>

      {historyOpen && (
        <div className="ld-dose-history">
          {historyError && <p className="ld-dose-history-empty">Could not load history.</p>}
          {!historyError && history === null && <p className="ld-dose-history-empty">Loading…</p>}
          {!historyError && history?.length === 0 && (
            <p className="ld-dose-history-empty">No doses recorded yet.</p>
          )}
          {!historyError && history?.map((raw) => {
            const row = (mapHistoryRow || defaultHistoryRow)(raw);
            return (
              <div key={row.id} className="ld-dose-history-row">
                <span className="ld-dose-history-when">{fmtDateTime(row.at)}</span>
                <span className={`ld-dose-history-status ${row.tone}`}>{row.status}</span>
                {row.meta && <span className="ld-dose-history-dose">{row.meta}</span>}
                {row.note && <span className="ld-dose-history-note">{row.note}</span>}
              </div>
            );
          })}
        </div>
      )}

      {recordingAs && (
        <p className="ld-dose-detail-footer">Recording as {recordingAs}</p>
      )}
    </div>
  );
}
