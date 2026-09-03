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
// Monitoring → Environment tab: range chart with clinical annotations,
// dashed derived metrics, disabled room picker, and correlation cards with
// honest insufficient-data states.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { chartInstances, apiFetchMock } = vi.hoisted(() => ({
  chartInstances: [],
  apiFetchMock: vi.fn(),
}));

vi.mock('chart.js/auto', () => {
  class MockChart {
    constructor(ctx, config) {
      this.config = config;
      this.options = config.options;
      // Charts are rebuilt on data change, so assertions have to look at the
      // live ones rather than everything ever constructed.
      this.destroyed = false;
      this.scales = {
        x: { min: config.options.scales.x.min, max: config.options.scales.x.max },
      };
      chartInstances.push(this);
    }
    destroy() { this.destroyed = true; }
    resetZoom() {}
    zoomScale(axis, { min, max }) { this.scales[axis] = { min, max }; }
    update() {}
  }
  MockChart.register = () => {};
  return { default: MockChart };
});
vi.mock('chartjs-adapter-date-fns', () => ({}));
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }));
vi.mock('chartjs-plugin-zoom', () => ({ default: {} }));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch: apiFetchMock }));
vi.mock('../../contexts/AdminPatientContext', () => {
  const selectedPatient = { id: 2, first_name: 'Test' };
  return { useAdminPatient: () => ({ selectedPatient }) };
});
vi.mock('../../hooks/useChartColors', () => ({
  useChartColors: () => ({ grid: '#333', axis: '#999', foreground: '#fff' }),
}));

import AdminV2MonitoringEnvironment from './AdminV2MonitoringEnvironment';

const metricsCatalog = [
  { name: 'barometric_pressure', unit: 'hPa', label: 'Barometric pressure (surface)', derived: false },
  { name: 'pressure_delta_6h', unit: 'hPa', label: 'Pressure change over 6h', derived: true },
  { name: 'relative_humidity', unit: '%', label: 'Relative humidity', derived: false },
];

const observations = [
  { ts: '2026-07-14T10:00:00+00:00', metric: 'barometric_pressure', avg: 1004.1, min: 1003.8, max: 1004.5, unit: 'hPa', samples: 1 },
  { ts: '2026-07-14T09:00:00+00:00', metric: 'barometric_pressure', avg: 1005.0, min: 1004.7, max: 1005.2, unit: 'hPa', samples: 1 },
];

const clinicalEvents = {
  from: '2026-06-14T00:00:00+00:00',
  to: '2026-07-14T00:00:00+00:00',
  events: {
    spo2_alarms: [{ ts: '2026-07-13T02:00:00+00:00', end_ts: '2026-07-13T02:10:00+00:00', label: 'SpO2 alarm (min 84)' }],
    oxygen_use: [],
    respiratory_care: [{ ts: '2026-07-12T08:00:00+00:00', end_ts: null, label: 'Suction' }],
    symptoms: [],
  },
  labels: {
    spo2_alarms: 'SpO2 alarms', oxygen_use: 'Supplemental oxygen use',
    respiratory_care: 'Respiratory care events', symptoms: 'Logged symptoms',
  },
};

const correlations = {
  patient_id: 2,
  range: { from: '2026-04-15T00:00:00+00:00', to: '2026-07-14T00:00:00+00:00', days: 30 },
  generated_at: '2026-07-14T12:00:00+00:00',
  source: 'on_demand',
  disclaimer: 'Informational only.',
  cards: [
    {
      exposure: { key: 'pressure_drop_6h', label: 'a pressure drop of 4 hPa or more over 6 hours', metric: 'pressure_delta_6h', comparator: '<=', threshold: -4, unit: 'hPa', quality: 'estimated' },
      outcome: { key: 'respiratory_care', label: 'Respiratory care events', matched_sources: ['Cough Assist', 'Suction'] },
      window_hours: 6, status: 'ok',
      rate_ratio: 2.1, ci_low: 1.1, ci_high: 4.0,
      exposed_hours: 312, baseline_hours: 1621, exposed_events: 14, baseline_events: 35,
      continuity_corrected: false,
      message: 'Respiratory care events were 2.1× more common within 6 hours of a pressure drop of 4 hPa or more (95% CI 1.1–4.0, last 30 days).',
    },
    {
      exposure: { key: 'high_pm25', label: 'PM2.5 at or above 35 µg/m³', metric: 'pm25', comparator: '>=', threshold: 35, unit: 'µg/m³', quality: 'measured' },
      outcome: { key: 'symptoms', label: 'Logged symptoms' },
      window_hours: 6, status: 'insufficient_data',
      message: 'Not enough data yet — 2 of 5 needed logged symptoms in the last 30 days.',
    },
  ],
};

