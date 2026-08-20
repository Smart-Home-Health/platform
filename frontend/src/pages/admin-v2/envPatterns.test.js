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
// Reading the correlation cards. The claims worth pinning are about what the
// UI is allowed to say: a cell that is still gathering must say how far along
// it is, and a ratio whose interval spans 1 must not read as a finding.
import { describe, it, expect } from 'vitest';
import {
  pivotCards, cellStateOf, collectionProgress, stillCollecting, observedPatterns,
  MIN_EXPOSED_HOURS, MIN_BASELINE_HOURS, MIN_TOTAL_EVENTS,
} from './envPatterns';

const card = (over = {}) => ({
  exposure: { key: 'pressure_drop_6h', label: 'Pressure ↓ ≥4 / 6h', metric: 'pressure_delta_6h', quality: 'measured' },
  outcome: { key: 'spo2_alarms', label: 'SpO2 alarms' },
  status: 'ok',
  rate_ratio: 2.1,
  ci_low: 1.1,
  ci_high: 4.0,
  exposed_hours: 40,
  baseline_hours: 400,
  exposed_events: 6,
  baseline_events: 20,
  ...over,
});

describe('cellStateOf', () => {
  it('reports a ratio whose interval clears 1 as a pattern', () => {
    expect(cellStateOf(card())).toMatchObject({ kind: 'pattern', ratio: 2.1 });
  });

  it('reports a ratio whose interval spans 1 as no clear difference', () => {
    // 1.3× looks like something until you see the interval crosses 1.
    expect(cellStateOf(card({ rate_ratio: 1.3, ci_low: 0.8, ci_high: 2.2 })))
      .toMatchObject({ kind: 'no-difference', ratio: 1.3 });
  });

  it('reports a protective interval as a pattern too', () => {
    expect(cellStateOf(card({ rate_ratio: 0.4, ci_low: 0.2, ci_high: 0.8 })).kind)
      .toBe('pattern');
  });

  it('distinguishes a pair never analysed from one still gathering', () => {
    expect(cellStateOf(undefined)).toEqual({ kind: 'absent' });
    expect(cellStateOf(card({ status: 'insufficient_data' })).kind).toBe('collecting');
  });
});

describe('collectionProgress', () => {
  it('tracks the exposure gate first', () => {
    const p = collectionProgress(card({ status: 'insufficient_data', exposed_hours: 20 }));
    expect(p).toEqual({ have: 20, need: MIN_EXPOSED_HOURS, unit: 'h', of: 'exposure' });
  });

  it('moves to the baseline gate once exposure is met', () => {
    const p = collectionProgress(card({
      status: 'insufficient_data', exposed_hours: 40, baseline_hours: 100,
    }));
    expect(p).toEqual({ have: 100, need: MIN_BASELINE_HOURS, unit: 'h', of: 'baseline' });
  });

  it('moves to the event gate once both hour gates are met', () => {
    const p = collectionProgress(card({
      status: 'insufficient_data', exposed_hours: 40, baseline_hours: 400,
      exposed_events: 1, baseline_events: 1,
    }));
    expect(p).toEqual({ have: 2, need: MIN_TOTAL_EVENTS, unit: '', of: 'events' });
  });

  it('has no progress to show for a metric with no observations at all', () => {
    // The backend returns this before it counts anything; a bar at 0/24h would
    // imply collection has started when the metric is simply absent.
    expect(collectionProgress({ status: 'insufficient_data', message: 'No pressure data yet.' }))
      .toBeNull();
  });

  it('has no progress for a card that succeeded', () => {
    expect(collectionProgress(card())).toBeNull();
  });
});

describe('pivotCards', () => {
  const cards = [
    card(),
    card({ outcome: { key: 'care_events', label: 'Care events' }, status: 'insufficient_data', exposed_hours: 20 }),
    card({
      exposure: { key: 'pressure_drop_24h', label: 'Pressure ↓ ≥6 / 24h', metric: 'pressure_delta_24h', quality: 'estimated' },
      rate_ratio: 1.3, ci_low: 0.8, ci_high: 2.2,
    }),
  ];

  it('builds a trigger by outcome grid', () => {
    const { rows, outcomes } = pivotCards(cards);
    expect(rows.map((r) => r.key)).toEqual(['pressure_drop_6h', 'pressure_drop_24h']);
    expect(outcomes.map((o) => o.key)).toEqual(['spo2_alarms', 'care_events']);
    expect(rows[0].cells.spo2_alarms.rate_ratio).toBe(2.1);
  });

  it('leaves a cell missing rather than inventing one', () => {
    const { rows } = pivotCards(cards);
    expect(rows[1].cells.care_events).toBeUndefined();
    expect(cellStateOf(rows[1].cells.care_events).kind).toBe('absent');
  });

  it('carries the estimated-metric marker through', () => {
    const { rows } = pivotCards(cards);
    expect(rows[0].estimated).toBe(false);
    expect(rows[1].estimated).toBe(true);
  });

  it('keeps first-appearance order so the grid does not reshuffle', () => {
    const reversed = pivotCards([cards[2], cards[1], cards[0]]);
    expect(reversed.rows.map((r) => r.key)).toEqual(['pressure_drop_24h', 'pressure_drop_6h']);
  });

  it('survives a missing or malformed payload', () => {
    expect(pivotCards(null)).toEqual({ outcomes: [], rows: [] });
    expect(pivotCards([{ nonsense: true }])).toEqual({ outcomes: [], rows: [] });
  });
});

describe('summaries', () => {
  it('counts what is still gathering', () => {
    expect(stillCollecting([card(), card({ status: 'insufficient_data' })])).toBe(1);
    expect(stillCollecting(null)).toBe(0);
  });

  it('surfaces only the pairs that cleared the interval', () => {
    const found = observedPatterns([
      card(),
      card({ rate_ratio: 1.3, ci_low: 0.8, ci_high: 2.2 }),
      card({ status: 'insufficient_data' }),
    ]);
    expect(found).toHaveLength(1);
  });
});
