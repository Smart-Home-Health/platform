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
// What a message *is*, separated from how it is drawn. Both surfaces — the
// admin page and the dashboard panel — read their labels, grouping, source
// filter and follow-up link from here, so the two can't drift.
//
// Only two types exist today (`low_medication` from the generator, `general`
// from a manual broadcast), but the type column is a free string, so anything
// unknown degrades to a humanised label rather than disappearing.

export const SEVERITY = {
  critical: { key: 'critical', label: 'Critical' },
  warning: { key: 'warning', label: 'Warning' },
  info: { key: 'info', label: 'Info' },
};

export function severityOf(message) {
  return SEVERITY[message?.severity] || SEVERITY.info;
}

/* `group` decides which heading a message files under; `icon` is a key the
 * card maps to an SVG (never an emoji). */
export const CATEGORIES = {
  low_medication: { label: 'Medication inventory', icon: 'medication', group: 'system' },
  general: { label: 'Manual message', icon: 'message', group: 'other' },
};

export function humanizeType(type) {
  const words = String(type || '').replace(/[_-]+/g, ' ').trim();
  if (!words) return 'Message';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function categoryOf(message) {
  const type = message?.type || 'general';
  return CATEGORIES[type] || { label: humanizeType(type), icon: 'system', group: 'system' };
}

/* The three states a message can be read in. 'active' is the only one with
 * actions on it; the other two are archive. */
export const STATUS_TABS = [
  { value: 'active', label: 'Active' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'resolved', label: 'Resolved' },
];

export const GROUPS = [
  // Anything a generator raised comes first: it reflects a live condition and
  // usually has an action behind it. Hand-written broadcasts follow.
  { key: 'system', label: 'System messages' },
  { key: 'other', label: 'Other' },
];

export function groupMessages(items) {
  const list = Array.isArray(items) ? items : [];
  return GROUPS
    .map(g => ({ ...g, items: list.filter(m => categoryOf(m).group === g.key) }))
    .filter(g => g.items.length > 0);
}

/* Source options come from the messages actually in hand rather than a fixed
 * list — a type nothing has raised is not a filter worth offering. */
export function sourceOptions(items) {
  const list = Array.isArray(items) ? items : [];
  const seen = new Map();
  list.forEach(m => {
    const type = m?.type || 'general';
    if (!seen.has(type)) seen.set(type, categoryOf(m).label);
  });
  return [
    { value: 'all', label: 'All sources' },
    ...[...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label })),
  ];
}

export function filterBySource(items, source) {
  const list = Array.isArray(items) ? items : [];
  if (!source || source === 'all') return list;
  return list.filter(m => (m?.type || 'general') === source);
}

export function formatWhen(iso) {
  if (!iso) return 'Created recently';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Created recently';
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

/* Who clearing it acts for. The distinction matters: on a shared wall display
 * one person dismissing an 'anyone' message clears it for the whole household. */
export function scopeLabel(message) {
  return message?.ack_scope === 'per_user' ? 'Each person acknowledges' : 'For everyone';
}

export function snoozeNote(message, now = Date.now()) {
  if (!message?.snoozed_until) return null;
  const until = new Date(message.snoozed_until);
  if (Number.isNaN(until.getTime()) || until.getTime() <= now) return null;
  return `Snoozed until ${formatWhen(message.snoozed_until)}`;
}

export const SNOOZE_OPTIONS = [
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '1 day', minutes: 1440 },
];

/* The follow-up a message points at. Low-stock is the only generated type so
 * far, and the manage page already takes `?patient=`, so the link lands on the
 * medication list for the right patient. `medication_name` is written by the
 * generator; messages raised before that shipped fall back to a generic label
 * rather than rendering "Review undefined". */
export function reviewLink(message) {
  if (message?.type !== 'low_medication') return null;
  const name = message?.data?.medication_name;
  const patientId = message?.patient_id ?? message?.data?.patient_id;
  return {
    label: name ? `Review ${name}` : 'Review medication',
    to: `/care/medications/manage${patientId ? `?patient=${patientId}` : ''}`,
  };
}

/* The primary action a message allows. A message that clears itself has none —
 * saying so is more useful than a disabled button. */
export function primaryAction(message) {
  if (message?.dismissible) {
    return { key: 'dismiss', label: message?.ack_scope === 'per_user' ? 'Acknowledge' : 'Dismiss' };
  }
  return null;
}
