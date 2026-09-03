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

/* Folds ScheduleList's six-value status taxonomy (see scheduleStatus.js) into
 * the four buckets the dose panel reports: what was given, what is coming due,
 * what was missed, what was skipped.
 *
 * This is a *presentation* rollup only. It deliberately does not redefine when
 * something is missed — `computeScheduleStatus` owns that, and the backend
 * already carries three status taxonomies that disagree with each other. A
 * fourth would be worse than the two we have.
 */

// Order matters: it is the order the tiles appear, and the order attention is
// paid to. `due_late` never comes out of computeScheduleStatus today but is in
// ScheduleList's declared taxonomy, so it is mapped rather than left to fall
// through to the default.
const STATUS_BUCKET = {
  completed: 'given',
  skipped: 'skipped',
  missed: 'missed',
  pending: 'due',
  upcoming: 'due',
  due_on_time: 'due',
  due_warning: 'due',
  due_late: 'due',
};

export const BUCKETS = ['given', 'due', 'missed', 'skipped'];

export const BUCKET_LABELS = {
  given: 'Given',
  due: 'Due',
  missed: 'Missed',
  skipped: 'Skipped',
};

/** Which of the four tiles an item belongs under. Unknown statuses count as due
 *  rather than vanishing — an unrecognised state still needs a human to look. */
export function bucketFor(status) {
  return STATUS_BUCKET[status] || 'due';
}

/**
 * Roll a list of normalized schedule items up into tile counts plus the subset
 * that still wants a caregiver: anything missed or due, missed first, then
 * oldest scheduled time first within each.
 */
export function rollupSchedule(items = []) {
  const counts = { given: 0, due: 0, missed: 0, skipped: 0 };
  const attention = [];

  for (const item of items) {
    const bucket = bucketFor(item.status);
    counts[bucket] += 1;
    if (bucket === 'missed' || bucket === 'due') attention.push(item);
  }

  // An unparseable scheduled_time would make the comparator return NaN, which
  // leaves the sort order up to the engine. Undated items sort last here, the
  // same place groupBySlot puts them.
  const at = (item) => {
    const t = item.scheduled_time ? new Date(item.scheduled_time).getTime() : NaN;
    return Number.isNaN(t) ? Infinity : t;
  };
  attention.sort((a, b) => {
    const aMissed = bucketFor(a.status) === 'missed';
    const bMissed = bucketFor(b.status) === 'missed';
    if (aMissed !== bMissed) return aMissed ? -1 : 1;
    return at(a) - at(b);
  });

  return {
    counts,
    total: items.length,
    needsAttention: attention,
    // The headline the narrow panel leads with: what is worst, and when.
    lead: attention.length ? { item: attention[0], bucket: bucketFor(attention[0].status) } : null,
  };
}

/** "08:00" in the viewer's local clock, from an item's scheduled_time. */
export function slotLabel(scheduledTime) {
  // Guard falsy explicitly: `new Date(null)` is epoch 0, a perfectly valid
  // date, so a missing time would otherwise be labelled with the local epoch
  // hour and grouped under it.
  if (!scheduledTime) return '';
  const d = new Date(scheduledTime);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Group items by their local time slot, earliest first — the "08:00 · 2
 * MEDICATIONS" bands in both layouts. Items whose scheduled_time is unparseable
 * are kept in a trailing slot rather than dropped.
 */
export function groupBySlot(items = []) {
  const slots = new Map();
  for (const item of items) {
    const key = slotLabel(item.scheduled_time);
    if (!slots.has(key)) slots.set(key, []);
    slots.get(key).push(item);
  }
  return [...slots.entries()]
    .map(([time, slotItems]) => ({ time, items: slotItems }))
    .sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });
}

/**
 * Day, then time slot. `/api/schedule/daily?include_prior_day=true` returns
 * yesterday's uncompleted doses alongside today's so nothing missed drops off
 * the board — but a bare time grouping would merge yesterday's 08:00 into
 * today's, which reads as duplicate rows of the same medication.
 *
 * Yesterday sorts first: it is the older debt, and it is what "missed" means.
 */
export function groupByDaySlot(items = []) {
  const yesterday = items.filter(i => i.is_yesterday);
  const today = items.filter(i => !i.is_yesterday);
  return [
    { day: 'yesterday', label: 'Yesterday', slots: groupBySlot(yesterday) },
    { day: 'today', label: 'Today', slots: groupBySlot(today) },
  ].filter(group => group.slots.length > 0);
}

// Recurrence text from the API spells out every weekday and repeats the time
// ("Sun, Mon, Tue, Wed, Thu, Fri, Sat at 08:00"). The slot header already
// carries the time, so trim it and collapse a full week to "Daily".
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function recurrenceLabel(description) {
  const text = (description || '').trim();
  if (!text) return '';
  const withoutTime = text.replace(/\s+at\s+\d{1,2}:\d{2}\s*(am|pm)?$/i, '').trim();
  const days = withoutTime.split(/[,\s]+/).map(d => d.toLowerCase().slice(0, 3)).filter(Boolean);
  if (days.length === 7 && WEEKDAYS.every(d => days.includes(d))) return 'Daily';
  return withoutTime;
}
