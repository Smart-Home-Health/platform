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
// AdminV2Vitals: the vitals HISTORY view — day-grouped reading cards.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

vi.mock('../../config', () => ({ default: { apiUrl: '' } }));

const { patientCtx } = vi.hoisted(() => ({
  patientCtx: { selectedPatient: { id: 5, first_name: 'Eli', last_name: 'Carty' } },
}));
vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => patientCtx,
}));

import AdminV2Vitals from './AdminV2Vitals';

const jsonResponse = (body) => ({ ok: true, status: 200, json: async () => body });

// Suite runs under TZ=America/New_York (vitest setup), so these are all
// mid-afternoon local and cannot slide across a day boundary.
const READINGS = [
  { id: 1, vital_type: 'respiratory_rate', value: 17, timestamp: '2026-08-19T18:22:00Z', source: 'manual' },
  { id: 2, vital_type: 'blood_pressure', systolic: 118, diastolic: 74, timestamp: '2026-08-19T17:04:00Z', source: 'device', notes: 'Left arm' },
  { id: 3, vital_type: 'spo2', value: 97, timestamp: '2026-08-17T17:24:00Z', source: 'pulse_ox' },
];

let lastUrl = '';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-30T16:00:00Z'));
  lastUrl = '';
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    lastUrl = url;
    if (url.includes('/api/vitals/custom-definitions')) {
      return jsonResponse([{ id: 9, name: 'peak_flow', unit: 'L/min', display_label: 'Peak flow' }]);
    }
    return jsonResponse(READINGS);
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AdminV2Vitals history', () => {
  it('renders readings as day-grouped rows rather than a table', async () => {
    await act(async () => { render(<AdminV2Vitals />); });

    expect(document.querySelector('table')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.vhist-row')).toHaveLength(3);

    // Two day sections, newest first, each with its own reading count.
    const days = [...document.querySelectorAll('.vhist-day')].map(d => d.textContent);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatch(/Wed · Aug 19/);
    expect(days[0]).toMatch(/2 readings/);
    expect(days[1]).toMatch(/1 reading$/);

    // Scoped to the rows: 'Blood Pressure' is also a filter chip.
    const types = [...document.querySelectorAll('.vhist-row-type')].map(t => t.textContent);
    expect(types).toEqual(['Respiratory Rate', 'Blood Pressure', 'SpO2']);
    expect(screen.getByText(/^118\/74/)).toBeInTheDocument();
    expect(screen.getByText('Left arm')).toBeInTheDocument();
    // Source identifiers read as words on the badge.
    expect(screen.getByText('pulse ox')).toBeInTheDocument();
  });

  it('summarises the loaded readings', async () => {
    await act(async () => { render(<AdminV2Vitals />); });

    const stats = [...document.querySelectorAll('.vhist-stat')].map(s => s.textContent);
    expect(stats[0]).toMatch(/Readings3/);
    expect(stats[1]).toMatch(/Types3/);
  });

  it('offers a chip per vital type, custom definitions included, and filters by it', async () => {
    await act(async () => { render(<AdminV2Vitals />); });

    expect(screen.getByRole('button', { name: 'Peak flow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Heart Rate' })); });
    expect(lastUrl).toContain('vital_type=heart_rate');

    // Clicking the active chip clears it again.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Heart Rate' })); });
    expect(lastUrl).not.toContain('vital_type=');
  });

  it('keeps the date range folded away until the calendar button is pressed', async () => {
    await act(async () => { render(<AdminV2Vitals />); });

    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Date range' })); });

    const from = document.querySelector('#vitals-hist-from');
    expect(from).toBeInTheDocument();
    await act(async () => { fireEvent.change(from, { target: { value: '2026-08-18' } }); });
    expect(lastUrl).toContain('start_date=2026-08-18');
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('shows the sidebar empty state without a selected patient', async () => {
    patientCtx.selectedPatient = null;
    await act(async () => { render(<AdminV2Vitals />); });
    expect(screen.getByText(/select a patient from the sidebar/i)).toBeInTheDocument();
    patientCtx.selectedPatient = { id: 5, first_name: 'Eli', last_name: 'Carty' };
  });
});
