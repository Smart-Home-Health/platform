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
// Recorded vitals at both dock sizes: latest-per-vital when narrow, one metric
// charted when wide.
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModalDockProvider } from '../../contexts/ModalDockContext';
import VitalsHistoryPanel from './VitalsHistoryPanel';

vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return { ...actual, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 260 }}>{children}</div> };
});

const TYPES = ['heart_rate', 'blood_pressure', 'spo2', 'patient_id'];

const ROWS = {
  blood_pressure: [
    { timestamp: '2026-08-06T18:20:00Z', vital_type: 'blood_pressure', systolic: 97, diastolic: 56, map: 70, source: 'manual', notes: '' },
    { timestamp: '2026-07-23T18:20:00Z', vital_type: 'blood_pressure', systolic: 124, diastolic: 71, map: 89, source: 'manual', notes: 'Seated' },
  ],
  heart_rate: [{ id: 1, timestamp: '2026-08-17T21:25:10Z', vital_type: 'heart_rate', value: 100, source: 'pulse_ox', notes: null }],
  spo2: [{ id: 2, timestamp: '2026-08-17T21:25:10Z', vital_type: 'spo2', value: 95, source: 'pulse_ox', notes: null }],
  patient_id: [{ id: 3, timestamp: '2026-05-13T04:28:12Z', vital_type: 'patient_id', value: 2, source: 'manual', notes: null }],
};

const route = (url) => {
  if (url.includes('/api/vitals/types')) return TYPES;
  const m = /vital_type=([^&]+)/.exec(url);
  if (m) return ROWS[decodeURIComponent(m[1])] || [];
  return [];
};

let fetchMock;
const stubFetch = (fn) => { fetchMock = vi.fn(fn); vi.stubGlobal('fetch', fetchMock); };

beforeEach(() => {
  stubFetch((url) => Promise.resolve({ ok: true, json: () => Promise.resolve(route(String(url))) }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const show = (expanded, setExpanded = vi.fn()) =>
  render(
    <ModalDockProvider value={{ docked: true, expanded, toggleExpand: vi.fn(), setExpanded }}>
      <VitalsHistoryPanel patientId={2} />
    </ModalDockProvider>
  );

describe('VitalsHistoryPanel', () => {
  it('narrow shows the latest reading of each vital', async () => {
    const { container } = show(false);
    await waitFor(() => expect(screen.getByText('Blood pressure')).toBeInTheDocument());
    // Value and unit are separate spans, so read the cell rather than the text.
    await waitFor(() => {
      const values = [...container.querySelectorAll('.vh-card-value')].map(n => n.textContent);
      expect(values).toEqual(['97/56mmHg', '95%', '100BPM', '2']);
    });
  });

  it('narrow orders known vitals clinically and junk last', async () => {
    const { container } = show(false);
    await waitFor(() => expect(container.querySelectorAll('.vh-card').length).toBe(4));
    const labels = [...container.querySelectorAll('.vh-card-label')].map(n => n.textContent.replace('Unknown', ''));
    expect(labels).toEqual(['Blood pressure', 'SpO₂', 'Heart rate', 'Patient Id']);
  });

  it('narrow flags an unrecognised type instead of hiding it', async () => {
    show(false);
    await waitFor(() => expect(screen.getByText('Unknown')).toBeInTheDocument());
    expect(screen.getByText(/not a\s+recognised measurement/)).toBeInTheDocument();
  });

  it('narrow asks per vital type, so a rare vital is not truncated away', async () => {
    show(false);
    await waitFor(() => expect(screen.getByText('97/56')).toBeInTheDocument());
    const urls = fetchMock.mock.calls.map(c => String(c[0]));
    for (const t of TYPES) expect(urls.some(u => u.includes(`vital_type=${t}`))).toBe(true);
  });

  it('narrow does not fetch a chart it will not draw', async () => {
    show(false);
    await waitFor(() => expect(screen.getByText('97/56')).toBeInTheDocument());
    expect(fetchMock.mock.calls.map(c => String(c[0])).some(u => u.includes('start_date='))).toBe(false);
  });

  it('tapping a card expands to that metric', async () => {
    const setExpanded = vi.fn();
    show(false, setExpanded);
    await waitFor(() => expect(screen.getByText('Heart rate')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Heart rate').closest('.vh-card'));
    expect(setExpanded).toHaveBeenCalledWith(true);
  });

  it('wide charts one metric with range tabs and the readings behind it', async () => {
    const { container } = show(true);
    await waitFor(() => expect(container.querySelectorAll('.vh-tab').length).toBe(4));
    expect([...container.querySelectorAll('.vh-range')].map(n => n.textContent)).toEqual(['24H', '7D', '30D', '90D']);
    await waitFor(() => expect(container.querySelectorAll('.vh-table tbody tr').length).toBe(2));
    expect(screen.getByText('Seated')).toBeInTheDocument();
  });

  it('wide gives blood pressure its three series and a MAP column', async () => {
    const { container } = show(true);
    await waitFor(() => expect(container.querySelectorAll('.vh-table tbody tr').length).toBe(2));
    expect([...container.querySelectorAll('.vh-legend-item')].map(n => n.textContent))
      .toEqual(['Systolic', 'MAP', 'Diastolic']);
    // "MAP" is both a legend entry and a table column; the column is the claim.
    expect([...container.querySelectorAll('.vh-table th')].map(n => n.textContent))
      .toContain('MAP');
  });

  it('wide refetches when the range changes', async () => {
    const { container } = show(true);
    await waitFor(() => expect(container.querySelectorAll('.vh-range').length).toBe(4));
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByText('90D'));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it('shows the reading provenance rather than assuming manual', async () => {
    const { container } = show(true);
    await waitFor(() => expect(container.querySelectorAll('.vh-tab').length).toBe(4));
    fireEvent.click(screen.getByText('HR'));
    await waitFor(() => expect(container.querySelector('.vh-src[data-source="pulse_ox"]')).toBeTruthy());
  });

  it('does not ask for vital ranges — they are entry bounds, not targets', async () => {
    show(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.map(c => String(c[0])).some(u => u.includes('/vitals/ranges'))).toBe(false);
  });

  it('has no add control — recording lives in Capture Vitals', async () => {
    show(true);
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
    expect(screen.queryByText(/add vitals/i)).not.toBeInTheDocument();
  });

  it('says so when a metric has nothing in the selected range', async () => {
    stubFetch((url) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes('start_date=') ? [] : route(String(url))),
    }));
    show(true);
    await waitFor(() => expect(screen.getByText(/Nothing recorded in the last 30 days/)).toBeInTheDocument());
  });
});
