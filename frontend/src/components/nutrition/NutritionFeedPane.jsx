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
// The live dashboard's side pane for a PENDING nutrition row: the full
// completion form, not just a note and a button. A feed shows its mix as
// editable rows (amounts adjustable, live kcal/mL target, flush hint); a
// queued flush shows its amount with Run and Skip. Completed rows and the
// empty state stay with the shared DoseDetailPane — this pane deliberately
// does not fork that shell for medications and care tasks.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import config, { apiFetch } from '../../config';
import { bucketFor, recurrenceLabel } from '../schedule/scheduleRollup';
import { ChevronRightIcon } from '../Icons';
import IntakeItemsEditor from './IntakeItemsEditor';
import { feedTarget, rowIsValid, rowsFromScheduleRow } from './intakeItemRows';

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

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

export default function NutritionFeedPane({
  item,
  patient,
  recordingAs,
  onRecord,
  onSkipFlush,
  busy = false,
}) {
  const navigate = useNavigate();
  const raw = item?._raw;
  const isFlush = raw?.row_kind === 'flush';

  const [rows, setRows] = useState([]);
  const [note, setNote] = useState('');
  const [flushAmount, setFlushAmount] = useState('');
  const [history, setHistory] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState(false);

  // The form belongs to the row in front of you, not to the pane.
  useEffect(() => {
    setNote('');
    setHistoryOpen(false);
    if (!raw) { setRows([]); return; }
    if (raw.row_kind === 'flush') {
      // A dynamic spot prefills today's suggestion (what is left of the
      // fluid goal) over the queued nominal — 0 means the goal is met.
      const prefill = (raw.fluid_dynamic && raw.suggested_amount != null)
        ? raw.suggested_amount
        : raw.default_amount;
      setFlushAmount(prefill != null ? String(prefill) : '');
      setRows([]);
    } else {
      setRows(rowsFromScheduleRow(raw));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed when the selected row changes, not on every raw identity churn
  }, [item?.id]);

  // Same lazy history the shared pane does, with the nutrition query.
  // apiFetch, not fetch: the Home Assistant iframe embed blocks the SameSite
  // session cookie, and the wrapper falls back to the bearer token.
  useEffect(() => {
    if (!historyOpen || !raw?.schedule_id || !patient?.id) return undefined;
    let cancelled = false;
    setHistoryError(false);
    (async () => {
      try {
        const res = await apiFetch(
          `${config.apiUrl}/api/patients/${patient.id}/nutrition-intake?schedule_id=${raw.schedule_id}&limit=10`,
        );
        if (cancelled) return;
        if (!res.ok) { setHistoryError(true); return; }
        const data = await res.json();
        if (!cancelled) setHistory(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setHistoryError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [historyOpen, raw?.schedule_id, patient?.id]);

  if (!item) return null;

  const bucket = bucketFor(item.status);
  const canRecord = isFlush
    ? Number(flushAmount) > 0
    : (rows.length > 0 && rows.every(rowIsValid));

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
      </dl>

      {isFlush ? (
        <>
          {raw?.fluid_dynamic && raw?.water_plan && (
            <p className="ldfeed-flush-hint">
              {raw.suggested_amount > 0
                ? `Suggested ${raw.suggested_amount} mL of the queued ${raw.default_amount ?? '—'}: `
                : 'Fluid goal already met — skip? '}
              target {raw.water_plan.target_ml} mL,
              logged {raw.water_plan.logged_ml},
              {' '}{raw.water_plan.expected_food_ml} still coming from feeds.
            </p>
          )}
          <label className="ld-dose-detail-label" htmlFor="ldfeed-flush-amount">
            Amount ({raw.default_amount_unit || 'ml'})
          </label>
          <input
            id="ldfeed-flush-amount"
            className="ld-dose-note"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={flushAmount}
            onChange={(e) => setFlushAmount(e.target.value)}
          />
        </>
      ) : (
        <div className="ldfeed-editor em-inline">
          <IntakeItemsEditor
            patient={patient}
            items={rows}
            onChange={setRows}
            title="What was given"
            target={feedTarget(raw)}
            targetLabel={raw?.name}
            idPrefix="ldfeed"
          />
          {raw?.flush_components?.length > 0 && (
            <p className="ldfeed-flush-hint">
              {raw.flush_components
                .map((c) => `${c.item_name} (${c.amount} ${c.amount_unit})`)
                .join(' + ')}{' '}
              will be scheduled as a flush after this feed.
            </p>
          )}
        </div>
      )}

      <label className="ld-dose-detail-label" htmlFor="ldfeed-note">
        Add note (optional)
      </label>
      <textarea
        id="ldfeed-note"
        className="ld-dose-note"
        rows={2}
        maxLength={500}
        value={note}
        placeholder="Anything worth recording with this item"
        onChange={(e) => setNote(e.target.value)}
      />

      <button
        type="button"
        className="ld-dose-btn primary block"
        disabled={busy || !canRecord}
        onClick={() => onRecord && onRecord(item, {
          note: note.trim() || undefined,
          ...(isFlush
            ? { amount: Number(flushAmount) }
            : { items: rows }),
        })}
      >
        {busy ? 'Saving…' : (isFlush ? 'Run flush' : 'Mark taken')}
      </button>

      <div className="ld-dose-detail-actions">
        <span className="ld-dose-detail-label">Other actions</span>
        {isFlush && onSkipFlush && (
          <button
            type="button"
            className="ld-dose-action"
            disabled={busy}
            onClick={() => onSkipFlush(item, { note: note.trim() || undefined })}
          >
            <span>
              Skip
              <em>Recorded as skipped — not needed today</em>
            </span>
            <ChevronRightIcon size={16} />
          </button>
        )}
        <button
          type="button"
          className="ld-dose-action"
          onClick={() => navigate('/care/nutrition/schedule')}
        >
          <span>Correct schedule</span>
          <ChevronRightIcon size={16} />
        </button>
        {!!raw?.schedule_id && (
          <button
            type="button"
            className="ld-dose-action"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <span>{historyOpen ? 'Hide history' : 'View history'}</span>
            <ChevronRightIcon size={16} />
          </button>
        )}
      </div>

      {historyOpen && (
        <div className="ld-dose-history">
          {historyError && <p className="ld-dose-history-empty">Could not load history.</p>}
          {!historyError && history === null && <p className="ld-dose-history-empty">Loading…</p>}
          {!historyError && history?.length === 0 && (
            <p className="ld-dose-history-empty">Nothing recorded yet.</p>
          )}
          {!historyError && history?.map((row) => (
            <div key={row.id} className="ld-dose-history-row">
              <span className="ld-dose-history-when">{fmtDateTime(row.consumed_at)}</span>
              <span className="ld-dose-history-status given">Taken</span>
              {row.amount != null && (
                <span className="ld-dose-history-dose">
                  {row.amount}{row.amount_unit ? ` ${row.amount_unit}` : ''}
                </span>
              )}
              {row.notes && <span className="ld-dose-history-note">{row.notes}</span>}
            </div>
          ))}
        </div>
      )}

      {recordingAs && (
        <p className="ld-dose-detail-footer">Recording as {recordingAs}</p>
      )}
    </div>
  );
}
