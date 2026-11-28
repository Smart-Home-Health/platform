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
// Every schedule surface with NO patient selected must render the
// select-a-patient prompt, never crash. Regression guard for a blank page on
// /care/schedule: the no-patient branch referenced a shadcn <Button> whose
// import had been removed, and only executed when nothing was selected.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { authCtx, patientCtx, route } = vi.hoisted(() => ({
  route: { search: '', setSearch: vi.fn() },
  authCtx: { user: { id: 1, is_system_admin: true, permissions: [] } },
  patientCtx: {
    selectedPatient: null,
    patients: [{ id: 5, first_name: 'Eli', last_name: 'Carty', is_active: true }],
    selectPatient: vi.fn(),
    loadingPatients: false,
  },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('../../contexts/AdminPatientContext', () => ({ useAdminPatient: () => patientCtx }));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(route.search), route.setSearch],
}));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch: (...a) => fetch(...a) }));

import AdminV2Schedule from './AdminV2Schedule';

beforeEach(() => {
  route.search = '';
  patientCtx.selectedPatient = null;
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});

it('loads only the linked patient when the session restores a different selection', async () => {
  route.search = 'patient=5';
  patientCtx.selectedPatient = { id: 9, first_name: 'Other' };
  await act(async () => { render(<AdminV2Schedule category="medications" />); });
  const reads = fetch.mock.calls.map(([url]) => new URL(url, 'http://test'))
    .filter(url => url.pathname === '/api/schedule/daily');
  expect(reads.map(url => url.searchParams.get('patient_id'))).toEqual(['5']);
  expect(patientCtx.selectPatient).toHaveBeenCalledWith(patientCtx.patients[0]);
  expect(route.setSearch).not.toHaveBeenCalled();
});

it('offers the picker without fetching the saved patient when the linked patient is unavailable', async () => {
  route.search = 'patient=999';
  patientCtx.selectedPatient = patientCtx.patients[0];
  await act(async () => { render(<AdminV2Schedule category="medications" />); });
  expect(screen.getByText('Eli Carty')).toBeInTheDocument();
  expect(fetch.mock.calls.some(([url]) => url.includes('/api/schedule/daily'))).toBe(false);
  expect(route.setSearch).not.toHaveBeenCalled();
});

describe.each([undefined, 'medications', 'care_tasks', 'nutrition'])('schedule %s with no patient selected', (category) => {
  it('offers the patient picker instead of crashing', async () => {
    await act(async () => { render(<AdminV2Schedule category={category} />); });
    // The picker opens as a hard gate on mount (Radix aria-hides the page
    // behind it), listing the patients to choose from.
    expect(document.querySelector('.em-panel')).toBeInTheDocument();
    expect(screen.getByText('Eli Carty')).toBeInTheDocument();
  });
});
