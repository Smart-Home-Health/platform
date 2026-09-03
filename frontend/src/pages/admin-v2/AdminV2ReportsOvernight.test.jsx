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
// Overnight report. Canvas is mocked; what matters is that the request follows
// the night and window, that the strip reports what the payload says, and that
// the handoff leaves the page with the right text.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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

import AdminV2ReportsOvernight from './AdminV2ReportsOvernight';

const SETTINGS = { min_spo2: 90, max_spo2: 100, min_bpm: 55, max_bpm: 155 };

const payload = (over = {}) => ({
  date: '2026-08-17',
  window: { start: '2026-08-17T20:00', end: '2026-08-18T08:00', start_hour: 20, end_hour: 8 },
  vitals_summary: {
    sample_count: 10530, coverage_minutes: 702, window_minutes: 720,
    spo2: { min: 70, avg: 97, max: 100, time_below_90_minutes: 9.7 },
    heart_rate: { min: 58, avg: 80.9, max: 121 },
  },
  vitals_chart: [
    { ts: 1787011200, spo2: 100, hr: 86 },
    { ts: 1787014800, spo2: 70, hr: 96 },
  ],
  alerts: {
    total: 3, total_duration_minutes: 7.7, longest_duration_minutes: 3.5,
    items: [1, 2, 3].map((n, i) => ({
      start_time: `2026-08-18T0${3 + i}:13:00Z`, end_time: `2026-08-18T0${3 + i}:16:00Z`,
      duration_minutes: n, spo2_min: 80 + i * 5, spo2_max: 95, bpm_min: 70, bpm_max: 90,
      oxygen_used: false, oxygen_highest: null,
    })),
  },
  oxygen: { episodes: 0, total_minutes: 0, highest_flow: 0 },
  care_checklist: {
    medications: [
      { name: 'Briviact', scheduled_time: '9:00 PM', status: 'missed', administered_at: null },
      { name: 'Senna', scheduled_time: '11:00 PM', status: 'completed', administered_at: '11:04 PM' },
    ],
    care_tasks: [{ name: 'Nebulizer', scheduled_time: '9:00 PM', status: 'missed', completed_at: null }],
  },
  symptoms: [],
  compliance_pct: 33.3,
  ...over,
});

let body;
const calls = [];

beforeEach(() => {
  chartInstances.length = 0;
  calls.length = 0;
  navigate.mockClear();
  body = payload();
  vi.setSystemTime(new Date('2026-08-18T09:00:00'));
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/api/settings')) return { ok: true, json: async () => SETTINGS };
    return { ok: true, json: async () => body };
  }));
});

const setup = () => render(<AdminV2ReportsOvernight />);
const lastReportCall = () => calls.filter(u => u.includes('/reports/overnight')).pop();

