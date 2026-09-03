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
// The three per-domain schedule pages after moving off shadcn: stat tiles are
// cfg-stat filter buttons, the off-window confirm is a ConfirmSheet, and the
// nutrition PRN picker is an EntityModal. ScheduleBoard itself is unchanged.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const { authCtx, patientCtx } = vi.hoisted(() => ({
  authCtx: { user: { id: 1, is_system_admin: true, permissions: [] } },
  patientCtx: {
    selectedPatient: { id: 5, first_name: 'Eli', last_name: 'Carty' },
    patients: [{ id: 5, first_name: 'Eli', last_name: 'Carty' }],
    selectPatient: () => {},
    loadingPatients: false,
  },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authCtx }));
vi.mock('../../contexts/AdminPatientContext', () => ({ useAdminPatient: () => patientCtx }));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams('patient=5'), () => {}],
}));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch: (...a) => fetch(...a) }));

import AdminV2MedicationsSchedule from './AdminV2MedicationsSchedule';
import AdminV2CareTasksSchedule from './AdminV2CareTasksSchedule';
import AdminV2NutritionSchedule from './AdminV2NutritionSchedule';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({}),
  })));
});

const expectVcChrome = () => {
  expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
  expect(document.querySelector('.admin-v2-stat-card')).not.toBeInTheDocument();
  expect(document.querySelector('.admin-v2-page-header')).not.toBeInTheDocument();
};

describe('schedule pages on the vc chassis', () => {
  it('medications: cfg-stat tiles toggle their filters, no shadcn left', async () => {
    await act(async () => { render(<AdminV2MedicationsSchedule />); });
    expectVcChrome();

    const ready = screen.getByRole('button', { name: /Ready/ });
    expect(ready).toHaveClass('cfg-stat');
    expect(ready).toHaveAttribute('aria-pressed', 'true');
    await act(async () => { fireEvent.click(ready); });
    expect(ready).toHaveAttribute('aria-pressed', 'false');
    // Completed starts unselected on this page.
    expect(screen.getByRole('button', { name: /Completed/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('care tasks: a multi-status tile toggles all of its keys together', async () => {
    await act(async () => { render(<AdminV2CareTasksSchedule />); });
    expectVcChrome();

    // Six tiles: Ready, Upcoming, Missed, Completed, Skipped, PRN.
    expect(document.querySelectorAll('button.cfg-stat').length).toBe(6);
    const upcoming = screen.getByRole('button', { name: /Upcoming/ });
    expect(upcoming).toHaveAttribute('aria-pressed', 'true');
    await act(async () => { fireEvent.click(upcoming); });
    expect(upcoming).toHaveAttribute('aria-pressed', 'false');
    await act(async () => { fireEvent.click(upcoming); });
    expect(upcoming).toHaveAttribute('aria-pressed', 'true');
  });

  it('nutrition: the PRN picker opens as EntityModal choices, not a shadcn dialog', async () => {
    await act(async () => { render(<AdminV2NutritionSchedule />); });
    expectVcChrome();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'PRN' })); });
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
    expect(document.querySelector('.em-panel')).toBeInTheDocument();
    const choices = document.querySelectorAll('.em-panel .sch-choice');
    expect(choices.length).toBe(2);
    expect(choices[0]).toHaveTextContent('Log Intake');
  });
});
