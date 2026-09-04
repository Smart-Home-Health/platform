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
// Weekly summary. Canvas is mocked; what matters is that the week navigates,
// that each vital gets its own readable chart (with the day's range behind the
// average), and that the shared summary says what the week was.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { chartInstances } = vi.hoisted(() => ({ chartInstances: [] }));

vi.mock('chart.js/auto', () => {
  class MockChart {
    constructor(ctx, config) { this.config = config; chartInstances.push(this); }
    destroy() {}
  }
  MockChart.register = () => {};
  return { default: MockChart };
});
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch: (...a) => fetch(...a) }));
vi.mock('../../hooks/useChartColors', () => ({
  useChartColors: () => ({ grid: '#303030', axis: '#999999', cutout: '#161616', foreground: '#ffffff' }),
}));
vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../contexts/AdminPatientContext', () => {
  const selectedPatient = { id: 2, first_name: 'Elijah', last_name: 'Carty' };
  return { useAdminPatient: () => ({ selectedPatient }) };
});
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

import AdminV2ReportsWeekly from './AdminV2ReportsWeekly';

const SETTINGS = { min_spo2: 90, max_spo2: 100, min_bpm: 55, max_bpm: 155 };

const payload = (over = {}) => ({
  period: { start: '2026-05-20', end: '2026-05-26' },
  vitals: {
    spo2: {
      min: 55, avg: 96.6, max: 100,
      daily: [
        { date: '2026-05-20', avg: 96, low: 55, high: 100 },
        { date: '2026-05-21', avg: 97, low: 92, high: 100 },
      ],
    },
    heart_rate: { min: 43, avg: 80.5, max: 150, daily: [{ date: '2026-05-20', avg: 80, low: 43, high: 150 }] },
    respiratory_rate: { min: null, avg: null, max: null, daily: [] },
    temperature: { min: null, avg: null, max: null, daily: [] },
    weight: { min: null, avg: null, max: null, daily: [] },
  },
  compliance: {
    medications: { total_scheduled: 107, administered: 108, on_time: 25, late: 100, skipped: 0, missed: 17 },
    care_tasks: { total_scheduled: 35, completed: 30, skipped: 2, missed: 3 },
    overall_pct: 88,
  },
  nutrition: {
    daily: [{ date: '2026-05-20', calories: 1500 }],
    goals: { calories_target: 1575 }, avg_calories: 1575, avg_fluid_ml: 1200,
  },
  alerts: {
    total: 180, total_duration_minutes: 640, by_type: {},
    daily_counts: [{ date: '2026-05-20', count: 16 }, { date: '2026-05-21', count: 58 }],
  },
  equipment_due: [],
  symptoms: { new: [], unresolved_count: 0, resolved_count: 0 },
  ...over,
});

let body;
const calls = [];

beforeEach(() => {
  chartInstances.length = 0;
  calls.length = 0;
  navigate.mockClear();
  body = payload();
  vi.setSystemTime(new Date('2026-05-26T10:00:00'));
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/api/settings')) return { ok: true, json: async () => SETTINGS };
    return { ok: true, json: async () => body };
  }));
});

const setup = () => render(<AdminV2ReportsWeekly />);
const lastCall = () => calls.filter(u => u.includes('weekly-summary')).pop();