describe('AdminV2ReportsOvernight', () => {
  it('opens on last night with the 8 PM–8 AM window', async () => {
    setup();
    await waitFor(() => expect(lastReportCall()).toBeTruthy());
    // 9 AM on the 18th is still reading the night of the 17th.
    expect(lastReportCall()).toContain('report_date=2026-08-17');
    expect(lastReportCall()).toContain('start_hour=20');
    expect(lastReportCall()).toContain('end_hour=8');
    expect(screen.getByText('Aug 17–18')).toBeInTheDocument();
    expect(document.querySelector('.rpt-window').textContent).toMatch(/8 PM–8 AM · 12-hour window/);
  });

  it('steps back a night and refuses to step past today', async () => {
    setup();
    await waitFor(() => expect(lastReportCall()).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Previous night'));
    await waitFor(() => expect(lastReportCall()).toContain('report_date=2026-08-16'));
    expect(screen.getByLabelText('Next night')).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText('Next night'));
    await waitFor(() => expect(lastReportCall()).toContain('report_date=2026-08-17'));
    fireEvent.click(screen.getByLabelText('Next night'));
    await waitFor(() => expect(screen.getByLabelText('Next night')).toBeDisabled());
  });

  it('reports the night in the strip, including sensor coverage', async () => {
    setup();
    await screen.findByText('Episodes');
    expect(screen.getByText('70')).toBeInTheDocument();      // nadir
    expect(screen.getByText('9.7m')).toBeInTheDocument();    // below 90%
    expect(screen.getByText('1/3')).toBeInTheDocument();     // care completed
    expect(screen.getByText('11h 42m')).toBeInTheDocument(); // coverage
    expect(screen.getByText('98%')).toBeInTheDocument();
  });

  it('marks the nadir red only because it went under the configured alarm', async () => {
    setup();
    await screen.findByText('Episodes');
    expect(document.querySelector('[data-stat="nadir"]').className).toContain('breach');
    // Care is short too, but adherence never gets red.
    const careTile = document.querySelector('[data-stat="care"]');
    expect(careTile.className).toContain('warn');
    expect(careTile.className).not.toContain('breach');
  });

  it('previews the episodes and expands to all of them', async () => {
    setup();
    await screen.findByText('Episodes');
    const table = document.querySelector('.rpt-table');
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2
    fireEvent.click(screen.getByText('Show all 3'));
    expect(within(document.querySelector('.rpt-table')).getAllByRole('row')).toHaveLength(4);
  });

  it('drops the event markers off the chart when they are switched off', async () => {
    setup();
    await screen.findByText('Episodes');
    // Identify the chart by what is on it, not by where it landed in the
    // construction order: indexing from the end raced the second chart's
    // creation and picked up an undefined under CI load.
    const annotated = () => chartInstances.filter(
      (c) => c.config?.options?.plugins?.annotation?.annotations?.alarm);
    await waitFor(() => expect(annotated().length).toBeGreaterThan(0));
    const annotations = () => {
      const charts = annotated();
      return charts[charts.length - 1].config.options.plugins.annotation.annotations;
    };
    expect(Object.keys(annotations()).some(k => k.startsWith('band'))).toBe(true);
    expect(annotations().alarm).toMatchObject({ yMin: 90 });
    fireEvent.click(screen.getByLabelText('Event markers'));
    await waitFor(() => expect(Object.keys(annotations()).some(k => k.startsWith('band'))).toBe(false));
    // The alarm line is not a marker — it stays.
    expect(annotations().alarm).toMatchObject({ yMin: 90 });
  });

  it('opens a checklist group to the items behind the count', async () => {
    setup();
    await screen.findByText('Care checklist');
    expect(screen.queryByText('Briviact')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Medications'));
    expect(screen.getByText('Briviact')).toBeInTheDocument();
    expect(screen.getByText('11:04 PM')).toBeInTheDocument(); // given, not "completed"
    expect(screen.getByText(/Scheduled at 9:00 PM and 11:00 PM/)).toBeInTheDocument();
  });

  it('copies a handoff when the device cannot share', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    setup();
    await screen.findByText('Share handoff');
    fireEvent.click(screen.getByText('Share handoff'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0];
    expect(text).toContain('Elijah Carty · Overnight Aug 17–18 · 8 PM–8 AM');
    expect(text).toContain('Alert episodes: 3');
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
  });

  it('uses the share sheet when there is one', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { share });
    setup();
    await screen.findByText('Share handoff');
    fireEvent.click(screen.getByText('Share handoff'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0][0].text).toContain('Sensor coverage: 11h 42m of 12h (98%)');
  });

  it('sends the timeline to the same night', async () => {
    setup();
    await screen.findByText('View timeline');
    fireEvent.click(screen.getByText('View timeline'));
    expect(navigate).toHaveBeenCalledWith('/care/monitoring/timeline?date=2026-08-17');
  });

  it('narrows the window from the settings sheet', async () => {
    setup();
    await screen.findByText('Episodes');
    fireEvent.click(screen.getByLabelText('Report settings'));
    const sheet = await waitFor(() => {
      const el = document.querySelector('.vc-sheet');
      if (!el) throw new Error('sheet not open');
      return el;
    });
    fireEvent.change(within(sheet).getByLabelText('Window start'), { target: { value: '22' } });
    await waitFor(() => expect(lastReportCall()).toContain('start_hour=22'));
    expect(screen.getByText(/10 PM–8 AM/)).toBeInTheDocument();
  });

  it('says the window was empty rather than drawing nothing', async () => {
    body = payload({ vitals_chart: [], vitals_summary: {}, alerts: { total: 0, total_duration_minutes: 0, longest_duration_minutes: 0, items: [] } });
    setup();
    expect(await screen.findByText('No pulse-ox readings in this window')).toBeInTheDocument();
  });

  it('shows an episode with no end time without inventing a duration', async () => {
    body = payload({
      alerts: {
        total: 2, total_duration_minutes: 3, longest_duration_minutes: 3, unclosed: 1,
        items: [
          { start_time: '2026-08-18T03:13:00Z', end_time: '2026-08-18T03:16:00Z',
            duration_minutes: 3, spo2_min: 88, spo2_max: 95, bpm_min: 70, bpm_max: 90,
            oxygen_used: false, oxygen_highest: null, unclosed: false },
          { start_time: '2026-08-19T03:06:00Z', end_time: null,
            duration_minutes: null, spo2_min: 81, spo2_max: 95, bpm_min: 70, bpm_max: 90,
            oxygen_used: false, oxygen_highest: null, unclosed: true },
        ],
      },
    });
    setup();
    // Both episodes listed, and the total says what it left out rather than
    // quietly reading as the whole night.
    expect(await screen.findByText(/2 episodes/)).toBeInTheDocument();
    expect(screen.getByText(/1 still open, not counted in the time/)).toBeInTheDocument();
  });

  it('marks an episode whose end was worked out after the fact', async () => {
    body = payload({
      alerts: {
        total: 2, total_duration_minutes: 4, longest_duration_minutes: 3, inferred: 1,
        items: [
          { start_time: '2026-08-18T03:13:00Z', end_time: '2026-08-18T03:16:00Z',
            duration_minutes: 3, spo2_min: 88, spo2_max: 95, bpm_min: 70, bpm_max: 90,
            oxygen_used: false, oxygen_highest: null, unclosed: false, end_inferred: false },
          { start_time: '2026-08-19T03:06:00Z', end_time: '2026-08-19T03:07:00Z',
            duration_minutes: 1, spo2_min: 81, spo2_max: 95, bpm_min: 70, bpm_max: 90,
            oxygen_used: false, oxygen_highest: null, unclosed: false,
            end_inferred: true, end_source: 'inferred_monitoring_ended' },
        ],
      },
    });
    setup();
    // It counts toward the total, but the reader is told the number is an
    // estimate and why.
    expect(await screen.findByText(/1 ended by inference/)).toBeInTheDocument();
    const estimated = screen.getByTitle(/the sensor stopped reporting/i);
    expect(estimated.textContent).toMatch(/^\u2248/);
  });

  it('surfaces a failed report', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/settings')) return { ok: true, json: async () => SETTINGS };
      return { ok: false, status: 500, json: async () => ({ detail: 'Overnight failed' }) };
    }));
    setup();
    expect(await screen.findByText('Overnight failed')).toBeInTheDocument();
  });
});
