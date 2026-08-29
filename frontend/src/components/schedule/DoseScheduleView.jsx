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
// A day's scheduled items at both dock stops. Same items, two readings:
//
//   narrow (the cards column, ~300-400px) — triage. What is overdue, at what
//     time, and a way to record it without leaving the board.
//   expanded (across the charts) — the day's four counts, a time-grouped table,
//     and a detail pane for whichever dose is selected.
//
// Size comes from the dock (useModalDock), never from window.innerWidth: the
// panel is ~380px wide on a 1920px screen, so a viewport test reports "desktop"
// exactly where the narrow layout is wanted. That mismatch is why ScheduleList
// reads wrong in the dock today.
import { useMemo } from 'react';
import { useModalDock } from '../../contexts/ModalDockContext';
import { ChevronLeftIcon } from '../Icons';
import {
  BUCKETS, BUCKET_LABELS, bucketFor, groupByDaySlot, recurrenceLabel, rollupSchedule, slotLabel,
} from './scheduleRollup';
import { DOSE_LABELS } from './scheduleLabels';
import './schedule-panel.css';

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

function StatusBadge({ status }) {
  const bucket = bucketFor(status);
  return (
    <span className={`ld-dose-badge ${bucket}`}>
      {bucket !== 'given' && bucket !== 'skipped' && <span className="ld-dose-dot" aria-hidden="true" />}
      {STATUS_TEXT[status] || status}
    </span>
  );
}

/* The middle column: a dose for medications, a category chip for care tasks. */
function ItemMeta({ item }) {
  if (item.category) {
    return (
      <span className="ld-dose-chip" style={{ '--chip': item.category.color || 'var(--vc-text-tertiary)' }}>
        {item.category.name}
      </span>
    );
  }
  return item.extra ? <span className="ld-dose-amount">{item.extra}</span> : null;
}

/* "Daily · 08:00" — the schedule line. */
function scheduleLine(item) {
  const time = slotLabel(item.scheduled_time);
  const recurrence = recurrenceLabel(item.description);
  return recurrence ? `${recurrence} · ${time}` : time;
}

