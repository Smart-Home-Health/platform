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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

const { chartInstances } = vi.hoisted(() => ({ chartInstances: [] }));

vi.mock('chart.js/auto', () => {
  class MockChart {
    constructor(ctx, config) {
      this.config = config;
      chartInstances.push(this);
    }
    destroy() {}
    resetZoom() {}
    update() {}
  }
  MockChart.register = () => {};
  return { default: MockChart };
});
vi.mock('chartjs-adapter-date-fns', () => ({}));
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }));
vi.mock('chartjs-plugin-zoom', () => ({ default: {} }));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch: vi.fn() }));
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
  await act(async () => {
    render(<AdminV2MonitoringEnvironment />);
    // Flush the 300ms debounce on the series fetch
    await new Promise((r) => setTimeout(r, 350));
  });
};

beforeEach(() => {
  chartInstances.length = 0;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true, status: 200, json: async () => route(url),
  })));
});

const latestChart = () => chartInstances[chartInstances.length - 1];

describe('AdminV2MonitoringEnvironment', () => {
  it('shows the informational disclaimer and metric/event chips', async () => {
    await renderPage();
    expect(screen.getByText(/Informational only/)).toBeInTheDocument();
    expect(screen.getByText(/not a basis for care decisions/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Barometric pressure/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /SpO2 alarms \(1\)/ })).toBeInTheDocument();
  });

  it('derived metrics plot dashed; alert boxes land in the annotations', async () => {
    await renderPage();
    await waitFor(() => {
      const chart = latestChart();
      const delta = chart.config.data.datasets.find((d) => d.label === 'Pressure change over 6h (hPa)');
      expect(delta.borderDash).toEqual([6, 4]);
      const pressure = chart.config.data.datasets.find((d) => d.label === 'Barometric pressure (surface) (hPa)');
      expect(pressure.borderDash).toEqual([]);
      const annotations = chart.config.options.plugins.annotation.annotations;
      expect(annotations.spo2_alarms_0.type).toBe('box');
      expect(annotations.respiratory_care_0.type).toBe('line');
    });
  });

  it('renders an ok correlation card and an honest insufficient one', async () => {
    await renderPage();
    expect(await screen.findByText('2.1×')).toBeInTheDocument();
    // Appears in both the stat line and the backend-built message
    expect(screen.getAllByText(/95% CI 1.1–4.0/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Pattern observed')).toBeInTheDocument();
    expect(screen.getByText(/Counted tasks: Cough Assist, Suction/)).toBeInTheDocument();
    expect(screen.getByText('Not enough data yet')).toBeInTheDocument();
    expect(screen.getByText(/2 of 5 needed/)).toBeInTheDocument();
  });

  it('changing the range preset refetches with the new days', async () => {
    await renderPage();
    fetch.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '90d' }));
      await new Promise((r) => setTimeout(r, 350));
    });
    await waitFor(() => {
      const corrCall = fetch.mock.calls
        .map((c) => String(c[0])).find((u) => u.includes('/env-correlations'));
      expect(corrCall).toContain('days=90');
    });
  });

  it('room picker stays disabled while only outdoor data exists', async () => {
    await renderPage();
    const select = screen.getByTitle('Room sensors not set up yet');
    expect(select).toBeDisabled();
  });
});
