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
// The ventilator day. What matters here: the pinned parameters lead, the rest
// are one row each, provenance is flagged without claiming correctness, and
// unpinning everything is respected rather than overwritten by the defaults.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

const { charts } = vi.hoisted(() => ({ charts: [] }));

vi.mock('chart.js/auto', () => {
  class MockChart {
    constructor(ctx, cfg) {
      this.config = cfg;
      this.options = cfg.options;
      this.data = cfg.data;
      this.destroyed = false;
      charts.push(this);
    }
    update() {}
    destroy() { this.destroyed = true; }
  }
  MockChart.register = () => {};
  return { default: MockChart };
});
vi.mock('chartjs-adapter-date-fns', () => ({}));
vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: (...args) => fetch(...args),
}));

import AdminV2MonitoringVentilator from './AdminV2MonitoringVentilator';

const DAY = '2026-05-31';

const p = (key, label, over = {}) => ({
  parameter_key: key,
  display_label: label,
  display_units: 'BPM',
  display_type: 'NumericMonitor',
  grouping: 'Ventilation',
  scale_factor: 1.0,
  precision: 1,
  total_samples: 30,
  stats_by_suffix: {
    5: { n: 10, lo: 0, hi: 20, mean: 12 },
    50: { n: 10, lo: 0, hi: 31, mean: 25 },
    95: { n: 10, lo: 20, hi: 45, mean: 41 },
  },
  ...over,
});

const dayPayload = {
  date: DAY,
  summary: {
    total_samples: 55834, parameter_count: 5,
    first_at: `${DAY}T20:00:00Z`, last_at: `${DAY}T20:44:00Z`,
  },
  groups: [
    {
      name: 'Ventilation',
      parameters: [
        p('9408', 'BREATH RATE'),
        p('9406', 'VTE', { display_units: 'mL' }),
        // No median series — the device sent a single value.
        p('9404', 'PEEP', {
          display_units: 'cmH2O',
          stats_by_suffix: { N: { n: 26, lo: 0, hi: 3029, mean: 370 } },
        }),
        // Not in the vendor dictionary: the API echoes the key as the label.
        p('16011', '16011', {
          display_type: null, display_units: null, scale_factor: null,
          stats_by_suffix: { N: { n: 4, lo: 1, hi: 9, mean: 5 } },
        }),
      ],
    },
    {
      name: 'Oxygen',
      parameters: [p('16003', 'OA2 O2 Delivered', { display_units: '%', precision: 1 })],
    },
  ],
};

const daysPayload = {
  has_integration: true,
  days: [
    { date: DAY, sample_count: 55834 },
    { date: '2026-05-30', sample_count: 55741 },
  ],
};

const seriesPayload = {
  points: [
    { ts: `${DAY}T20:00:00Z`, p50: 25, p5: 12, p95: 41, n: 3 },
    { ts: `${DAY}T20:15:00Z`, p50: 26, p5: 13, p95: 42, n: 3 },
  ],
};

let pinsPayload;
let daysBody;
let dayBody;
const calls = [];
let putBodies = [];

beforeEach(() => {
  charts.length = 0;
  calls.length = 0;
  putBodies = [];
  daysBody = daysPayload;
  dayBody = dayPayload;
  pinsPayload = { patient_id: 5, vendor: 'vocsn', source: 'default',
    parameter_keys: ['9408', '9406'] };

  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/vent/pins')) {
      if (opts?.method === 'PUT') {
        const body = JSON.parse(opts.body);
        putBodies.push(body);
        pinsPayload = { ...pinsPayload, source: 'patient',
          parameter_keys: body.parameter_keys };
        return { ok: true, json: async () => pinsPayload };
      }
      return { ok: true, json: async () => pinsPayload };
    }
    if (u.includes('/vent/days')) return { ok: true, json: async () => daysBody };
    if (u.includes('/parameter/')) return { ok: true, json: async () => seriesPayload };
    if (u.includes('/vent/day/')) return { ok: true, json: async () => dayBody };
    return { ok: true, json: async () => ({}) };
  }));
  HTMLCanvasElement.prototype.getContext = () => ({});
});
afterEach(() => { vi.unstubAllGlobals(); });

