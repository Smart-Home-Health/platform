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
// The day-analysis panel at its two sizes. The size comes from the dock, not
// the viewport, so these render the same component under both dock values.
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModalDockProvider } from '../../contexts/ModalDockContext';
import AlertsHistory from './AlertsHistory';

// recharts needs a real box to lay out in; jsdom reports zero.
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return { ...actual, ResponsiveContainer: ({ children }) => <div style={{ width: 400, height: 120 }}>{children}</div> };
});

const DATES = { dates: ['2026-08-18', '2026-08-17'] };

const ANALYSIS = {
  date: '2026-08-18',
  total_readings: 100,
  valid_spo2_readings: 100,
  valid_bpm_readings: 100,
  error_spo2_readings: 0,
  error_bpm_readings: 0,
  time_logged_minutes: 181,
  time_logged_hours: 3.02,
  avg_spo2: 98.2, min_spo2: 91, max_spo2: 100,
  avg_bpm: 88.2, min_bpm: 74, max_bpm: 121,
  spo2_distribution: {
    high_90s_97_plus: { count: 80, percentage: 80 },
    mid_90s_94_96: { count: 17, percentage: 17 },
    low_90s_90_93: { count: 3, percentage: 3 },
    high_eighties_85_89: { count: 0, percentage: 0 },
    low_eighties_80_84: { count: 0, percentage: 0 },
    seventies_70_79: { count: 0, percentage: 0 },
    sixties_60_69: { count: 0, percentage: 0 },
    fifties_50_59: { count: 0, percentage: 0 },
    forties_40_49: { count: 0, percentage: 0 },
    thirties_30_39: { count: 0, percentage: 0 },
    twenties_20_29: { count: 0, percentage: 0 },
    below_twenty: { count: 0, percentage: 0 },
    zero_errors: { count: 0, percentage: 0 },
  },
};

const T0 = Date.UTC(2026, 7, 18, 14, 0, 0);
const RAW = {
  readings: [
    { timestamp: new Date(T0).toISOString(), spo2: 98, bpm: 85 },
    { timestamp: new Date(T0 + 2000).toISOString(), spo2: 92, bpm: 94 },
    { timestamp: new Date(T0 + 4000).toISOString(), spo2: 91, bpm: 96 },
    { timestamp: new Date(T0 + 6000).toISOString(), spo2: 98, bpm: 86 },
    { timestamp: new Date(T0 + 8000).toISOString(), spo2: 87, bpm: 110 },
    { timestamp: new Date(T0 + 10000).toISOString(), spo2: 99, bpm: 84 },
  ],
};

const route = (url) => {
  if (url.includes('/api/settings')) return { min_spo2: 90 };
  if (url.includes('/history/dates')) return DATES;
  if (url.includes('/history/analyze/')) return ANALYSIS;
  if (url.includes('/history/raw/')) return RAW;
  return {};
};

let fetchMock;
const stubFetch = (fn) => { fetchMock = vi.fn(fn); vi.stubGlobal('fetch', fetchMock); };

beforeEach(() => {
  stubFetch((url) => Promise.resolve({ ok: true, json: () => Promise.resolve(route(String(url))) }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const show = (expanded) =>
  render(
    <ModalDockProvider value={{ docked: true, expanded, toggleExpand: vi.fn(), setExpanded: vi.fn() }}>
      <AlertsHistory patientId={2} />
    </ModalDockProvider>
  );

describe('AlertsHistory', () => {
  it('shows the day rollup at both sizes', async () => {
    show(false);
    await waitFor(() => expect(screen.getByText('Coverage')).toBeInTheDocument());
    expect(screen.getByText('3h 01m')).toBeInTheDocument();
    expect(screen.getByText('Range 91-100%')).toBeInTheDocument();
  });

  it('narrow draws the traces, the coverage strip and the episodes', async () => {
    const { container } = show(false);
    await waitFor(() => expect(screen.getByText('Oxygen + heart rate')).toBeInTheDocument());
    expect(container.querySelectorAll('.ah-chart')).toHaveLength(2);
    expect(container.querySelectorAll('.ah-cov-slot').length).toBeGreaterThan(0);
    expect(screen.getByText('At a glance')).toBeInTheDocument();
    // Two dips: 92→91 recovers, then a single reading at 87.
    expect(container.querySelectorAll('.ah-ep')).toHaveLength(2);
  });

  it('narrow folds the thirteen buckets into five bands', async () => {
    const { container } = show(false);
    await waitFor(() => expect(screen.getByText('At a glance')).toBeInTheDocument());
    expect(container.querySelectorAll('.ah-dist-row')).toHaveLength(5);
    expect(screen.getByText('Below 90%')).toBeInTheDocument();
  });

  it('wide keeps the analyzer resolution and drops the narrow-only blocks', async () => {
    const { container } = show(true);
    await waitFor(() => expect(container.querySelectorAll('.ah-dist-row').length).toBe(13));
    expect(screen.queryByText('Oxygen + heart rate')).not.toBeInTheDocument();
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();
    expect(container.querySelector('.ah-panel.wide')).toBeTruthy();
  });

  it('does not fetch the raw readings it will not draw', async () => {
    show(true);
    // Wait for the call being asserted, not for any call: the component fires
    // several and the first to land is not reliably this one.
    await waitFor(() => expect(
      fetchMock.mock.calls.some(c => String(c[0]).includes('/history/analyze/')),
    ).toBe(true));
    const urls = fetchMock.mock.calls.map(c => String(c[0]));
    expect(urls.some(u => u.includes('/history/raw/'))).toBe(false);
  });

  it('marks only the dip past the configured alarm threshold as alert level', async () => {
    const { container } = show(false);
    await waitFor(() => expect(container.querySelectorAll('.ah-ep')).toHaveLength(2));
    const tones = [...container.querySelectorAll('.ah-ep')].map(e => e.className);
    expect(tones[0]).toContain('ah-tone-due');
    expect(tones[1]).toContain('ah-tone-alert');
    expect(screen.getByText('1 alert-level')).toBeInTheDocument();
  });

  it('scopes every request to the patient', async () => {
    show(false);
    await waitFor(() => expect(screen.getByText('At a glance')).toBeInTheDocument());
    const monitoring = fetchMock.mock.calls
      .map(c => String(c[0])).filter(u => u.includes('/api/monitoring/'));
    expect(monitoring.length).toBeGreaterThan(0);
    expect(monitoring.every(u => u.includes('patient_id=2'))).toBe(true);
  });

  it('reports a failed load instead of rendering an empty day', async () => {
    stubFetch((url) => String(url).includes('/history/analyze/')
      ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
      : Promise.resolve({ ok: true, json: () => Promise.resolve(route(String(url))) }));
    show(false);
    await waitFor(() => expect(screen.getByText('Failed to load analysis data')).toBeInTheDocument());
  });

  it('says so when the patient has no recorded days at all', async () => {
    stubFetch((url) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes('/history/dates') ? { dates: [] } : route(String(url))),
    }));
    show(false);
    await waitFor(() => expect(screen.getByText('No pulse oximetry data recorded')).toBeInTheDocument());
  });
});
