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
import AdminV2Medications from './AdminV2Medications';
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
  it('records a scheduled diaper check as a check outcome', async () => {
    const time = new Date().toISOString();
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      calls.push([url, options]);
      return { ok: true, status: 200, json: async () => url.includes('/api/schedule/daily')
        ? { nutrition: [{ schedule_id: 23, scheduled_time: time, name: 'Afternoon check', row_kind: 'diaper_check' }] }
        : {} };
    }));
    await act(async () => { render(<AdminV2NutritionSchedule />); });
    fireEvent.click(screen.getByRole('button', { name: 'Record check' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Checked dry' })); });
    const writes = calls.filter(([, options]) => options.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain('/api/schedule-manager/5/actions');
    expect(JSON.parse(writes[0][1].body)).toMatchObject({ action: 'dry', check_schedule_id: 23, check_scheduled_time: time });
  });

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

  it('shows a completed medication in its scheduled slot with the time it was given', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ scheduled_medications: [{
        medication_name: 'Afternoon medication', schedule_id: 8,
        scheduled_time: '2026-11-26T20:00:00Z', administered_at: '2026-11-26T19:59:00-05:00',
        dose_amount: 1, actual_dose: 1, is_completed: true, status: 'completed_late',
      }] }),
    });

    await act(async () => { render(<AdminV2MedicationsSchedule />); });
    const completed = screen.getByRole('button', { name: /Completed 1/ });
    fireEvent.click(completed);
    expect(screen.getByText('15:00')).toBeInTheDocument();
    expect(screen.getByText('Taken at 7:59 PM')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take Now' })).not.toBeInTheDocument();
  });

  it('shows the last given date and time on the medication overview with a negative UTC offset', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        id: 8, name: 'Afternoon medication', last_administered: '2026-11-26T19:59:00-05:00',
      }],
    });
    await act(async () => { render(<AdminV2Medications />); });
    expect(screen.getByText('Last given').parentElement).toHaveTextContent(/Nov 26, 2026.*7:59 PM/);
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

  it.each([['Mark Complete', 'complete'], ['Skip', 'skip']])(
    'care tasks: %s records the selected patient and schedule slot',
    async (label, action) => {
      const scheduledTime = new Date().toISOString();
      fetch.mockImplementation(async (url) => ({
        ok: true,
        json: async () => url.includes('/care-tasks/day')
          ? { items: [{ name: 'Morning task', schedule_id: 8, scheduled_time: scheduledTime, status: 'due_on_time' }] }
          : {},
      }));
      await act(async () => { render(<AdminV2CareTasksSchedule />); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: label })); });
      const [, request] = fetch.mock.calls.find(([url]) => url.endsWith(`/care-task-schedules/8/${action}`));
      expect(JSON.parse(request.body)).toMatchObject({ patient_id: 5, scheduled_time: scheduledTime });
    },
  );

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
