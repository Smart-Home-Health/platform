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

/**
 * Single source of truth for the time-based status used by ScheduleList across
 * the medication / nutrition / care-task dashboard modals. Items come from the
 * unified `/api/schedule/daily` endpoint, which carries `completed`, `skipped`
 * (medications), `status` (care tasks: completed|skipped|partial), `is_yesterday`,
 * and a real-UTC `scheduled_time`.
 *
 * Returns ScheduleList's taxonomy:
 *   'skipped' | 'completed' | 'missed' | 'pending' | 'due_on_time' | 'due_warning'
 */
export function computeScheduleStatus(item) {
  // Terminal states recorded by the backend win over any time computation.
  if (item.skipped || item.status === 'skipped') return 'skipped';
  if (item.completed) return 'completed';
  if (item.is_yesterday) return 'missed';

  const diffMin = (new Date(item.scheduled_time) - new Date()) / 60000; // +future
  if (diffMin > 15) return 'pending';
  if (diffMin > -15) return 'due_on_time';
  if (diffMin > -60) return 'due_warning';
  return 'missed';
}

/**
 * Grace-period doses. The backend flags an unfilled past dose that is still
 * actionable with `in_grace`, `overdue_minutes` and `grace_expires_at`
 * (see backend/crud/dose_grace.py). Its status stays 'missed' — the item is
 * missed, it just has not lapsed yet — and these helpers give the cue.
 */

/** "45m" / "14h" / "3d" from minutes overdue. Days once past 48h, hours past 90m. */
export function formatOverdue(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m >= 48 * 60) return `${Math.floor(m / (24 * 60))}d`;
  if (m >= 90) return `${Math.floor(m / 60)}h`;
  return `${m}m`;
}

/** Badge text for an in-grace item: "Overdue · 3d". Null for anything else. */
export function overdueLabel(item) {
  if (!item?.in_grace) return null;
  return `Overdue · ${formatOverdue(item.overdue_minutes)}`;
}

const fmtWhen = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

/** Hover text: when it was due and how long it stays actionable. */
export function graceTitle(item) {
  if (!item?.in_grace) return undefined;
  const due = fmtWhen(item.scheduled_time);
  const until = fmtWhen(item.grace_expires_at);
  const parts = [];
  if (due) parts.push(`Originally due ${due}`);
  if (until) parts.push(`grace expires ${until}`);
  return parts.length ? parts.join('; ') : undefined;
}