const renderPage = async () => {
  const utils = render(<AdminV2MonitoringVentilator patientId={5} />);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return utils;
};

const listRows = () => document.querySelectorAll('.vnt-row');
// "Oxygen" names both a filter chip and a group header; scope by which.
const groupHeader = (name) => [...document.querySelectorAll('.vnt-group-head')]
  .find((b) => b.textContent.trim().startsWith(name));
const groupChip = (name) => within(document.querySelector('.vnt-controls'))
  .getByRole('button', { name: new RegExp(`^${name}\\b`) });

describe('the day at a glance', () => {
  it('summarises the day from the payload', async () => {
    await renderPage();
    const stats = document.querySelector('.vnt-stats');
    expect(within(stats).getByText('55,834')).toBeInTheDocument();
    expect(within(stats).getByText('5')).toBeInTheDocument();
  });

  it('counts the parameters wanting a look', async () => {
    await renderPage();
    // PEEP (raw only) and 16011 (unknown) — not VTE or breath rate.
    const review = document.querySelectorAll('.vnt-stat')[3];
    expect(within(review).getByText('2')).toBeInTheDocument();
  });

  it('offers the day pager over the days that have samples', async () => {
    await renderPage();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Newer day' })).toBeDisabled();
  });
});

describe('one row per parameter', () => {
  it('renders every parameter as a row, not a card', async () => {
    await renderPage();
    // Groups collapse past the first, so open Oxygen too.
    expect(listRows().length).toBe(4);
    await act(async () => { fireEvent.click(groupHeader('Oxygen')); });
    expect(listRows().length).toBe(5);
  });

  it('leads each row with the median value and its own range', async () => {
    await renderPage();
    const row = listRows()[0];
    expect(within(row).getByText('25.0')).toBeInTheDocument();
    expect(within(row).getByText('0.0–31.0')).toBeInTheDocument();
  });

  it('says where a value came from without saying it is right', async () => {
    await renderPage();
    const rows = [...listRows()];
    const peep = rows.find((r) => r.textContent.includes('PEEP'));
    expect(within(peep).getByText('Raw only')).toBeInTheDocument();
    // Nothing anywhere claims a parameter has been verified.
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it('flags an unknown parameter once rather than three times', async () => {
    await renderPage();
    const rows = [...listRows()];
    const unknown = rows.find((r) => r.textContent.includes('16011'));
    expect(within(unknown).getByText('Unknown parameter')).toBeInTheDocument();
    expect(within(unknown).queryByText('No units')).not.toBeInTheDocument();
    expect(within(unknown).queryByText('No scale')).not.toBeInTheDocument();
  });

  it('says the numbers are medians rather than the day’s extremes', async () => {
    await renderPage();
    expect(screen.getByText(/average of the device.s per-window medians/i))
      .toBeInTheDocument();
  });
});

describe('finding a parameter', () => {
  it('searches label and vendor key', async () => {
    await renderPage();
    const search = screen.getByRole('searchbox', { name: 'Search parameters' });
    await act(async () => { fireEvent.change(search, { target: { value: 'vte' } }); });
    expect(listRows().length).toBe(1);
    await act(async () => { fireEvent.change(search, { target: { value: '16003' } }); });
    expect(listRows().length).toBe(1);
  });

  it('opens collapsed groups while filtering, so a hit is never hidden', async () => {
    await renderPage();
    const search = screen.getByRole('searchbox', { name: 'Search parameters' });
    // 16003 lives in Oxygen, which is collapsed on load.
    await act(async () => { fireEvent.change(search, { target: { value: 'O2' } }); });
    expect(document.querySelector('.vnt-row').textContent).toContain('OA2 O2 Delivered');
  });

  it('filters to the parameters needing review', async () => {
    await renderPage();
    const reviewStat = document.querySelectorAll('.vnt-stat')[3];
    await act(async () => { fireEvent.click(reviewStat); });
    const text = [...listRows()].map((r) => r.textContent).join(' ');
    expect(text).toContain('PEEP');
    expect(text).toContain('16011');
    expect(text).not.toContain('BREATH RATE');
  });

  it('filters by group', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(groupChip('Oxygen')); });
    expect(listRows().length).toBe(1);
  });
});

