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
// Reading the environmental correlation cards.
//
// The API returns one card per (exposure, outcome) pair, which as a flat list
// buries the thing worth seeing: most pairs are still gathering data, and you
// cannot tell how close any of them is. Pivoting to a trigger × outcome grid
// puts coverage on one screen, and reading the backend's own counts back out
// says how far along each cell is instead of a flat "not enough data".
//
// Nothing here decides whether an association is real — the backend owns that,
// and its answer is deliberately hedged. A pattern that clears the confidence
// interval is still an association in observational data.

/* The thresholds the analysis applies before it will report a ratio. Mirrored
 * from backend/analysis/env_correlation.py; a cell shows progress against
 * whichever one it is currently short of. */
export const MIN_EXPOSED_HOURS = 24;
export const MIN_BASELINE_HOURS = 168;
export const MIN_TOTAL_EVENTS = 5;

/** How far a still-collecting cell has got, and towards what.
 *
 * The checks run in the backend's order, so the bar tracks the gate the cell
 * is actually stuck behind rather than the first one that happens to be
 * incomplete. Returns null when nothing countable has started yet — a metric
 * with no observations at all has no progress to show, only a reason. */
export function collectionProgress(card) {
  if (!card || card.status === 'ok') return null;
  const exposed = card.exposed_hours;
  const baseline = card.baseline_hours;
  if (exposed == null) return null;

  if (exposed < MIN_EXPOSED_HOURS) {
    return { have: exposed, need: MIN_EXPOSED_HOURS, unit: 'h', of: 'exposure' };
  }
  if (baseline != null && baseline < MIN_BASELINE_HOURS) {
    return { have: baseline, need: MIN_BASELINE_HOURS, unit: 'h', of: 'baseline' };
  }
  const events = (card.exposed_events ?? 0) + (card.baseline_events ?? 0);
  if (card.exposed_events != null && events < MIN_TOTAL_EVENTS) {
    return { have: events, need: MIN_TOTAL_EVENTS, unit: '', of: 'events' };
  }
  return null;
}

/** One cell's verdict, in the terms the UI renders.
 *
 * `distinct` is the backend's confidence interval clearing 1 in one direction.
 * It is deliberately not called "significant": the page says associations do
 * not establish cause, and the wording has to hold that line. */
export function cellStateOf(card) {
  if (!card) return { kind: 'absent' };
  if (card.status !== 'ok') {
    return { kind: 'collecting', progress: collectionProgress(card), message: card.message };
  }
  const distinct = card.ci_low > 1 || card.ci_high < 1;
  return {
    kind: distinct ? 'pattern' : 'no-difference',
    ratio: card.rate_ratio,
    ciLow: card.ci_low,
    ciHigh: card.ci_high,
  };
}

/**
 * Pivot the flat card list into rows of triggers by columns of outcomes.
 *
 * Row and column order follow first appearance rather than being sorted, so
 * the grid matches the order the analysis reports its pairs in and does not
 * reshuffle between refreshes.
 */
export function pivotCards(cards) {
  const list = Array.isArray(cards) ? cards : [];
  const outcomes = [];
  const rows = [];

  list.forEach((card) => {
    const oKey = card.outcome?.key;
    const eKey = card.exposure?.key;
    if (!oKey || !eKey) return;
    if (!outcomes.some((o) => o.key === oKey)) {
      outcomes.push({ key: oKey, label: card.outcome.label });
    }
    let row = rows.find((r) => r.key === eKey);
    if (!row) {
      row = {
        key: eKey,
        label: card.exposure.label,
        metric: card.exposure.metric,
        estimated: card.exposure.quality === 'estimated',
        cells: {},
      };
      rows.push(row);
    }
    row.cells[oKey] = card;
  });

  return { outcomes, rows };
}

/** How many pairs are still gathering, for the footer count. */
export function stillCollecting(cards) {
  return (Array.isArray(cards) ? cards : []).filter((c) => c.status !== 'ok').length;
}

/** Pairs that cleared the interval, worth surfacing above the grid. */
export function observedPatterns(cards) {
  return (Array.isArray(cards) ? cards : [])
    .filter((c) => cellStateOf(c).kind === 'pattern');
}