export default function DoseScheduleView({
  items = [],
  loading = false,
  emptyText = 'No scheduled doses today',
  labels = DOSE_LABELS,
  selectedId = null,
  onSelect,
  onRecord,
  onSkip,
  onRecordAll,
  detail = null,
}) {
  const { docked, expanded, setExpanded } = useModalDock();
  // Side-by-side needs room, which only the expanded dock stop has. A phone is
  // never wide — it fills a 390px screen and has no expand control, so it must
  // not be handed the table just because a dose got selected.
  const wide = docked && expanded;
  // With no room beside the list, the detail takes the panel and the list steps
  // back — the same move AlertDetailInline makes inside AlertsList.
  const stackedDetail = !docked && detail && selectedId;

  const { counts, needsAttention, lead } = useMemo(() => rollupSchedule(items), [items]);
  const days = useMemo(() => groupByDaySlot(items), [items]);

  // Tapping a dose opens its details. In the dock that means widening first,
  // since the pane lives beside the list; on a phone the pane replaces it.
  const openDetail = (item) => {
    if (onSelect) onSelect(item);
    if (docked && !expanded && setExpanded) setExpanded(true);
  };

  if (loading) {
    return <div className="ld-dose-empty">Loading schedule…</div>;
  }
  if (items.length === 0) {
    return <div className="ld-dose-empty">{emptyText}</div>;
  }

  if (stackedDetail) {
    return (
      <div className="ld-dose-panel stacked">
        <button
          type="button"
          className="ld-dose-back"
          onClick={() => onSelect && onSelect(null)}
        >
          <ChevronLeftIcon size={16} />
          Back to schedule
        </button>
        {detail}
      </div>
    );
  }

  if (!wide) {
    return (
      <div className="ld-dose-panel narrow">
        {lead && (
          <div className="ld-dose-lead">
            <span className={`ld-dose-lead-count ${lead.bucket}`}>
              {counts.missed > 0 ? `${counts.missed} missed` : `${counts.due} due`}
              {' · '}
              {slotLabel(lead.item.scheduled_time)}
            </span>
            {onRecordAll && needsAttention.length > 0 && (
              <button
                type="button"
                className="ld-dose-linkbtn"
                onClick={() => onRecordAll(needsAttention)}
              >
                {labels.bulk}
              </button>
            )}
          </div>
        )}
        <div className="ld-dose-subcount">
          {needsAttention.length} of {items.length} need attention
        </div>

        {days.map((day) => (
          <div key={day.day} className="ld-dose-day">
            {days.length > 1 && <div className="ld-dose-day-head">{day.label}</div>}
            {day.slots.map((slot) => {
              const open = slot.items.filter((i) => !i.is_completed);
              return (
                <div key={slot.time || 'unscheduled'} className="ld-dose-slot">
                  {/* Time bands, not one long run of cards: the times are what a
                      caregiver scans by, and reading them off each card is
                      slower than reading them off a header. */}
                  <div className="ld-dose-slot-head">
                    <span className="ld-dose-slot-time">{slot.time || 'Unscheduled'}</span>
                    <span className="ld-dose-slot-count">{slot.items.length}</span>
                    {onRecordAll && open.length > 0 && (
                      <button
                        type="button"
                        className="ld-dose-linkbtn"
                        onClick={() => onRecordAll(open)}
                      >
                        {labels.bulk}
                      </button>
                    )}
                  </div>

                  <div className="ld-dose-cards">
                    {slot.items.map((item) => (
                      <div
                        key={item.id}
                        className={`ld-dose-card ${bucketFor(item.status)}${item.id === selectedId ? ' selected' : ''}`}
                      >
                        <button
                          type="button"
                          className="ld-dose-card-body"
                          onClick={() => openDetail(item)}
                          aria-label={`${item.name}, ${STATUS_TEXT[item.status] || item.status}. Open details.`}
                        >
                          <span className="ld-dose-card-head">
                            <span className="ld-dose-name">{item.name}</span>
                            <StatusBadge status={item.status} />
                          </span>
                          <ItemMeta item={item} />
                          <span className="ld-dose-schedule">{recurrenceLabel(item.description)}</span>
                        </button>
                        {!item.is_completed && (
                          <div className="ld-dose-card-actions">
                            {onRecord && (
                              <button
                                type="button"
                                className="ld-dose-btn primary"
                                onClick={(e) => { e.stopPropagation(); onRecord(item); }}
                              >
                                {labels.primary}
                              </button>
                            )}
                            {/* can_skip narrows the view-wide handler to rows
                                that are actually skippable (nutrition flush
                                follow-ups); callers that never set it keep
                                their skip button on every row. */}
                            {onSkip && item.can_skip !== false && (
                              <button
                                type="button"
                                className="ld-dose-btn ghost"
                                onClick={(e) => { e.stopPropagation(); onSkip(item); }}
                                aria-label={`Skip ${item.name}`}
                                title="Skip dose"
                              >
                                Skip
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="ld-dose-panel wide">
      <div className="ld-dose-main">
        <div className="ld-dose-tiles">
          {BUCKETS.map((bucket) => (
            <div
              key={bucket}
              className={`ld-dose-tile ${bucket}${bucket === 'missed' && counts.missed > 0 ? ' alert' : ''}`}
            >
              <span className="ld-dose-tile-label">{BUCKET_LABELS[bucket]}</span>
              <span className="ld-dose-tile-count">{counts[bucket]}</span>
            </div>
          ))}
        </div>

        {days.map((day) => (
          <div key={day.day} className="ld-dose-day">
            {days.length > 1 && <div className="ld-dose-day-head">{day.label}</div>}
            {day.slots.map((slot) => {
              const open = slot.items.filter((i) => !i.is_completed);
              return (
                <div key={slot.time || 'unscheduled'} className="ld-dose-slot">
                  <div className="ld-dose-slot-head">
                    <span className="ld-dose-slot-time">{slot.time || 'Unscheduled'}</span>
                    <span className="ld-dose-slot-count">
                      {slot.items.length} {slot.items.length === 1 ? labels.one : labels.many}
                    </span>
                    {onRecordAll && open.length > 0 && (
                      <button
                        type="button"
                        className="ld-dose-linkbtn"
                        onClick={() => onRecordAll(open)}
                      >
                        {labels.bulk}
                      </button>
                    )}
                  </div>

                  <table className="ld-dose-table">
                    <thead>
                      <tr>
                        <th>{labels.nameColumn}</th>
                        <th>{labels.metaColumn}</th>
                        <th>Schedule</th>
                        <th>Status</th>
                        <th className="ld-dose-actions-col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slot.items.map((item) => (
                        <tr
                          key={item.id}
                          className={item.id === selectedId ? 'selected' : ''}
                          onClick={() => onSelect && onSelect(item)}
                        >
                          <th scope="row">
                            {/* The button exists to make the row reachable by
                                keyboard — a <tr> is not focusable. Its click
                                (including the one Enter/Space synthesises)
                                bubbles to the row's handler, so it deliberately
                                carries none of its own; a second handler here
                                would select twice per click. */}
                            <button type="button" className="ld-dose-rowbtn">
                              {item.name}
                            </button>
                          </th>
                          <td><ItemMeta item={item} /></td>
                          <td>{scheduleLine(item)}</td>
                          <td><StatusBadge status={item.status} /></td>
                          <td className="ld-dose-actions-col">
                            {!item.is_completed && onRecord && (
                              <button
                                type="button"
                                className="ld-dose-btn primary sm"
                                onClick={(e) => { e.stopPropagation(); onRecord(item); }}
                              >
                                {labels.primary}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {detail && <div className="ld-dose-side">{detail}</div>}
    </div>
  );
}