const route = (url) => {
  const u = String(url);
  if (u.includes('/api/environment/metrics')) return metricsCatalog;
  if (u.includes('/api/environment/locations')) return [{ scope: 'outdoor', location: '', last_seen: null, metric_count: 9 }];
  if (u.includes('/api/environment/observations')) return [...observations];
  if (u.includes('/clinical-events')) return clinicalEvents;
  if (u.includes('/env-correlations')) return correlations;
  throw new Error(`Unmocked URL: ${u}`);
};

const renderPage = async () => {
  render(<AdminV2MonitoringEnvironment />);
  // Drive the 300ms debounce on the series fetch rather than sleeping through
  // it: advanceTimersByTimeAsync runs the timer and flushes the promises it
  // starts, so the data has landed by the time the assertions run. A real
  // sleep left that to chance and read an empty page.
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
};

beforeEach(() => {
  // The range window is computed from Date.now(), so the fixtures' July dates
  // only fall inside it against a fixed clock. Only Date is faked — the
  // 300ms debounce on the series fetch still has to run for real.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-14T12:00:00Z'));
  chartInstances.length = 0;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
  // The page must use apiFetch (iframe bearer-token support), never raw
  // fetch — the global fetch stub throws so any regression fails loudly.
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (url) => ({
    ok: true, status: 200, json: async () => route(url),
  }));
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    throw new Error(`raw fetch used instead of apiFetch: ${url}`);
  }));
});

afterEach(() => { vi.useRealTimers(); });


const chartFor = (label) => chartInstances
  .filter((c) => !c.destroyed)
  .find((c) => c.config.data.datasets[0]?.label === label);

describe('the page keeps its clinical footing', () => {
  it('states the full disclaimer, including that it is not a basis for care', async () => {
    await renderPage();
    expect(screen.getByText(/Informational only/)).toBeInTheDocument();
    // The half a shorter rewrite tends to drop.
    expect(screen.getByText(/not a basis for care\s+decisions/)).toBeInTheDocument();
    expect(screen.getByText(/follow the care plan/)).toBeInTheDocument();
  });

  it('says the scope is outdoor rather than leaving it assumed', async () => {
    await renderPage();
    expect(screen.getByTitle('Room sensors not set up yet')).toBeDisabled();
  });
});

describe('the metric stack', () => {
  it('draws one chart per active metric, not one chart with two axes', async () => {
    await renderPage();
    const live = chartInstances.filter((c) => !c.destroyed);
    expect(live).toHaveLength(2);
    expect(live.map((c) => c.config.data.datasets[0].label).sort())
      .toEqual(['Barometric pressure (surface)', 'Pressure change over 6h']);
  });

  it('is no longer capped at two metrics', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Relative humidity/ }));
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(chartInstances.filter((c) => !c.destroyed)).toHaveLength(3);
  });

  it('refuses to empty the stack completely', async () => {
    await renderPage();
    for (const name of [/Pressure change over 6h/, /Barometric pressure/]) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name }));
        await vi.advanceTimersByTimeAsync(400);
      });
    }
    expect(chartInstances.filter((c) => !c.destroyed).length).toBeGreaterThanOrEqual(1);
  });

  it('dashes a derived metric and leaves a measured one solid', async () => {
    await renderPage();
    expect(chartFor('Pressure change over 6h').config.data.datasets[0].borderDash)
      .toEqual([5, 4]);
    expect(chartFor('Barometric pressure (surface)').config.data.datasets[0].borderDash)
      .toEqual([]);
  });

  it('shares one time window and one plot gutter across the stack', async () => {
    await renderPage();
    const live = chartInstances.filter((c) => !c.destroyed);
    const xs = live.map((c) => [c.config.options.scales.x.min, c.config.options.scales.x.max]);
    expect(xs[0]).toEqual(xs[1]);
    // The alignment contract the lanes and scrubber also inset by.
    const widths = live.map((c) => {
      const scale = { width: 0 };
      c.config.options.scales.y.afterFit(scale);
      return scale.width;
    });
    expect(widths).toEqual([52, 52]);
    const css = readFileSync(resolve(__dirname, 'monitoring-environment.css'), 'utf8');
    expect(css).toMatch(/--env-gutter:\s*52px/);
  });

  it('only the bottom chart draws time labels', async () => {
    await renderPage();
    const shown = chartInstances.filter((c) => !c.destroyed)
      .map((c) => c.config.options.scales.x.ticks.display);
    expect(shown).toEqual([false, true]);
  });

  it('marks the zero line on a metric that goes negative', async () => {
    await renderPage();
    const delta = chartFor('Pressure change over 6h');
    expect(delta.config.options.plugins.annotation.annotations.zero).toMatchObject({ yMin: 0 });
    expect(chartFor('Barometric pressure (surface)')
      .config.options.plugins.annotation.annotations.zero).toBeUndefined();
  });
});

