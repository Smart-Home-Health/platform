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

const { authCtx, patientCtx } = vi.hoisted(() => ({
  authCtx: { user: { id: 1, is_system_admin: true, permissions: [] } },
  patientCtx: {
    selectedPatient: null,
    patients: [{ id: 5, first_name: 'Eli', last_name: 'Carty', is_active: true }],
    selectPatient: () => {},
    loadingPatients: false,
  },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('../../contexts/AdminPatientContext', () => ({ useAdminPatient: () => patientCtx }));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), () => {}],
}));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch: (...a) => fetch(...a) }));

import AdminV2Schedule from './AdminV2Schedule';
import AdminV2MedicationsSchedule from './AdminV2MedicationsSchedule';
import AdminV2CareTasksSchedule from './AdminV2CareTasksSchedule';
import AdminV2NutritionSchedule from './AdminV2NutritionSchedule';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});

const PAGES = [
  ['AdminV2Schedule', AdminV2Schedule],
  ['AdminV2MedicationsSchedule', AdminV2MedicationsSchedule],
  ['AdminV2CareTasksSchedule', AdminV2CareTasksSchedule],
  ['AdminV2NutritionSchedule', AdminV2NutritionSchedule],
];

describe.each(PAGES)('%s with no patient selected', (_name, Page) => {
  it('offers the patient picker instead of crashing', async () => {
    await act(async () => { render(<Page />); });
    // The picker opens as a hard gate on mount (Radix aria-hides the page
    // behind it), listing the patients to choose from.
    expect(document.querySelector('.em-panel')).toBeInTheDocument();
    expect(screen.getByText('Eli Carty')).toBeInTheDocument();
  });
});
