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
// What a shipment's status means, in one place.
//
// The label, the tone and the position on the progress rail were each written
// out separately on the list page and the detail page, so a status could read
// one way in the table and another on the page it linked to.
//
// The vocabulary here is the one the server actually writes, which is not the
// one the old UI displayed:
//
//   draft      create_shipment's default — the list is still being built
//   ordered    create_delivery_from_template, or the UI marking a draft placed
//   shipped    add_shipment_item sets this when a line ships from an 'ordered'
//   receiving  the first receipt lands
//   complete   finalize, no discrepancies
//   partial    finalize, with discrepancies
//
// 'verified' appears in a model comment and in the old UI's badge map, but no
// backend path sets it, so it is not a state a shipment can be found in and is
// deliberately absent here. There is no 'delivered' or 'received' either —
// arrival is 'receiving' until finalize decides complete vs partial.

/** The rail drawn on a shipment card, in order. */
export const SHIPMENT_STEPS = ['Built', 'Ordered', 'Shipped', 'Received'];

// step: how far along the rail this status sits.
// done: the step is finished rather than in progress.
const STATUS = {
  draft: {
    label: 'Draft', tone: 'due', step: 0, done: false,
    open: true, blurb: 'Still being built',
  },
  ordered: {
    label: 'Ordered', tone: 'accent', step: 1, done: true,
    open: true, blurb: 'Placed with the supplier',
  },
  shipped: {
    label: 'Shipped', tone: 'accent', step: 2, done: true,
    open: true, blurb: 'On its way',
  },
  receiving: {
    label: 'Receiving', tone: 'accent', step: 3, done: false,
    open: true, blurb: 'Arrived, being checked in',
  },
  complete: {
    label: 'Received', tone: 'complete', step: 3, done: true,
    open: false, blurb: 'Everything arrived',
  },
  partial: {
    label: 'Partial', tone: 'due', step: 3, done: true,
    open: false, blurb: 'Arrived with discrepancies',
  },
};

// A status the server has never been known to write still has to render as
// something rather than crash the row.
const UNKNOWN = {
  label: 'Unknown', tone: 'idle', step: 0, done: false, open: true, blurb: '',
};

export function statusInfo(status) {
  return STATUS[status] || { ...UNKNOWN, label: status || 'Unknown' };
}

export const statusLabel = (status) => statusInfo(status).label;
export const statusTone = (status) => statusInfo(status).tone;

/** Statuses offered as filters, in lifecycle order. */
export const STATUS_FILTERS = ['draft', 'ordered', 'shipped', 'receiving', 'complete', 'partial'];

/** A shipment still moving through the lifecycle (vs one that has landed). */
export const isOpen = (shipment) => statusInfo(shipment?.status).open;

/** Finalized, whatever the outcome — the record is closed and stops accepting receipts. */
export const isFinalized = (shipment) => Boolean(shipment?.finalized_at);

/**
 * The rail state for one shipment: each step marked done / current / todo.
 *
 * A finalized shipment fills the rail regardless of how far the status got,
 * because finalize is the end of the road even when it lands on 'partial'.
 */
export function stepStates(shipment) {
  const { step, done } = statusInfo(shipment?.status);
  const finalized = isFinalized(shipment);
  return SHIPMENT_STEPS.map((label, index) => {
    if (finalized || index < step || (index === step && done)) return { label, state: 'done' };
    if (index === step) return { label, state: 'current' };
    return { label, state: 'todo' };
  });
}

/**
 * Whether this shipment wants someone's attention.
 *
 * Two independent reasons, both from the server's own record rather than a
 * rule invented here: it finalized with discrepancies, or it has alerts
 * nobody has resolved.
 */
export function needsAttention(shipment) {
  if (!shipment) return false;
  if (shipment.status === 'partial') return true;
  return (shipment.unresolved_alert_count || 0) > 0;
}

/**
 * Where the three tabs of the detail wizard sit for a given status.
 * Build the list, confirm it was placed and is travelling, then receive it.
 */
export const DETAIL_STEPS = [
  { key: 'build', label: 'Build list' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'receive', label: 'Receive' },
];

export function detailStep(shipment) {
  const status = shipment?.status;
  if (isFinalized(shipment)) return 'receive';
  if (status === 'draft') return 'build';
  if (status === 'receiving') return 'receive';
  return 'shipping';
}