describe('clinical events', () => {
  it('puts each stream in its own lane under the charts', async () => {
    await renderPage();
    const lanes = [...document.querySelectorAll('.env-lane-name')].map((n) => n.textContent);
    expect(lanes).toEqual(['SpO2', 'Oxygen', 'Care', 'Symptoms']);
  });

  it('places a marker per event and leaves an empty stream visibly empty', async () => {
    await renderPage();
    const lanes = [...document.querySelectorAll('.env-lane')];
    expect(lanes[0].querySelectorAll('.env-lane-mark')).toHaveLength(1);
    expect(lanes[1].querySelector('.env-lane-empty')).toBeTruthy();
  });

  it('a stream can be switched off', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^SpO2/ }));
    });
    const lanes = [...document.querySelectorAll('.env-lane-name')].map((n) => n.textContent);
    expect(lanes).not.toContain('SpO2');
  });
});

describe('personal patterns', () => {
  it('lays the pairs out as triggers by outcomes', async () => {
    await renderPage();
    const grid = screen.getByRole('table');
    const headers = within(grid).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers[0]).toBe('Trigger');
    expect(headers).toContain('Respiratory care events');
    expect(headers).toContain('Logged symptoms');
  });

  it('shows a ratio that cleared the interval as a pattern', async () => {
    await renderPage();
    expect(screen.getByText('2.1×')).toBeInTheDocument();
    expect(screen.getByText('Pattern observed')).toBeInTheDocument();
  });

  it('says how far a still-collecting pair has got, not just that it is short', async () => {
    await renderPage();
    // The old page said "Not enough data yet" with no sense of progress.
    expect(screen.getByText(/Collecting|Not started/)).toBeInTheDocument();
    expect(screen.getByText(/2 analyses are|1 analysis is/)).toBeInTheDocument();
  });

  it('names its own outcome on every cell, so the phone layout can drop the header', async () => {
    await renderPage();
    // Below 720px the grid reflows into one card per trigger and the header
    // row goes away; a cell with no label would read as an orphaned
    // "Collecting 20/24h", which is exactly what scrolling the table did.
    const cells = [...document.querySelectorAll('.env-cell')];
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((td) => expect(td.getAttribute('data-label')).toBeTruthy());
    expect(cells.map((td) => td.getAttribute('data-label')))
      .toContain('Respiratory care events');
  });

  it('stops scrolling sideways on a phone rather than hiding the trigger', async () => {
    // jsdom does not apply media queries, so the contract is read from source:
    // the reflow and the sticky trigger are what keep a cell attached to its
    // row at either width.
    const css = readFileSync(resolve(__dirname, 'monitoring-environment.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 720px\)/);
    expect(css).toMatch(/\.env-grid-wrap \{ overflow-x: visible; \}/);
    expect(css).toMatch(/content: attr\(data-label\)/);
    // …and on a wide screen the trigger column stays put instead.
    expect(css).toMatch(/\.env-grid-trigger,[\s\S]*?position: sticky/);
  });

  it('keeps the counted care tasks visible for the reader to check', async () => {
    await renderPage();
    const cell = screen.getByText('2.1×').closest('td');
    expect(cell.getAttribute('title')).toContain('Cough Assist, Suction');
    expect(cell.getAttribute('title')).toContain('95% CI 1.1–4.0');
  });
});

describe('range', () => {
  it('refetches the analysis for the chosen range', async () => {
    await renderPage();
    apiFetchMock.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '90D' }));
      await vi.advanceTimersByTimeAsync(400);
    });
    const call = apiFetchMock.mock.calls
      .map((c) => String(c[0])).find((u) => u.includes('/env-correlations'));
    expect(call).toContain('days=90');
  });
});
