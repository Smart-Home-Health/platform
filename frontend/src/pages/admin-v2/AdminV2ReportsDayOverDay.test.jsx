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
// Day over day. The canvas is mocked away — what is worth pinning is the day
// selection (colour slots, the seven-day cap), that the request reflects the
// controls, and that the table under the chart says what the data says.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { chartInstances } = vi.hoisted(() => ({ chartInstances: [] }));

vi.mock('chart.js/auto', () => {
  class MockChart {
    constructor(ctx, config) { this.config = config; chartInstances.push(this); }
    destroy() {}
    update() {}
  }
  MockChart.register = () => {};
  return { default: MockChart };
});
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }));
vi.mock('chartjs-plugin-zoom', () => ({ default: {} }));
vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: (...args) => fetch(...args),
}));
vi.mock('../../hooks/useChartColors', () => ({
  useChartColors: () => ({ grid: '#303030', axis: '#999999', cutout: '#161616', foreground: '#ffffff' }),
}));

import AdminV2ReportsDayOverDay from './AdminV2ReportsDayOverDay';

const SETTINGS = { min_spo2: 90, max_spo2: 100, min_bpm: 55, max_bpm: 155 };

// Aug 2026: the 1st is a Saturday, so 2/3/4 are Sun/Mon/Tue as in the report.
const dayPayload = (date, avg, low) => ({
  date,
  source: 'pulse_ox',
  hourly: Array.from({ length: 24 }, (_, hour) => ({
    hour, avg, min: hour === 6 ? low : avg, max: avg, count: 100,
  })),
});

let reportBody;
const calls = [];

beforeEach(() => {
  chartInstances.length = 0;
  calls.length = 0;
  reportBody = {
    vital_type: 'spo2',
    unit: '%',
    aggregation: 'hour',
    days: [dayPayload('2026-08-02', 97, 94), dayPayload('2026-08-03', 96, 88)],
  };
  vi.setSystemTime(new Date('2026-08-18T12:00:00'));
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/api/settings')) {
      return { ok: true, json: async () => SETTINGS };
    }
    return { ok: true, json: async () => reportBody };
  }));
});

const pickDay = async (dayNumber) => {
  fireEvent.click(screen.getByText('Add day'));
  const cal = await screen.findByText('Add a day');
  const sheet = cal.closest('.vc-sheet') || document.body;
  fireEvent.click(within(sheet).getByRole('button', { name: String(dayNumber) }));
};

// The page reads `?vital=` (the weekly summary links here per vital), so it
// needs a router around it.
const setup = (route = '/care/reports/day-over-day') => render(
  <MemoryRouter initialEntries={[route]}>
    <AdminV2ReportsDayOverDay patientId={2} />
  </MemoryRouter>
);