describe('pinning', () => {
  it('leads with the pinned parameters', async () => {
    await renderPage();
    const pinned = document.querySelector('.vnt-pins');
    expect(within(pinned).getByText('BREATH RATE')).toBeInTheDocument();
    expect(within(pinned).getByText('VTE')).toBeInTheDocument();
    expect(within(pinned).queryByText('PEEP')).not.toBeInTheDocument();
  });

  it('charts only the pinned series, not every parameter', async () => {
    await renderPage();
    const series = calls.filter((c) => c.includes('/parameter/'));
    expect(series).toHaveLength(2);
    expect(series.every((c) => /\/parameter\/(9408|9406)$/.test(c))).toBe(true);
  });

  it('pinning a row sends the new set', async () => {
    await renderPage();
    const rows = [...listRows()];
    const peep = rows.find((r) => r.textContent.includes('PEEP'));
    await act(async () => {
      fireEvent.click(within(peep).getByRole('button', { name: /^Pin PEEP/ }));
    });
    expect(putBodies.at(-1).parameter_keys).toEqual(['9408', '9406', '9404']);
  });

  it('unpinning the last one sends an empty set rather than nothing', async () => {
    // The server treats an empty list as a choice; sending no request would
    // leave the defaults in place and the star would spring back.
    await renderPage();
    for (const key of ['BREATH RATE', 'VTE']) {
      const row = [...listRows()].find((r) => r.textContent.includes(key));
      await act(async () => {
        fireEvent.click(within(row).getByRole('button', { name: new RegExp(`^Unpin ${key}`) }));
      });
    }
    expect(putBodies.at(-1).parameter_keys).toEqual([]);
    expect(document.querySelector('.vnt-pins')).toBeNull();
  });

  it('shows a pin that produced nothing today as absent, not missing', async () => {
    pinsPayload = { ...pinsPayload, source: 'patient', parameter_keys: ['9408', '99999'] };
    await renderPage();
    const pinned = document.querySelector('.vnt-pins');
    expect(within(pinned).getByText('#99999')).toBeInTheDocument();
    expect(within(pinned).getByText('no samples today')).toBeInTheDocument();
  });
});

describe('the drill-down', () => {
  it('charts the median inside its percentile band', async () => {
    await renderPage();
    const before = charts.length;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /BREATH RATE #9408/ }));
    });
    await act(async () => { await Promise.resolve(); });
    const chart = charts[charts.length - 1];
    expect(charts.length).toBeGreaterThan(before);
    const labels = chart.data.datasets.map((d) => d.label);
    expect(labels).toEqual(['5th percentile', '95th percentile', 'Median']);
    // The band is two lines filling to each other — Chart.js has no range type.
    expect(chart.data.datasets[1].fill).toBe('-1');
  });
});

describe('empty states', () => {
  it('points at Integrations when the patient has no ventilator', async () => {
    daysBody = { has_integration: false, days: [] };
    await renderPage();
    expect(screen.getByText(/no ventilator integration yet/i)).toBeInTheDocument();
  });

  it('points at the Logs panel when nothing has been parsed', async () => {
    daysBody = { has_integration: true, days: [] };
    await renderPage();
    expect(screen.getByText(/No ventilator samples have been parsed/i)).toBeInTheDocument();
  });
});
