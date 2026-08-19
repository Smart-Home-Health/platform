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
// Three separate records — scheduled changes, stocktakes, and deliveries —
// read as one history, because that is how the day actually went.
//
// Each source keeps its own vocabulary in its own table; this is the one
// place that translates them into a single event shape, so the timeline does
// not learn three dialects the way the old pages learned two.
//
// On grouping: several changes logged by one person on one day are shown as
// one entry. That is a *display* grouping and is worded as one ("3 changes
// logged by John"), not as a claim they were performed as a single action —
// nothing in the schema records that association, since changes are logged
// one item at a time. If that association is ever worth asserting, it wants a
// real id on the row, the way nutrition's event_group_id replaced re-merging
// output rows by a time window.

export const EVENT_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'change', label: 'Changes' },
  { value: 'delivery', label: 'Deliveries' },
  { value: 'stock', label: 'Stock' },
  { value: 'note', label: 'Notes' },
];

export const RANGES = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last year' },
  { value: 0, label: 'Everything' },
];

const dayKey = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** One scheduled change becomes one event; the caller groups them after. */
function changeEvents(changes = []) {
  return changes.map((c) => ({
    id: `change-${c.id}`,
    kind: 'change',
    at: c.changed_at,
    who: c.changed_by_name || null,
    title: c.equipment_name || 'Equipment',
    note: c.notes || null,
    equipmentId: c.equipment_id,
  }));
}

/**
 * A stocktake. Which direction it went is the point, so it is resolved here
 * rather than left for the row to work out from two numbers.
 */
function stockEvents(counts = []) {
  return counts.map((c) => {
    const before = c.quantity_before ?? 0;
    const after = c.quantity_after ?? 0;
    return {
      id: `stock-${c.id}`,
      kind: 'stock',
      at: c.counted_at,
      who: c.counted_by_name || null,
      title: c.equipment_name || 'Supply',
      note: c.note || null,
      equipmentId: c.equipment_id,
      before,
      after,
      delta: after - before,
      direction: after === before ? 'same' : (after > before ? 'up' : 'down'),
    };
  });
}

/**
 * A delivery enters the history when it actually landed, not when it was
 * created — a draft raised in June and received in August belongs in August.
 * Shipments that never landed are left out entirely rather than dated by
 * something that is not an arrival.
 */
function deliveryEvents(shipments = []) {
  return shipments
    .map((s) => {
      const at = s.actual_delivery || s.finalized_at;
      if (!at) return null;
      return {
        id: `delivery-${s.id}`,
        kind: 'delivery',
        at,
        who: null,
        title: s.supplier_name || 'Delivery',
        reference: s.order_number || s.po_number || `#${s.id}`,
        itemCount: s.item_count ?? 0,
        status: s.status,
        shipmentId: s.id,
      };
    })
    .filter(Boolean);
}

/**
 * Changes by one person on one day collapse into a single entry.
 *
 * Deliberately keyed on the calendar day and the person, not on a tolerance
 * around a timestamp: a window would be a rule invented here, and this is a
 * grouping for reading, not a claim about how the work was done.
 */
export function groupChanges(events = []) {
  const groups = new Map();
  const out = [];
  for (const event of events) {
    if (event.kind !== 'change') { out.push(event); continue; }
    const key = `${dayKey(event.at)}|${event.who || 'unknown'}`;
    if (!groups.has(key)) {
      const group = {
        id: `changeset-${key}`,
        kind: 'change',
        at: event.at,
        who: event.who,
        items: [],
      };
      groups.set(key, group);
      out.push(group);
    }
    const group = groups.get(key);
    group.items.push(event);
    // The set is dated by its most recent change.
    if (new Date(event.at) > new Date(group.at)) group.at = event.at;
  }
  return out;
}

/** Does this event carry something somebody wrote down? */
export const hasNote = (event) => Boolean(
  event.note || (event.items || []).some((i) => i.note),
);

/**
 * Filter by the chips. 'note' is not a source of its own — it is any event
 * that carries a written note, which is why it can overlap the others.
 */
export function filterEvents(events = [], { type = 'all', search = '' } = {}) {
  const needle = search.trim().toLowerCase();
  return events.filter((event) => {
    if (type === 'note' && !hasNote(event)) return false;
    if (type !== 'all' && type !== 'note' && event.kind !== type) return false;
    if (!needle) return true;
    const haystack = [
      event.title, event.reference, event.note, event.who,
      ...(event.items || []).flatMap((i) => [i.title, i.note]),
    ];
    return haystack.some((v) => String(v || '').toLowerCase().includes(needle));
  });
}

/** Events on or after the cutoff. A range of 0 means everything. */
export function withinRange(events = [], days = 90, today = new Date()) {
  if (!days) return events;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  return events.filter((e) => new Date(e.at) >= cutoff);
}

/** The merged timeline, newest first. */
export function buildTimeline({ changes = [], counts = [], shipments = [] } = {}) {
  const merged = [
    ...changeEvents(changes),
    ...stockEvents(counts),
    ...deliveryEvents(shipments),
  ].filter((e) => e.at && !Number.isNaN(new Date(e.at).getTime()));

  merged.sort((a, b) => new Date(b.at) - new Date(a.at));
  return groupChanges(merged);
}

/** Events bucketed by calendar day, newest day first, for the date gutter. */
export function byDay(events = []) {
  const days = new Map();
  for (const event of events) {
    const key = dayKey(event.at);
    if (!key) continue;
    if (!days.has(key)) days.set(key, { key, date: new Date(event.at), events: [] });
    days.get(key).events.push(event);
  }
  return [...days.values()].sort((a, b) => b.date - a.date);
}

/** "12 events · May 21–Aug 19" — the span actually shown. */
export function timelineSummary(events = []) {
  if (events.length === 0) return { count: 0, from: null, to: null };
  const times = events.map((e) => new Date(e.at)).sort((a, b) => a - b);
  return { count: events.length, from: times[0], to: times[times.length - 1] };
}

/** One row per event, for the CSV export. */
export function toCsvRows(events = []) {
  const rows = [['When', 'Type', 'What', 'Detail', 'Who']];
  for (const event of events) {
    if (event.kind === 'change' && event.items) {
      // A set exports as its members: a row that says "3 changes" is not
      // something a spreadsheet can do anything with.
      for (const item of event.items) {
        rows.push([item.at, 'Change', item.title, item.note || '', item.who || '']);
      }
      continue;
    }
    if (event.kind === 'stock') {
      rows.push([event.at, 'Stock', event.title,
        `${event.before} → ${event.after}${event.note ? ` (${event.note})` : ''}`,
        event.who || '']);
      continue;
    }
    rows.push([event.at, 'Delivery', event.title,
      `${event.reference} · ${event.itemCount} items`, event.who || '']);
  }
  return rows;
}

export function toCsv(events = []) {
  return toCsvRows(events)
    .map((row) => row.map((cell) => {
      const value = String(cell ?? '');
      return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }).join(','))
    .join('\n');
}