describe('AdminV2ReportsDayOverDay', () => {
  it('asks for a day before it asks the API for anything', async () => {
    setup();
    expect(screen.getByText('Add a day to compare')).toBeInTheDocument();
    await waitFor(() => expect(calls.some(u => u.includes('/api/settings'))).toBe(true));
    expect(calls.some(u => u.includes('day-over-day'))).toBe(false);
  });

  it('queries the selected days, vital and aggregation', async () => {
    setup();
    await pickDay(2);
    await pickDay(3);
    await waitFor(() => expect(calls.some(u => u.includes('day-over-day'))).toBe(true));
    const last = calls.filter(u => u.includes('day-over-day')).pop();
    expect(last).toContain('dates=2026-08-02%2C2026-08-03');
    expect(last).toContain('vital_type=spo2');
    expect(last).toContain('aggregation=hour');
    expect(last).toContain('patient_id=2');
  });

  it('summarizes each day and marks the one that breached the alarm', async () => {
    setup();
    await pickDay(2);
    await pickDay(3);
    const rows = await screen.findAllByText(/Aug [23]$/);
    expect(rows.length).toBeGreaterThan(0);
    // 88% on Aug 3 is under the configured 90% floor; 94% on Aug 2 is not.
    await waitFor(() => expect(document.querySelectorAll('.rpt-breach')).toHaveLength(1));
    expect(document.querySelector('.rpt-breach').textContent).toBe('88%');
  });

  it('counts coverage in hours', async () => {
    setup();
    await pickDay(2);
    await waitFor(() => expect(screen.getAllByText('24h').length).toBeGreaterThan(0));
  });

  it('gives each day its own series colour and hands a freed one back', async () => {
    setup();
    await pickDay(2);
    await pickDay(3);
    const colors = () => [...document.querySelectorAll('.dod-chips .dod-chip')]
      .map(c => c.style.getPropertyValue('--dod-series'));
    expect(colors()).toEqual(['#4da7bd', '#3fbf6a']);

    fireEvent.click(screen.getByLabelText('Remove Sun Aug 2'));
    await pickDay(4);
    // Aug 3 keeps green; the new day takes the cyan slot Aug 2 gave up.
    expect(colors()).toEqual(['#3fbf6a', '#4da7bd']);
  });

  it('stops at seven days and says so', async () => {
    setup();
    for (const d of [2, 3, 4, 5, 6, 7, 8]) await pickDay(d);
    expect(screen.getByText('7 day maximum')).toBeInTheDocument();
    expect(screen.getByText(/7 days is the maximum/)).toBeInTheDocument();
  });

  it('will not let a future day be picked', async () => {
    setup();
    fireEvent.click(screen.getByText('Add day'));
    const sheet = (await screen.findByText('Add a day')).closest('.vc-sheet');
    expect(within(sheet).getByRole('button', { name: '19' })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: '18' })).not.toBeDisabled();
  });

  it('narrows the hours, and says the window it is showing', async () => {
    setup();
    await pickDay(2);
    await screen.findAllByText('24h');
    fireEvent.click(screen.getByLabelText('Filters'));
    const sheet = await waitFor(() => {
      const el = document.querySelector('.vc-sheet');
      if (!el) throw new Error('sheet not open');
      return el;
    });
    fireEvent.change(within(sheet).getByLabelText('First hour'), { target: { value: '6' } });
    fireEvent.change(within(sheet).getByLabelText('Last hour'), { target: { value: '11' } });
    expect(screen.getByText(/6 AM–11 AM/)).toBeInTheDocument();
    // Six hours in the window, so six hours of coverage — no refetch needed.
    await waitFor(() => expect(screen.getAllByText('6h').length).toBeGreaterThan(0));
  });

  it('swaps the chart for the buckets behind it', async () => {
    setup();
    await pickDay(2);
    await screen.findByText('View data');
    fireEvent.click(screen.getByText('View data'));
    expect(document.querySelector('.dod-data-table')).toBeInTheDocument();
    expect(screen.getByText('View chart')).toBeInTheDocument();
  });

  it('plots one series per day, in that day\'s colour', async () => {
    setup();
    await pickDay(2);
    await pickDay(3);
    await waitFor(() => expect(chartInstances.length).toBeGreaterThan(0));
    const last = chartInstances[chartInstances.length - 1];
    expect(last.config.data.datasets).toHaveLength(2);
    expect(last.config.data.datasets.map(d => d.borderColor)).toEqual(['#4da7bd', '#3fbf6a']);
  });

  it('draws the configured alarm as an annotation, not an invented reference', async () => {
    setup();
    await pickDay(2);
    await waitFor(() => expect(chartInstances.length).toBeGreaterThan(0));
    const last = chartInstances[chartInstances.length - 1];
    expect(last.config.options.plugins.annotation.annotations.low).toMatchObject({ yMin: 90, yMax: 90 });
  });

  it('opens on the vital the weekly summary linked to', async () => {
    setup('/care/reports/day-over-day?vital=heart_rate');
    await pickDay(2);
    await waitFor(() => expect(calls.some(u => u.includes('day-over-day'))).toBe(true));
    expect(calls.filter(u => u.includes('day-over-day')).pop()).toContain('vital_type=heart_rate');
  });

  it('ignores a vital it does not have', async () => {
    setup('/care/reports/day-over-day?vital=telepathy');
    await pickDay(2);
    await waitFor(() => expect(calls.some(u => u.includes('day-over-day'))).toBe(true));
    expect(calls.filter(u => u.includes('day-over-day')).pop()).toContain('vital_type=spo2');
  });

  it('surfaces a failed report instead of an empty chart', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/settings')) return { ok: true, json: async () => SETTINGS };
      return { ok: false, status: 500, json: async () => ({ detail: 'Report failed' }) };
    }));
    setup();
    await pickDay(2);
    expect(await screen.findByText('Report failed')).toBeInTheDocument();
  });
});