describe('AdminV2ReportsWeekly', () => {
  it('opens on the week ending today and can step back but not forward', async () => {
    setup();
    await waitFor(() => expect(lastCall()).toContain('end_date=2026-05-26'));
    expect(await screen.findByText('May 20–26, 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Next week')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Previous week'));
    await waitFor(() => expect(lastCall()).toContain('end_date=2026-05-19'));
    expect(screen.getByLabelText('Next week')).not.toBeDisabled();
  });

  it('reports the week in four figures', async () => {
    setup();
    await screen.findByText('Care completion');
    expect(document.querySelector('[data-stat="care"] .rpt-stat-value').textContent).toBe('88%');
    expect(document.querySelector('[data-stat="alerts"] .rpt-stat-value').textContent).toBe('180');
    expect(document.querySelector('[data-stat="calories"] .rpt-stat-value').textContent).toBe('1,575');
    expect(document.querySelector('[data-stat="equipment"] .rpt-stat-note').textContent).toBe('Nothing due');
  });

  it('gives every recorded vital its own chart and skips the empty ones', async () => {
    setup();
    await screen.findByText('Care completion');
    // Two vitals with readings + nutrition + alerts.
    expect(document.querySelectorAll('.wk-vital-plot canvas')).toHaveLength(2);
    expect(screen.getByText('SpO2')).toBeInTheDocument();
    expect(screen.queryByText('Temperature')).not.toBeInTheDocument();
  });

  it('draws the day range behind the average, not just a line of means', async () => {
    setup();
    await screen.findByText('Care completion');
    const spo2Chart = chartInstances[0];
    const labels = spo2Chart.config.data.datasets.map(d => d.label);
    expect(labels).toEqual(['High', 'Low', 'SpO2 avg']);
    expect(spo2Chart.config.data.datasets[0].fill).toBe('+1');
    // Seven points whatever the API returned, so a missing day stays a gap.
    expect(spo2Chart.config.data.datasets[2].data).toHaveLength(7);
    expect(spo2Chart.config.data.datasets[2].data[2]).toBeNull();
  });

  it('can drop the range band when it swamps the line', async () => {
    setup();
    await screen.findByText('Care completion');
    const bands = () => chartInstances[chartInstances.length - 1]; // last built chart
    fireEvent.click(screen.getByLabelText('Daily range'));
    await waitFor(() => {
      const spo2 = chartInstances.slice().reverse().find(c => c.config.data.datasets.some(d => d.label === 'SpO2 avg'));
      expect(spo2.config.data.datasets.map(d => d.label)).toEqual(['SpO2 avg']);
    });
    expect(bands()).toBeTruthy();
  });

  it('marks the configured alarm and the day that went under it', async () => {
    setup();
    await screen.findByText('Care completion');
    // The alarm thresholds come from a second fetch (/api/settings) and the
    // charts rebuild when they land, so the first instance built may predate
    // them. Read the latest chart per vital and wait for the annotations.
    const latest = (label) => chartInstances.slice().reverse()
      .find(c => c.config.data.datasets.some(d => d.label === `${label} avg`));
    await waitFor(() => {
      const ann = latest('SpO2').config.options.plugins.annotation.annotations;
      expect(ann.alarm).toMatchObject({ yMin: 90 });
      expect(ann.worst).toMatchObject({ yValue: 55 });
    });
    // Heart rate has no configured alarm on this page, so no line.
    expect(latest('Heart rate').config.options.plugins.annotation.annotations.alarm).toBeUndefined();
  });

  it('splits care into medications and care tasks, and keeps adherence amber', async () => {
    setup();
    await screen.findByText('Care completion');
    expect(screen.getByText('Medications')).toBeInTheDocument();
    expect(screen.getByText('Care tasks')).toBeInTheDocument();
    expect(document.querySelectorAll('.wk-seg.warn').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.wk-seg.breach')).toHaveLength(0);
  });

  it('names the busiest alert day', async () => {
    setup();
    await screen.findByText('Alert activity');
    expect(screen.getByText(/Busiest Thu May 21 · 58 triggers/)).toBeInTheDocument();
  });

  it('says a section is empty rather than drawing an empty chart', async () => {
    body = payload({ nutrition: { daily: [], goals: {}, avg_calories: null, avg_fluid_ml: null } });
    setup();
    expect(await screen.findByText('No meals logged this week')).toBeInTheDocument();
    expect(screen.getByText('Nothing logged')).toBeInTheDocument();
  });

  it('lists overdue equipment', async () => {
    body = payload({ equipment_due: [{ name: 'Trach Tube', due_date: '2026-07-10', days_overdue: 39 }] });
    setup();
    expect(await screen.findByText('Trach Tube')).toBeInTheDocument();
    expect(screen.getByText('39d overdue')).toBeInTheDocument();
  });

  it('sends a vital to day over day', async () => {
    setup();
    await screen.findByText('Care completion');
    fireEvent.click(screen.getAllByText('Compare days')[0]);
    expect(navigate).toHaveBeenCalledWith('/care/reports/day-over-day?vital=spo2');
  });

  it('copies the week when the device cannot share', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    setup();
    await screen.findByText('Share summary');
    fireEvent.click(screen.getByText('Share summary'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0];
    expect(text).toContain('Elijah Carty · Week of May 20–26, 2026');
    expect(text).toContain('SpO2: avg 96.6% · range 55–100% (under the 90% alarm)');
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
  });

  it('surfaces a failed week', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/settings')) return { ok: true, json: async () => SETTINGS };
      return { ok: false, status: 500, json: async () => ({ detail: 'Weekly failed' }) };
    }));
    setup();
    expect(await screen.findByText('Weekly failed')).toBeInTheDocument();
  });
});
